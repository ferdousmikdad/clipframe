import type { z } from "zod";
import type { Project, Theme } from "../schema/index.js";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Anything drawable with drawImage that knows its size. */
export type ImageLike = CanvasImageSource & { width: number; height: number };

/** Playback hints a block passes with a frame request (the preview uses them; export ignores them). */
export type VideoHints = { speed?: number; volume?: number; muted?: boolean };

/**
 * A video asset the renderer can draw from. `frame(t)` returns what to draw for source time `t` (seconds),
 * synchronously: the preview returns its <video> element (seeking in the background), the exporter
 * returns the exact decoded frame it prepared for this output frame. Null while nothing is ready.
 */
export type VideoSource = {
  duration: number;
  width: number;
  height: number;
  frame(t: number, hints?: VideoHints): CanvasImageSource | null;
  /** True when any time can be asked for in the same frame (export); the preview has one live picture. */
  exact?: boolean;
};

/** An imported motion preset (Lottie) with its fields filled in; `frame(t)` draws second `t` synchronously. */
export type LottieSource = {
  duration: number;
  width: number;
  height: number;
  frame(t: number): CanvasImageSource | null;
};

export type LoadedAssets = {
  get(id: string): ImageLike | undefined;
  video?(id: string): VideoSource | undefined;
  /** A preset from the preset library (id) with text / colour fields applied. */
  lottie?(preset: string, fields: Record<string, string>): LottieSource | undefined;
};

export const EMPTY_ASSETS: LoadedAssets = { get: () => undefined };

export type RenderArgs<P> = {
  ctx: Ctx2D;
  props: P;
  theme: Theme;
  /** Seconds since the scene started (keeps running past `duration` during an outgoing transition). */
  t: number;
  /** Seconds since the start of the project (the playhead). */
  time: number;
  /** t / duration, clamped to 0..1. */
  progress: number;
  duration: number;
  width: number;
  height: number;
  /** min(width, height) / 1080 — multiply pixel sizes by this so blocks look the same at 720p and 1080p. */
  unit: number;
  /** "landscape" | "portrait" | "square" — handy for layout decisions. */
  orientation: "landscape" | "portrait" | "square";
  assets: LoadedAssets;
  /** Deterministic random seeded by the scene id. */
  random: () => number;
  project: Project;
};

export type BlockCategory = "media" | "text" | "ui" | "data" | "brand" | "background" | "overlay";

export type BlockDefinition<P = any> = {
  id: string;
  name: string;
  summary: string;
  category: BlockCategory;
  defaultDuration: number;
  schema: z.ZodType<P>;
  defaults: P;
  render(r: RenderArgs<P>): void;
  /** Set by the plugin loader. */
  plugin?: string;
};

export type BlockRegistry = {
  get(id: string): BlockDefinition | undefined;
  list(): BlockDefinition[];
};

export function createRegistry(blocks: BlockDefinition[]): BlockRegistry & { add(b: BlockDefinition): void } {
  const map = new Map<string, BlockDefinition>();
  for (const b of blocks) map.set(b.id, b);
  return {
    get: (id) => map.get(id),
    list: () => [...map.values()],
    add: (b) => void map.set(b.id, b),
  };
}
