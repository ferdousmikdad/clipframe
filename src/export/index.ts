// Render a project frame by frame with the same renderer as the player, encode with WebCodecs
// (H.264 + AAC, or Opus when the browser has no AAC encoder) and mux to MP4. Runs in Chrome / Edge,
// in a page or headless (the CLI drives a headless Chrome with this exact code).
import { ArrayBufferTarget, Muxer, StreamTarget } from "mp4-muxer";
import { dimensions, projectDuration, type Project, type Resolution } from "../schema/index.js";
import { loadFonts, loadImageAssets, renderFrame, type BlockRegistry, type LoadedAssets } from "../engine/index.js";
import { createBuiltinRegistry } from "../blocks/index.js";
import { identityResolver, type AssetResolver } from "../assets.js";
import { createExportVideos } from "./videos.js";
import { mixAudio, SAMPLE_RATE } from "./audio.js";

export type ExportProgress = { frame: number; total: number; etaSeconds: number; stage: "audio" | "video" | "finishing" };

/** Where the MP4 goes while it is made: pieces written at byte positions, so long videos never sit in memory. */
export type ExportSink = { write(data: Uint8Array, position: number): void; drain(): Promise<void> };

export type ExportOptions = {
  registry?: BlockRegistry;
  resolveAsset?: AssetResolver;
  /** Default: the project's own meta.resolution. */
  resolution?: Resolution;
  /** Default: the project's own meta.fps. */
  fps?: 30 | 60;
  quality?: "standard" | "high";
  /** Only this part of the video, in seconds. */
  range?: { start: number; end: number };
  onProgress?: (p: ExportProgress) => void;
  signal?: AbortSignal;
  /** Stream the file out instead of returning a Blob. */
  sink?: ExportSink;
  /** Where the bundled fonts are served; null skips loading them. Default "/fonts". */
  fontsUrl?: string | null;
  /** Images already loaded (otherwise they are loaded from the project's assets). */
  assets?: LoadedAssets;
};

export const EXPORT_UNSUPPORTED = "MP4 export needs WebCodecs (Chrome or Edge 94+).";

export function exportSupported(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

function bitrate(width: number, height: number, fps: number, quality: "standard" | "high"): number {
  const base = width * height >= 1920 * 1080 * 0.9 ? 10_000_000 : 5_000_000;
  return Math.round(base * (fps === 60 ? 1.5 : 1) * (quality === "high" ? 1.3 : 0.8));
}

async function pickVideoConfig(width: number, height: number, fps: number, quality: "standard" | "high"): Promise<VideoEncoderConfig> {
  // High profile, level 4.0 (1080p30) / 4.2 (1080p60), then fallbacks.
  const codecs = fps === 60 ? ["avc1.64002a", "avc1.4d002a", "avc1.42002a"] : ["avc1.640028", "avc1.4d0028", "avc1.42001f"];
  for (const codec of codecs) {
    for (const hardwareAcceleration of ["no-preference", "prefer-software"] as const) {
      const config: VideoEncoderConfig = { codec, width, height, bitrate: bitrate(width, height, fps, quality), framerate: fps, avc: { format: "avc" }, hardwareAcceleration };
      const res = await VideoEncoder.isConfigSupported(config).catch(() => null);
      if (res?.supported) return config;
    }
  }
  throw new Error(`${EXPORT_UNSUPPORTED} (no H.264 encoder in this browser)`);
}

async function pickAudioCodec(): Promise<{ config: AudioEncoderConfig; mux: "aac" | "opus" } | null> {
  if (typeof AudioEncoder === "undefined") return null;
  const options: { config: AudioEncoderConfig; mux: "aac" | "opus" }[] = [
    { config: { codec: "mp4a.40.2", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 192_000 }, mux: "aac" },
    { config: { codec: "opus", sampleRate: SAMPLE_RATE, numberOfChannels: 2, bitrate: 160_000 }, mux: "opus" },
  ];
  for (const o of options) {
    const res = await AudioEncoder.isConfigSupported(o.config).catch(() => null);
    if (res?.supported) return o;
  }
  return null;
}

/** Cut the sound to the export range. */
function sliceAudio(buf: AudioBuffer, start: number, end: number): AudioBuffer {
  if (start <= 0 && end >= buf.duration) return buf;
  const from = Math.floor(start * buf.sampleRate);
  const to = Math.min(buf.length, Math.ceil(end * buf.sampleRate));
  const out = new AudioBuffer({ length: Math.max(1, to - from), numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(from, to), c);
  return out;
}

/**
 * Render `project` to an MP4. Returns a Blob, or nothing when `sink` is given (the bytes went there).
 *
 *   const blob = await renderToMp4(project, { resolveAsset: assetsFrom("/assets/"), onProgress: console.log });
 */
export async function renderToMp4(project: Project, options: ExportOptions = {}): Promise<Blob | undefined> {
  if (!exportSupported()) throw new Error(EXPORT_UNSUPPORTED);
  const registry = options.registry ?? createBuiltinRegistry();
  const resolve = options.resolveAsset ?? identityResolver;
  const onProgress = options.onProgress ?? (() => undefined);
  const fps = options.fps ?? project.meta.fps;
  const quality = options.quality ?? "high";
  if (options.fontsUrl !== null) await loadFonts(options.fontsUrl ?? "/fonts");
  const { width, height } = dimensions(project.meta.format, options.resolution ?? project.meta.resolution);
  const full = projectDuration(project);
  const start = Math.max(0, options.range?.start ?? 0);
  const end = Math.min(full, options.range?.end ?? full);
  const duration = end - start;
  if (duration <= 0) throw new Error("Nothing to export: add a scene first.");
  const total = Math.max(1, Math.round(duration * fps));

  const videoConfig = await pickVideoConfig(width, height, fps, quality);
  onProgress({ frame: 0, total, etaSeconds: 0, stage: "audio" });
  const mixed = await mixAudio(project, end, resolve, registry);
  const audioBuffer = mixed ? sliceAudio(mixed, start, end) : null;
  const audioCodec = audioBuffer ? await pickAudioCodec() : null;

  const memory = options.sink ? null : new ArrayBufferTarget();
  const sink = options.sink;
  const muxer = new Muxer({
    target: memory ?? new StreamTarget({ onData: (data, position) => sink!.write(data, position), chunked: true, chunkSize: 8 * 1024 * 1024 }),
    video: { codec: "avc", width, height, frameRate: fps },
    audio: audioBuffer && audioCodec ? { codec: audioCodec.mux, numberOfChannels: 2, sampleRate: SAMPLE_RATE } : undefined,
    fastStart: memory ? "in-memory" : false,
    firstTimestampBehavior: "offset",
  });

  let failure: Error | null = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e as Error) });
  encoder.configure(videoConfig);

  if (audioBuffer && audioCodec) {
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e as Error) });
    aenc.configure(audioCodec.config);
    const frameSize = 1024;
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    for (let i = 0; i < audioBuffer.length; i += frameSize) {
      const n = Math.min(frameSize, audioBuffer.length - i);
      const planar = new Float32Array(n * 2);
      planar.set(left.subarray(i, i + n), 0);
      planar.set(right.subarray(i, i + n), n);
      const data = new AudioData({ format: "f32-planar", sampleRate: SAMPLE_RATE, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / SAMPLE_RATE) * 1e6), data: planar });
      aenc.encode(data);
      data.close();
    }
    await aenc.flush();
    aenc.close();
  }

  const base = options.assets ?? (await loadImageAssets(project, resolve));
  const times = Array.from({ length: total }, (_, i) => start + i / fps);
  const videos = await createExportVideos(project, base, times, resolve, registry);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D;
  const started = performance.now();
  const frameUs = 1e6 / fps;
  try {
    for (let i = 0; i < total; i++) {
      if (options.signal?.aborted) throw new DOMException("Export cancelled", "AbortError");
      if (failure) throw failure;
      await videos.prepare(i);
      renderFrame(ctx, project, times[i], videos.assets, registry);
      const frame = new VideoFrame(canvas, { timestamp: Math.round(i * frameUs), duration: Math.round(frameUs) });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      if (sink && i % 30 === 0) await sink.drain();
      if (i % 5 === 0 || i === total - 1) {
        const elapsed = (performance.now() - started) / 1000;
        onProgress({ frame: i + 1, total, etaSeconds: ((total - i - 1) * elapsed) / (i + 1), stage: "video" });
        await new Promise((r) => setTimeout(r, 0)); // let the page breathe
      }
    }
  } catch (e) {
    encoder.close();
    throw e;
  } finally {
    videos.dispose();
  }
  onProgress({ frame: total, total, etaSeconds: 0, stage: "finishing" });
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  if (sink) {
    await sink.drain();
    return undefined;
  }
  return new Blob([memory!.buffer], { type: "video/mp4" });
}

/** One frame as a PNG (or JPEG / WebP with `type`). Video frames are decoded exactly, like the export. */
export async function renderStill(
  project: Project,
  time: number,
  options: Pick<ExportOptions, "registry" | "resolveAsset" | "resolution" | "fontsUrl" | "assets"> & { type?: "image/png" | "image/jpeg" | "image/webp"; quality?: number } = {},
): Promise<Blob> {
  const registry = options.registry ?? createBuiltinRegistry();
  const resolve = options.resolveAsset ?? identityResolver;
  if (options.fontsUrl !== null) await loadFonts(options.fontsUrl ?? "/fonts");
  const { width, height } = dimensions(project.meta.format, options.resolution ?? project.meta.resolution);
  const t = Math.max(0, Math.min(time, Math.max(0, projectDuration(project) - 1e-3)));
  const base = options.assets ?? (await loadImageAssets(project, resolve));
  const videos = await createExportVideos(project, base, [t], resolve, registry);
  try {
    await videos.prepare(0);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d", { alpha: false }) as OffscreenCanvasRenderingContext2D;
    renderFrame(ctx, project, t, videos.assets, registry);
    return await canvas.convertToBlob({ type: options.type ?? "image/png", quality: options.quality });
  } finally {
    videos.dispose();
  }
}
