// clipframe CLI: render a project.json to MP4 / PNG with headless Chrome, validate projects, list blocks.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, closeSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import type { AddressInfo } from "node:net";
import { createBuiltinRegistry, compactBlockList, describeBlock } from "../blocks/index.js";
import { projectDuration, projectJsonSchema, validateProject, type Project } from "../schema/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version;

const HELP = `clipframe ${VERSION} — JSON in, video out.

Usage
  clipframe render <project.json> [-o out.mp4] [options]   Render to MP4 (H.264 + AAC)
  clipframe still  <project.json> [-t 2.5] [-o frame.png]  Render one frame
  clipframe validate <project.json> [--blocks my.js]       Check a project
  clipframe blocks [block-id]                              List blocks, or describe one
  clipframe schema                                         Print the project JSON Schema
  clipframe init [folder]                                  Start a new project from an example

Render options
  -o, --out <file>          Output file (default: <project name>.mp4 next to the project)
  --resolution 720p|1080p   Default: the project's meta.resolution
  --fps 30|60               Default: the project's meta.fps
  --quality standard|high   Default: high
  --from <s> --to <s>       Only part of the video
  --blocks <file.js>        Add your own blocks (repeatable)
  --browser <path>          Chrome / Chromium to use (default: installed Chrome, then Playwright's Chromium)
  --headed                  Show the browser window

Assets in project.json are read relative to the project file's folder.`;

const MIME: Record<string, string> = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
};

function fail(msg: string): never {
  process.stderr.write(`clipframe: ${msg}\n`);
  process.exit(1);
}

function readProject(file: string): Project {
  if (!file) fail("give a project.json file");
  const path = resolve(file);
  if (!existsSync(path)) fail(`no such file: ${file}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  return raw as Project;
}

function check(project: unknown, withPlugins: boolean): Project {
  const registry = createBuiltinRegistry();
  const res = validateProject(project, withPlugins ? undefined : (id) => registry.get(id));
  if (!res.ok) fail(`the project has problems:\n  ${res.errors.join("\n  ")}`);
  return res.project;
}

/** Serve one file inside `base` (no escaping it with ../), with byte ranges so <video> and mediabunny can seek. */
function serveFile(req: IncomingMessage, res: ServerResponse, base: string, rel: string) {
  const path = resolve(base, decodeURIComponent(rel));
  if (path !== base && !path.startsWith(base + sep)) return void res.writeHead(403).end();
  if (!existsSync(path) || !statSync(path).isFile()) {
    if (process.env.CLIPFRAME_DEBUG) process.stderr.write(`\n  404 ${path}\n`);
    return void res.writeHead(404).end();
  }
  const size = statSync(path).size;
  const type = MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1, "Accept-Ranges": "bytes" });
    createReadStream(path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
    createReadStream(path).pipe(res);
  }
}

function body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok, bad) => {
    const parts: Buffer[] = [];
    req.on("data", (c: Buffer) => parts.push(c));
    req.on("end", () => ok(Buffer.concat(parts)));
    req.on("error", bad);
  });
}

function bar(frame: number, total: number, eta: number) {
  const w = 28;
  const n = Math.round((frame / Math.max(1, total)) * w);
  const line = `  [${"█".repeat(n)}${"░".repeat(w - n)}] ${frame}/${total} frames · ${Math.ceil(eta)}s left `;
  if (process.stderr.isTTY) process.stderr.write(`\r${line}`);
}

type RenderJob = {
  mode: "render" | "still";
  project: Project;
  projectDir: string;
  out: string;
  plugins: string[];
  browser?: string;
  headed?: boolean;
  resolution?: string;
  fps?: number;
  quality?: string;
  range?: { start: number; end: number };
  time?: number;
  type?: string;
};

async function runInBrowser(job: RenderJob) {
  const pagePath = join(ROOT, "dist/cli/page.js");
  if (!existsSync(pagePath)) fail("the render page is missing (dist/cli/page.js). Run `npm run build` in the clipframe folder.");
  const part = job.out + ".part";
  rmSync(part, { force: true });
  const fd = openSync(part, "w");
  let failed = false;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const p = url.pathname;
    try {
      if (p === "/") {
        res.writeHead(200, { "Content-Type": "text/html" }).end(`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><title>clipframe render</title><script type="module" src="/__page.js"></script>`);
      } else if (p === "/__page.js") serveFile(req, res, dirname(pagePath), "page.js");
      else if (p === "/__job") {
        const plugins = job.plugins.map((_, i) => `/__plugins/${i}.js`);
        const { projectDir: _d, out: _o, plugins: _p, browser: _b, headed: _h, ...rest } = job;
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ...rest, plugins }));
      } else if (p.startsWith("/__fonts/")) serveFile(req, res, join(ROOT, "fonts"), p.slice(9));
      else if (p.startsWith("/__assets/")) serveFile(req, res, job.projectDir, p.slice(10));
      else if (p.startsWith("/__plugins/")) {
        const file = job.plugins[Number(p.slice(11).replace(/\.js$/, ""))];
        if (!file) return void res.writeHead(404).end();
        serveFile(req, res, dirname(file), basename(file));
      } else if (p === "/__out" && req.method === "POST") {
        const data = await body(req);
        writeSync(fd, data, 0, data.length, Number(url.searchParams.get("pos") ?? 0));
        res.writeHead(204).end();
      } else if (p === "/__progress" && req.method === "POST") {
        const prog = JSON.parse((await body(req)).toString()) as { frame: number; total: number; etaSeconds: number; stage: string };
        if (prog.stage === "video") bar(prog.frame, prog.total, prog.etaSeconds);
        else if (prog.stage === "audio") process.stderr.write("  preparing sound and media…\n");
        res.writeHead(204).end();
      } else {
        if (process.env.CLIPFRAME_DEBUG) process.stderr.write(`\n  404 ${p}\n`);
        res.writeHead(404).end();
      }
    } catch (e) {
      res.writeHead(500).end(String(e));
    }
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;

  let pw: typeof import("playwright-core");
  try {
    pw = await import("playwright-core");
  } catch {
    fail("rendering needs playwright-core: npm i playwright-core");
  }
  const tries: Parameters<typeof pw.chromium.launch>[0][] = job.browser
    ? [{ executablePath: job.browser }]
    : [{ channel: "chrome" }, { channel: "msedge" }, {}];
  let browser: Awaited<ReturnType<typeof pw.chromium.launch>> | undefined;
  const errors: string[] = [];
  for (const t of tries) {
    try {
      browser = await pw.chromium.launch({ ...t, headless: !job.headed, args: ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"] });
      break;
    } catch (e) {
      errors.push((e as Error).message.split("\n")[0]);
    }
  }
  if (!browser) {
    server.close();
    closeSync(fd);
    rmSync(part, { force: true });
    fail(`no browser to render with. Install Google Chrome, or run \`npx playwright install chromium\`, or pass --browser <path>.\n  ${errors.join("\n  ")}`);
  }
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => process.stderr.write(`\n  page error: ${e.message}\n`));
    page.on("console", (m) => {
      if (m.type() === "error") process.stderr.write(`\n  browser: ${m.text()}\n`);
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__clipframe?.done === true, null, { timeout: 0, polling: 200 });
    const result = await page.evaluate(() => window.__clipframe);
    if (result?.error) {
      failed = true;
      throw new Error(result.error);
    }
  } finally {
    await browser.close();
    server.close();
    closeSync(fd);
    if (process.stderr.isTTY) process.stderr.write("\n");
  }
  if (failed) rmSync(part, { force: true });
  else renameSync(part, job.out);
}

declare global {
  interface Window {
    __clipframe?: { done: boolean; error?: string };
  }
}

async function main(argv: string[]) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      time: { type: "string", short: "t" },
      resolution: { type: "string" },
      fps: { type: "string" },
      quality: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      blocks: { type: "string", multiple: true },
      browser: { type: "string" },
      headed: { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const [cmd, arg] = positionals;
  if (values.version) return void console.log(VERSION);
  if (values.help || !cmd || cmd === "help") return void console.log(HELP);

  const plugins = (values.blocks ?? []).map((f) => {
    const p = resolve(f);
    if (!existsSync(p)) fail(`no such blocks file: ${f}`);
    return p;
  });

  switch (cmd) {
    case "render":
    case "still": {
      const project = check(readProject(arg), plugins.length > 0);
      const projectDir = dirname(resolve(arg));
      const still = cmd === "still";
      const ext = still ? (values.out ? extname(values.out).toLowerCase() : ".png") : ".mp4";
      const out = resolve(values.out ?? join(projectDir, `${project.meta.name}${ext}`));
      if (values.resolution && !["720p", "1080p"].includes(values.resolution)) fail("--resolution must be 720p or 1080p");
      if (values.fps && !["30", "60"].includes(values.fps)) fail("--fps must be 30 or 60");
      if (values.quality && !["standard", "high"].includes(values.quality)) fail("--quality must be standard or high");
      const duration = projectDuration(project);
      const range = values.from || values.to ? { start: Number(values.from ?? 0), end: Number(values.to ?? duration) } : undefined;
      if (range && !(range.end > range.start)) fail("--to must be after --from");
      mkdirSync(dirname(out), { recursive: true });
      const t0 = Date.now();
      process.stderr.write(still ? `Rendering frame at ${Number(values.time ?? 0)}s…\n` : `Rendering ${project.meta.name} (${duration}s, ${values.resolution ?? project.meta.resolution} ${values.fps ?? project.meta.fps} fps)…\n`);
      await runInBrowser({
        mode: still ? "still" : "render",
        project,
        projectDir,
        out,
        plugins,
        browser: values.browser,
        headed: values.headed,
        resolution: values.resolution,
        fps: values.fps ? Number(values.fps) : undefined,
        quality: values.quality,
        range,
        time: Number(values.time ?? 0),
        type: { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[ext] ?? "image/png",
      });
      process.stderr.write(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${out}\n`);
      return;
    }
    case "validate": {
      check(readProject(arg), plugins.length > 0);
      return void console.log("✓ valid");
    }
    case "blocks": {
      const registry = createBuiltinRegistry();
      if (arg) {
        const def = registry.get(arg);
        if (!def) fail(`no block "${arg}". Run \`clipframe blocks\` to list them.`);
        return void console.log(describeBlock(def));
      }
      return void console.log(compactBlockList(registry));
    }
    case "schema":
      return void console.log(JSON.stringify(projectJsonSchema(), null, 2));
    case "init": {
      const dir = resolve(arg ?? "my-video");
      if (existsSync(dir) && readdirSync(dir).length) fail(`${dir} is not empty`);
      cpSync(join(ROOT, "examples/taskflow-promo"), dir, { recursive: true });
      console.log(`Created ${dir}\n\nNext:\n  clipframe render ${join(arg ?? "my-video", "project.json")}`);
      return;
    }
    default:
      fail(`unknown command "${cmd}". Run \`clipframe --help\`.`);
  }
}

main(process.argv.slice(2)).catch((e: Error) => fail(e.message));
