// Runs inside the headless browser the CLI starts. Gets the job from the local server, renders it with
// the exact same code as the browser exporter, and streams the bytes back to the server.
import { createBuiltinRegistry, resolvePluginExport } from "../blocks/index.js";
import type { Project, Resolution } from "../schema/index.js";
import { renderStill, renderToMp4, type ExportSink } from "../export/index.js";

type Job = {
  mode: "render" | "still";
  project: Project;
  plugins: string[];
  resolution?: Resolution;
  fps?: 30 | 60;
  quality?: "standard" | "high";
  range?: { start: number; end: number };
  time?: number;
  type?: "image/png" | "image/jpeg" | "image/webp";
};

declare global {
  interface Window {
    __clipframe?: { done: boolean; error?: string };
  }
}

const post = (path: string, body: BodyInit) => fetch(path, { method: "POST", body }).then((r) => {
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
});

function sink(): ExportSink {
  let chain: Promise<void> = Promise.resolve();
  let failure: Error | null = null;
  return {
    write(data, position) {
      const copy = data.slice();
      chain = chain.then(() => post(`/__out?pos=${position}`, copy).catch((e: Error) => void (failure ??= e)));
    },
    async drain() {
      await chain;
      if (failure) throw failure;
    },
  };
}

async function main() {
  const job = (await (await fetch("/__job")).json()) as Job & { debug?: boolean };
  if (job.debug) (globalThis as { __clipframeDebugSvg?: (svg: string, id: string) => void }).__clipframeDebugSvg = (svg, id) => void post(`/__debug?id=${encodeURIComponent(id)}`, svg);
  const registry = createBuiltinRegistry();
  for (const url of job.plugins) {
    const mod = (await import(/* @vite-ignore */ url)) as { default: unknown };
    for (const b of resolvePluginExport(mod.default, url)) registry.add(b);
  }
  const common = { registry, resolveAsset: (file: string) => (/^[a-z]+:/i.test(file) ? file : `/__assets/${file.replace(/^\.?\//, "")}`), fontsUrl: "/__fonts", resolution: job.resolution };
  if (job.mode === "still") {
    const blob = await renderStill(job.project, job.time ?? 0, { ...common, type: job.type });
    await post("/__out?pos=0", blob);
  } else {
    let last = 0;
    await renderToMp4(job.project, {
      ...common,
      fps: job.fps,
      quality: job.quality,
      range: job.range,
      sink: sink(),
      onProgress: (p) => {
        const now = performance.now();
        if (now - last > 250 || p.stage !== "video" || p.frame === p.total) {
          last = now;
          void fetch("/__progress", { method: "POST", body: JSON.stringify(p) });
        }
      },
    });
  }
}

main().then(
  () => (window.__clipframe = { done: true }),
  (e: Error) => (window.__clipframe = { done: true, error: e?.stack || String(e) }),
);
