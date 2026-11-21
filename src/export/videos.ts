// Frame-exact video for export, decoded with mediabunny (MPL-2.0) through WebCodecs.
// All frame times are worked out first, so each file is decoded once, in order, with no seeking per frame.
import { ALL_FORMATS, CanvasSink, Input, UrlSource, type WrappedCanvas } from "mediabunny";
import type { BlockRegistry, LoadedAssets, VideoSource } from "../engine/index.js";
import type { Project } from "../schema/index.js";
import type { AssetResolver } from "../assets.js";
import { frameKey, videoAssetIds, videoNeeds, type VideoNeed } from "./plan.js";

type Opened = { input: Input; sink: CanvasSink; duration: number; width: number; height: number };

async function open(project: Project, assetId: string, resolve: AssetResolver): Promise<Opened> {
  const asset = project.assets.find((a) => a.id === assetId);
  if (!asset) throw new Error(`Video asset "${assetId}" is missing.`);
  // Prefer the original; fall back to the preview copy when the browser can't decode the original's codec.
  for (const file of [asset.file, asset.proxy].filter((f): f is string => !!f)) {
    const input = new Input({ source: new UrlSource(resolve(file)), formats: ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    if (track && (await track.canDecode())) {
      const duration = await input.computeDuration();
      return { input, sink: new CanvasSink(track, { poolSize: 0, alpha: /\.webm$/i.test(file) }), duration, width: track.displayWidth, height: track.displayHeight };
    }
    input.dispose();
  }
  throw new Error(`This browser can't decode "${asset.file}". Convert it to H.264 MP4 (e.g. ffmpeg -i in.mov -c:v libx264 out.mp4).`);
}

export type ExportVideos = {
  assets: LoadedAssets;
  /** Decode the video frames output frame `index` needs. Call before rendering it. */
  prepare(index: number): Promise<void>;
  dispose(): void;
};

/** Plan and open every video source for frames `times`. Without video it returns `base` unchanged. */
export async function createExportVideos(project: Project, base: LoadedAssets, times: number[], resolve: AssetResolver, registry: BlockRegistry): Promise<ExportVideos> {
  const ids = videoAssetIds(project);
  if (!ids.length) return { assets: base, prepare: async () => undefined, dispose: () => undefined };

  const opened = new Map<string, Opened>();
  for (const id of ids) opened.set(id, await open(project, id, resolve));
  const durations = new Map([...opened].map(([id, o]) => [id, o.duration]));
  const perFrame: VideoNeed[][] = times.map((t) => videoNeeds(project, t, durations, registry));
  const iterators = new Map<string, AsyncGenerator<WrappedCanvas | null, void, unknown>>();
  for (const [id, o] of opened) {
    const ts = perFrame.flatMap((needs) => needs.filter((n) => n.asset === id).map((n) => n.t));
    if (ts.length) iterators.set(id, o.sink.canvasesAtTimestamps(ts));
  }

  const current = new Map<string, CanvasImageSource>();
  const sources = new Map<string, VideoSource>();
  for (const [id, o] of opened) {
    sources.set(id, { duration: o.duration, width: o.width, height: o.height, exact: true, frame: (t) => current.get(frameKey(id, t)) ?? null });
  }

  return {
    assets: { get: (id) => base.get(id), video: (id) => sources.get(id) },
    async prepare(index) {
      current.clear();
      for (const need of perFrame[index] ?? []) {
        const next = await iterators.get(need.asset)?.next();
        const canvas = next && !next.done ? next.value?.canvas : null;
        if (canvas) current.set(frameKey(need.asset, need.t), canvas);
      }
    },
    dispose() {
      for (const it of iterators.values()) void it.return(undefined);
      for (const o of opened.values()) o.input.dispose();
    },
  };
}
