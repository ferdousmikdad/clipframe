// `clipframe mcp`: a Model Context Protocol server over stdio, so Claude (Code / Desktop), Cursor, Codex and
// other AI apps can make videos with Clipframe: read the guide, look up blocks, check a project, look at a
// rendered frame, and render the MP4. No dependencies: newline-delimited JSON-RPC 2.0 on stdin / stdout.
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { createBuiltinRegistry, compactBlockList, describeBlock } from "../blocks/index.js";
import { projectDuration, summary, validateProject, type Project } from "../schema/index.js";
import { renderProject, VERSION } from "./render.js";

type Json = Record<string, unknown>;
type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
type ToolResult = { content: Content[]; isError?: boolean };

export const MCP_INSTRUCTIONS = `Clipframe makes MP4 videos from a JSON project: scenes made of ready-made blocks (titles, UI mockups, cursor clicks, stats, pricing, testimonials, outros, video clips), HTML/CSS/Tailwind scenes, music, voice-over and sound effects. It is free and MIT licensed (no seat or render fees).
Workflow: call clipframe_guide once, write the project, call validate_project, call render_still at a few times to look at frames and fix what looks wrong, then render_video. Use save_project to keep the project as a file the user can edit.`;

const GUIDE = () => `# Making a video with Clipframe

A project is JSON:
{
  "version": 1,
  "meta": { "name": "launch", "format": "16:9", "fps": 30, "resolution": "1080p" },   // format: 16:9 | 9:16 | 1:1 | 4:5 | 4:3
  "theme": { "primary": "#7C3AED", "secondary": "#22D3EE", "background": "#0B0B12", "text": "#FFFFFF", "font": "Inter", "radius": 16 },
  "assets": [ { "id": "shot", "type": "image", "file": "assets/dashboard.png" } ],    // image | video | audio; file relative to assets_dir / the project file
  "scenes": [ { "id": "s1", "block": "title-reveal", "duration": 3, "props": { "title": "Hello" } },
              { "id": "s2", "block": "ui-mockup", "duration": 4, "props": { "asset": "shot" }, "transition": { "type": "slide", "duration": 0.5 } } ],
  "overlays": [ { "id": "o1", "block": "lower-third", "start": 1, "end": 4, "props": { "title": "Sam Rivera" } } ],
  "audio": { "music": "song", "volume": 0.7, "fadeOut": 1.5, "duck": 0.3 },              // optional
  "sounds": [ { "t": 3, "asset": "pop" } ]                                                // optional one-shot sounds
}

Rules
- Scenes play one after another; the video length is the sum of scene durations. Transitions: none, fade, slide, zoom, wipe.
- Overlays use overlay blocks only (lower-third, captions, watermark, html-overlay) and draw over the scenes between start and end.
- Unique ids (s1, s2, o1…). Missing props take the block's defaults. Fonts bundled: Inter, Poppins, Hind Siliguri, Noto Sans Bengali.
- Lay out for the format: 9:16 for Reels/Shorts/TikTok, 1:1 or 4:5 for feeds, 16:9 for YouTube and websites.
- Good promo rhythm: 2.5–4 s per scene, 5–8 scenes, a transition of 0.4–0.6 s on most scenes, end with logo-outro.

HTML scenes (block "html", overlay "html-overlay")
- props: html (fragment, laid out at 1080p size: 1920×1080 for 16:9, 1080×1920 for 9:16), css, tailwind (true compiles Tailwind v4 classes), fonts (Google Fonts css2 URLs).
- @keyframes play on the video clock. CSS variables: --t (seconds), --p (0–1 progress), --primary, --secondary, --background, --text.
- Images: <img src="asset:ID">. No <script>, <video> or <iframe> inside the HTML.

Blocks (id — summary — props, * = required). Call describe_block for details:
${compactBlockList(createBuiltinRegistry())}`;

const TOOLS = [
  {
    name: "clipframe_guide",
    description: "How to write a Clipframe video project: the JSON format, rules, HTML scenes and the full block list. Call this first.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_blocks",
    description: "One line per block: id, summary and props (* = required).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "describe_block",
    description: "A block's props with types, defaults and an example.",
    inputSchema: { type: "object", properties: { id: { type: "string", description: "Block id, e.g. title-reveal" } }, required: ["id"] },
  },
  {
    name: "validate_project",
    description: "Check a project. Returns 'valid' with a summary, or a list of fixable errors like 's3.props.title: required'.",
    inputSchema: {
      type: "object",
      properties: { project: { type: "object", description: "The project JSON" }, path: { type: "string", description: "Or: path to a project.json" } },
    },
  },
  {
    name: "render_still",
    description: "Render one frame as an image so you can look at it. Use it to check layout and text before rendering the video.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "object", description: "The project JSON" },
        path: { type: "string", description: "Or: path to a project.json" },
        time: { type: "number", description: "Seconds from the start of the video" },
        assets_dir: { type: "string", description: "Folder asset files are relative to (default: the project file's folder)" },
        blocks: { type: "array", items: { type: "string" }, description: "Paths to custom block .js files" },
      },
      required: ["time"],
    },
  },
  {
    name: "render_video",
    description: "Render the project to an MP4 (H.264 + AAC) on this computer. Returns the file path.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "object", description: "The project JSON" },
        path: { type: "string", description: "Or: path to a project.json" },
        out: { type: "string", description: "Output .mp4 path (default: next to the project, or ~/Clipframe/<name>.mp4)" },
        assets_dir: { type: "string", description: "Folder asset files are relative to (default: the project file's folder)" },
        resolution: { type: "string", enum: ["720p", "1080p"] },
        fps: { type: "number", enum: [30, 60] },
        blocks: { type: "array", items: { type: "string" }, description: "Paths to custom block .js files" },
      },
    },
  },
  {
    name: "save_project",
    description: "Save a project as a project.json file (so the user can edit, re-render or open it later).",
    inputSchema: {
      type: "object",
      properties: { project: { type: "object" }, path: { type: "string", description: "Where to save, e.g. ~/videos/launch/project.json" } },
      required: ["project", "path"],
    },
  },
];

const expand = (p: string) => resolve(p.startsWith("~") ? join(homedir(), p.slice(1)) : p);
const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

function load(args: Json): { project: Project; dir: string; file?: string } {
  if (typeof args.path === "string" && args.path) {
    const file = expand(args.path);
    if (!existsSync(file)) throw new Error(`No such file: ${file}`);
    return { project: JSON.parse(readFileSync(file, "utf8")) as Project, dir: typeof args.assets_dir === "string" ? expand(args.assets_dir) : dirname(file), file };
  }
  if (args.project && typeof args.project === "object") {
    return { project: args.project as Project, dir: typeof args.assets_dir === "string" ? expand(args.assets_dir) : process.cwd() };
  }
  throw new Error("Give either `project` (the JSON) or `path` (a project.json file).");
}

function checked(project: unknown, plugins: string[]): Project {
  const registry = createBuiltinRegistry();
  const res = validateProject(project, plugins.length ? undefined : (id) => registry.get(id));
  if (!res.ok) throw new Error(`The project has problems:\n- ${res.errors.join("\n- ")}`);
  return res.project;
}

async function call(name: string, args: Json): Promise<ToolResult> {
  const plugins = (Array.isArray(args.blocks) ? (args.blocks as string[]) : []).map(expand);
  switch (name) {
    case "clipframe_guide":
      return text(GUIDE());
    case "list_blocks":
      return text(compactBlockList(createBuiltinRegistry()));
    case "describe_block": {
      const def = createBuiltinRegistry().get(String(args.id ?? ""));
      return def ? text(describeBlock(def)) : text(`No block "${String(args.id)}". Call list_blocks.`, true);
    }
    case "validate_project": {
      const { project } = load(args);
      const p = checked(project, plugins);
      return text(`valid\n\n${summary(p)}`);
    }
    case "render_still": {
      const { project, dir } = load(args);
      const p = checked(project, plugins);
      const out = join(tmpdir(), `clipframe-still-${process.pid}-${Date.now()}.png`);
      const time = Number(args.time ?? 0);
      await renderProject({ mode: "still", project: p, projectDir: dir, out, plugins, time, type: "image/png", resolution: "720p", quiet: true });
      const data = readFileSync(out).toString("base64");
      rmSync(out, { force: true });
      return { content: [{ type: "image", data, mimeType: "image/png" }, { type: "text", text: `Frame at ${time}s of ${projectDuration(p)}s (720p preview).` }] };
    }
    case "render_video": {
      const { project, dir, file } = load(args);
      const p = checked(project, plugins);
      const out = typeof args.out === "string" && args.out ? expand(args.out) : file ? join(dirname(file), `${p.meta.name}.mp4`) : join(homedir(), "Clipframe", `${p.meta.name}.mp4`);
      mkdirSync(dirname(out), { recursive: true });
      const t0 = Date.now();
      await renderProject({
        mode: "render",
        project: p,
        projectDir: dir,
        out,
        plugins,
        resolution: typeof args.resolution === "string" ? args.resolution : undefined,
        fps: typeof args.fps === "number" ? args.fps : undefined,
        quiet: true,
      });
      const mb = (statSync(out).size / 1e6).toFixed(1);
      return text(`Rendered ${out}\n${projectDuration(p)}s · ${mb} MB · ${((Date.now() - t0) / 1000).toFixed(1)}s to render`);
    }
    case "save_project": {
      const p = checked(args.project, plugins);
      const file = expand(String(args.path));
      const target = file.endsWith(".json") ? file : join(file, "project.json");
      if (!isAbsolute(target)) throw new Error("Give an absolute path (or one starting with ~).");
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, JSON.stringify(p, null, 2) + "\n");
      return text(`Saved ${target}. Asset files go next to it (paths in "assets" are relative to this folder).`);
    }
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
  }
}

/** Serve MCP over stdio until stdin closes. */
export function runMcpServer(): Promise<void> {
  const send = (msg: Json) => process.stdout.write(JSON.stringify(msg) + "\n");
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: { id?: string | number; method?: string; params?: Json };
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    const { id, method, params = {} } = msg;
    if (id === undefined) return; // notifications (initialized, cancelled…) need no answer
    const reply = (result: unknown) => send({ jsonrpc: "2.0", id, result });
    const error = (code: number, message: string) => send({ jsonrpc: "2.0", id, error: { code, message } });
    switch (method) {
      case "initialize":
        return reply({
          protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "clipframe", title: "Clipframe", version: VERSION },
          instructions: MCP_INSTRUCTIONS,
        });
      case "ping":
        return reply({});
      case "tools/list":
        return reply({ tools: TOOLS });
      case "tools/call": {
        const name = String(params.name ?? "");
        if (!TOOLS.some((t) => t.name === name)) return error(-32602, `Unknown tool: ${name}`);
        call(name, (params.arguments as Json) ?? {}).then(reply, (e: Error) => reply(text(e.message, true)));
        return;
      }
      default:
        return error(-32601, `Method not found: ${method}`);
    }
  });
  return new Promise((done) => rl.on("close", () => done()));
}
