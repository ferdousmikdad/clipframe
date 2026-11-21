// Copy the fonts and the examples into demo/public so the playground can load them.
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";

mkdirSync("demo/public", { recursive: true });
cpSync("fonts", "demo/public/fonts", { recursive: true });
cpSync("examples", "demo/public/examples", { recursive: true });
const list = readdirSync("examples")
  .filter((n) => !n.startsWith("."))
  .map((name) => ({ name, blocks: readdirSync(`examples/${name}`).filter((f) => f.endsWith(".js")) }));
writeFileSync("demo/public/examples/index.json", JSON.stringify(list));

