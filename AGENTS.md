# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor, …) working **in** this repository or **with** Clipframe.

## Making a video with Clipframe

Follow [skills/clipframe/SKILL.md](skills/clipframe/SKILL.md): write a `project.json`, run `node bin/clipframe.js validate`, look at frames with `still`, then `render`. Reference: [docs/blocks.md](docs/blocks.md), [docs/project-format.md](docs/project-format.md), [docs/html.md](docs/html.md).

For AI apps, `node bin/clipframe.js mcp` is an MCP server with the tools `clipframe_guide`, `list_blocks`, `describe_block`, `validate_project`, `render_still` (returns an image), `render_video` and `save_project`.

## Working on the code

- `npm install && npm run build && npm test` before and after a change; `npm run typecheck` must pass.
- Layout: `src/schema` (project format, timing, ops) · `src/engine` (renderer, easing, motion) · `src/blocks` · `src/html` (HTML → frame) · `src/player` · `src/export` (WebCodecs MP4) · `src/cli` (CLI, headless render, MCP server) · `demo/` (website + playground).
- Blocks must be deterministic: draw only from `t`, `props` and `theme` (no `Date.now()`, `Math.random()`, state between frames). Preview and export call the same `renderFrame`.
- New built-in block: `src/blocks/blocks/<id>.ts`, register in `src/blocks/index.ts`, add the id to `test/blocks.test.ts`, run `npm run docs`.
- Check visual changes by rendering: `node bin/clipframe.js still examples/<name>/project.json -t <s> -o /tmp/x.png` and looking at the image.
