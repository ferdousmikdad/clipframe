import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createBuiltinRegistry, resolvePluginExport, validateProject, type Project } from "../src/index.js";

const dir = new URL("../examples/", import.meta.url).pathname;

describe("examples", () => {
  it.each(readdirSync(dir))("%s is a valid project with its assets on disk", async (name) => {
    const registry = createBuiltinRegistry();
    for (const file of readdirSync(join(dir, name)).filter((f) => f.endsWith(".js"))) {
      const mod = await import(join(dir, name, file));
      for (const b of resolvePluginExport(mod.default, file)) registry.add(b);
    }
    const project = JSON.parse(readFileSync(join(dir, name, "project.json"), "utf8")) as Project;
    const res = validateProject(project, (id) => registry.get(id));
    expect(res.errors).toEqual([]);
    for (const a of project.assets) expect(existsSync(join(dir, name, a.file)), a.file).toBe(true);
  });
});
