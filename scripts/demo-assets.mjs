// Copy the fonts and the examples into demo/public so the playground can load them.
import { cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("demo/public", { recursive: true });
cpSync("fonts", "demo/public/fonts", { recursive: true });
cpSync("examples", "demo/public/examples", { recursive: true });
cpSync("docs/images/ai-frame.jpg", "demo/public/ai-frame.jpg");
const list = readdirSync("examples")
  .filter((n) => !n.startsWith("."))
  .map((name) => ({ name, blocks: readdirSync(`examples/${name}`).filter((f) => f.endsWith(".js")) }));
writeFileSync("demo/public/examples/index.json", JSON.stringify(list));


// llms.txt (https://llmstxt.org): what AI assistants read to learn a tool
const site = "https://ferdousmikdad.github.io/clipframe";
const gh = "https://github.com/ferdousmikdad/clipframe/blob/main";
writeFileSync(
  "demo/public/llms.txt",
  `# Clipframe

> Clipframe makes MP4 videos from a JSON project: ready-made animation blocks (titles, UI mockups, cursor clicks, stats, pricing, testimonials, outros), HTML/CSS/Tailwind scenes, video clips, music, voice-over and sound effects. Free and MIT licensed for any company size, with no seat or per-render fees. Preview in a browser player, export MP4 in the browser (WebCodecs) or render from the command line with headless Chrome. It is an open-source alternative to Remotion for promo videos, launch videos, social reels and explainers.

Use it from an AI assistant through the MCP server (\`npx -y github:ferdousmikdad/clipframe mcp\`) or the Agent Skill (\`npx skills add ferdousmikdad/clipframe\`).

## Docs

- [Full docs in one file](${site}/llms-full.txt): everything below, for reading in one go
- [README](${gh}/README.md): install, CLI, browser API, MCP setup
- [Agent Skill](${gh}/skills/clipframe/SKILL.md): step-by-step workflow for making a video
- [Project format](${gh}/docs/project-format.md): the JSON structure and edit ops
- [Blocks](${gh}/docs/blocks.md): every block with its props and an example
- [HTML in video](${gh}/docs/html.md): HTML, CSS and Tailwind scenes, defineHtmlBlock, React
- [Custom blocks](${gh}/docs/custom-blocks.md): write your own block

## Examples

- [SaaS promo](${gh}/examples/taskflow-promo/project.json)
- [Social reel, 9:16](${gh}/examples/orbit-reel/project.json)
- [HTML and Tailwind](${gh}/examples/html-css/project.json)
- [Playground](${site}/playground.html): edit and export in the browser
`,
);
const full = ["README.md", "skills/clipframe/SKILL.md", "docs/project-format.md", "docs/html.md", "docs/custom-blocks.md", "docs/blocks.md"]
  .map((f) => `<!-- ${f} -->\n\n${readFileSync(f, "utf8").replace(/^---[\s\S]*?---\n/, "")}`)
  .join("\n\n---\n\n");
writeFileSync("demo/public/llms-full.txt", full);
