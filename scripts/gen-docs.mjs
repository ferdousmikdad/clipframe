// Write docs/blocks.md from the block definitions (run after `npm run build`).
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createBuiltinRegistry, describeBlock } from "../dist/index.js";

const registry = createBuiltinRegistry();
const groups = {};
for (const b of registry.list()) (groups[b.category] ??= []).push(b);
const order = ["media", "text", "ui", "data", "brand", "background", "overlay"];
let md = "# Built-in blocks\n\nGenerated from the block definitions by `npm run docs`. Fields marked `*` are required; everything else has a default.\n\nScenes play one after another. Blocks in the **overlay** group go in `overlays` with a `start` and `end` time and draw on top of the scenes.\n";
for (const cat of order.filter((c) => groups[c])) {
  md += `\n## ${cat[0].toUpperCase() + cat.slice(1)}\n`;
  for (const b of groups[cat]) md += `\n### \`${b.id}\` · ${b.name}\n\n\`\`\`\n${describeBlock(b)}\n\`\`\`\n`;
}
writeFileSync("docs/blocks.md", md);
// the Agent Skill carries copies of the reference docs (skills are installed on their own)
mkdirSync("skills/clipframe/references", { recursive: true });
copyFileSync("docs/blocks.md", "skills/clipframe/references/blocks.md");
copyFileSync("docs/project-format.md", "skills/clipframe/references/project-format.md");
copyFileSync("docs/html.md", "skills/clipframe/references/html.md");
console.log("wrote docs/blocks.md and skills/clipframe/references/");
