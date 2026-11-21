// clipframe CLI: render a project.json to MP4 / PNG with headless Chrome, validate projects, list blocks.
import { existsSync, readFileSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { renderProject, ROOT, VERSION } from "./render.js";
import { runMcpServer } from "./mcp.js";
import { createBuiltinRegistry, compactBlockList, describeBlock } from "../blocks/index.js";
import { projectDuration, projectJsonSchema, validateProject, type Project } from "../schema/index.js";


const HELP = `clipframe ${VERSION} — JSON in, video out.

Usage
  clipframe render <project.json> [-o out.mp4] [options]   Render to MP4 (H.264 + AAC)
  clipframe still  <project.json> [-t 2.5] [-o frame.png]  Render one frame
  clipframe validate <project.json> [--blocks my.js]       Check a project
  clipframe blocks [block-id]                              List blocks, or describe one
  clipframe schema                                         Print the project JSON Schema
  clipframe init [folder]                                  Start a new project from an example
  clipframe mcp                                            Run the MCP server (Claude, Cursor, other AI apps)

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
    case "mcp":
      return runMcpServer();
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
      await renderProject({
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
