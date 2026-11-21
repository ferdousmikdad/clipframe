import { assetsFrom, createBuiltinRegistry, resolvePluginExport, validateProject, type Project, type Resolution } from "../src/index.js";
import { createPlayer, type Player } from "../src/player/index.js";
import { exportSupported, renderToMp4 } from "../src/export/index.js";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const select = $<HTMLSelectElement>("example");
const textarea = $<HTMLTextAreaElement>("json");
const errors = $<HTMLDivElement>("errors");
const status = $<HTMLSpanElement>("status");
const exportBtn = $<HTMLButtonElement>("export");
const fontsUrl = new URL("fonts", location.href).href.replace(/\/$/, "");

let player: Player | null = null;
let current: { name: string; project: Project; registry: ReturnType<typeof createBuiltinRegistry> } | null = null;

type Example = { name: string; blocks: string[] };

async function open({ name, blocks }: Example) {
  const base = new URL(`examples/${name}/`, location.href).href;
  const project = (await (await fetch(base + "project.json")).json()) as Project;
  const registry = createBuiltinRegistry();
  // An example can bring its own blocks (examples/custom-block/countdown.js).
  for (const file of blocks) {
    const mod = (await import(/* @vite-ignore */ base + file)) as { default: unknown };
    for (const b of resolvePluginExport(mod.default, file)) registry.add(b);
  }
  current = { name, project, registry };
  textarea.value = JSON.stringify(project, null, 2);
  errors.textContent = "";
  player?.destroy();
  player = createPlayer($("player"), { project, registry, resolveAsset: assetsFrom(base), fontsUrl, autoPlay: true, loop: true });
}

let timer = 0;
textarea.addEventListener("input", () => {
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (!current) return;
    let raw: unknown;
    try {
      raw = JSON.parse(textarea.value);
    } catch (e) {
      errors.textContent = (e as Error).message;
      return;
    }
    const res = validateProject(raw, (id) => current!.registry.get(id));
    if (!res.ok) {
      errors.textContent = res.errors.join("\n");
      return;
    }
    errors.textContent = "";
    current.project = res.project;
    player?.setProject(res.project);
  }, 250);
});

exportBtn.addEventListener("click", async () => {
  if (!current) return;
  if (!exportSupported()) {
    status.textContent = "Export needs Chrome or Edge (WebCodecs).";
    return;
  }
  exportBtn.disabled = true;
  player?.pause();
  try {
    const blob = await renderToMp4(current.project, {
      registry: current.registry,
      resolveAsset: assetsFrom(new URL(`examples/${current.name}/`, location.href).href),
      resolution: $<HTMLSelectElement>("res").value as Resolution,
      fontsUrl,
      onProgress: (p) => (status.textContent = p.stage === "video" ? `Rendering ${Math.round((p.frame / p.total) * 100)}%` : `${p.stage}…`),
    });
    const url = URL.createObjectURL(blob!);
    status.innerHTML = "";
    const a = Object.assign(document.createElement("a"), { href: url, download: `${current.project.meta.name}.mp4`, textContent: `Download ${current.project.meta.name}.mp4 (${(blob!.size / 1e6).toFixed(1)} MB)` });
    status.appendChild(a);
  } catch (e) {
    status.textContent = (e as Error).message;
  } finally {
    exportBtn.disabled = false;
  }
});

const examples = (await (await fetch("examples/index.json")).json()) as Example[];
for (const e of examples) select.append(new Option(e.name, e.name));
const byName = (n: string) => examples.find((e) => e.name === n) ?? examples[0];
select.addEventListener("change", () => void open(byName(select.value)));
select.value = byName("taskflow-promo").name;
await open(byName(select.value));
