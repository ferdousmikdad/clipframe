// Rendering with headless Chrome: serve the project and Clipframe's render page on localhost, open it in
// Chrome (installed Chrome, Edge, or Playwright's Chromium) and stream the encoded file back to disk.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, closeSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve, sep, basename } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { Project } from "../schema/index.js";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version;

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

export type RenderJob = {
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

/**
 * Render a project with headless Chrome running Clipframe's browser exporter, writing `job.out`.
 * Throws on failure (and leaves no partial file behind).
 */
export async function renderProject(job: RenderJob & { quiet?: boolean }): Promise<void> {
  const pagePath = join(ROOT, "dist/cli/page.js");
  if (!existsSync(pagePath)) throw new Error("the render page is missing (dist/cli/page.js). Run `npm run build` in the clipframe folder.");
  const log = (s: string) => void (job.quiet ? undefined : process.stderr.write(s));
  let pw: typeof import("playwright-core");
  try {
    pw = await import("playwright-core");
  } catch {
    throw new Error("rendering needs playwright-core: npm i playwright-core");
  }
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
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ...rest, plugins, debug: !!process.env.CLIPFRAME_DEBUG }));
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
      } else if (p === "/__debug" && req.method === "POST") {
        // CLIPFRAME_DEBUG=1: keep the SVG of each HTML frame next to the output, for inspecting
        const file = `${job.out}.${(url.searchParams.get("id") ?? "html").replace(/[^\w-]/g, "_")}.svg`;
        writeFileSync(file, await body(req));
        res.writeHead(204).end();
      } else if (p === "/__progress" && req.method === "POST") {
        const prog = JSON.parse((await body(req)).toString()) as { frame: number; total: number; etaSeconds: number; stage: string };
        if (prog.stage === "video" && !job.quiet) bar(prog.frame, prog.total, prog.etaSeconds);
        else if (prog.stage === "audio") log("  preparing sound and media…\n");
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
    throw new Error(`no browser to render with. Install Google Chrome, or run \`npx playwright install chromium\`, or pass --browser <path>.\n  ${errors.join("\n  ")}`);
  }
  const pageErrors: string[] = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (e) => (pageErrors.push(e.message), log(`\n  page error: ${e.message}\n`)));
    page.on("console", (m) => {
      if (m.type() === "error") log(`\n  browser: ${m.text()}\n`);
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await page.waitForFunction(() => window.__clipframe?.done === true, null, { timeout: 0, polling: 200 });
    const result = await page.evaluate(() => window.__clipframe);
    if (result?.error) throw new Error(result.error);
  } catch (e) {
    failed = true;
    throw e;
  } finally {
    await browser.close();
    server.close();
    closeSync(fd);
    if (process.stderr.isTTY && !job.quiet) process.stderr.write("\n");
    if (failed) rmSync(part, { force: true });
    else renameSync(part, job.out);
  }
}

declare global {
  interface Window {
    __clipframe?: { done: boolean; error?: string };
  }
}

