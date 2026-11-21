import { z } from "zod";
import { easings, lerp, type Ctx2D, type RenderArgs } from "../../engine/index.js";
import { defineBlock } from "../define.js";
import { drawPlaceholder, videoRef } from "../shared.js";

const schema = z.object({
  asset: videoRef("Video asset id").default(""),
  start: z.number().min(0).default(0).describe("Start this many seconds into the video (trim the beginning)"),
  speed: z.number().min(0.25).max(4).default(1).describe("Playback speed (0.25–4)"),
  volume: z.number().min(0).max(2).default(1).describe("Sound volume (0 = silent, 1 = original)"),
  mute: z.boolean().default(false).describe("Turn the video's sound off"),
  fit: z
    .enum(["cover", "contain", "blur"])
    .default("cover")
    .describe("cover = fill and crop · contain = whole picture · blur = whole picture on a blurred copy"),
  zoomFrom: z.number().min(1).max(4).default(1).describe("Zoom at the start (1 = none)"),
  zoomTo: z.number().min(1).max(4).default(1).describe("Zoom at the end (slow push-in when larger than zoomFrom)"),
  focusX: z.number().min(0).max(1).default(0.5).describe("Horizontal point to keep in frame (0 = left, 1 = right)"),
  focusY: z.number().min(0).max(1).default(0.5).describe("Vertical point to keep in frame (0 = top, 1 = bottom)"),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0).describe("Rotate clockwise"),
  flipH: z.boolean().default(false).describe("Mirror left–right"),
  flipV: z.boolean().default(false).describe("Mirror top–bottom"),
  freeze: z.boolean().default(false).describe("Hold one frame (the frame at Start) for the whole scene"),
  brightness: z.number().min(0.3).max(2).default(1).describe("1 = original"),
  contrast: z.number().min(0.3).max(2).default(1).describe("1 = original"),
  saturation: z.number().min(0).max(2.5).default(1).describe("0 = black and white, 1 = original"),
});

export type VideoProps = z.output<typeof schema>;

/**
 * Source time shown at scene time `t`. Holds the last frame when the video runs out.
 * Shared by the block, the player and the exporter so they always ask for the same frame.
 */
export function videoSourceTime(p: Pick<VideoProps, "start" | "speed"> & { freeze?: boolean }, t: number, sourceDuration?: number): number {
  const s = p.freeze ? p.start : p.start + Math.max(0, t) * p.speed;
  if (sourceDuration && sourceDuration > 0) return Math.max(0, Math.min(s, sourceDuration - 1 / 120));
  return s;
}

/** CSS filter for the colour settings (canvas 2D `filter`, same in preview and export). */
export function colourFilter(p: Pick<VideoProps, "brightness" | "contrast" | "saturation">): string {
  const parts: string[] = [];
  if (p.brightness !== 1) parts.push(`brightness(${p.brightness})`);
  if (p.contrast !== 1) parts.push(`contrast(${p.contrast})`);
  if (p.saturation !== 1) parts.push(`saturate(${p.saturation})`);
  return parts.join(" ") || "none";
}

/** Where the picture goes: scale for the fit mode, zoom, then pan so the focus point stays in frame. */
function place(rw: number, rh: number, W: number, H: number, fit: "cover" | "contain", zoom: number, fx: number, fy: number) {
  const s = (fit === "cover" ? Math.max(W / rw, H / rh) : Math.min(W / rw, H / rh)) * zoom;
  const w = rw * s;
  const h = rh * s;
  const at = (size: number, box: number, f: number) => (size <= box ? (box - size) / 2 : Math.min(0, Math.max(box - size, box / 2 - f * size)));
  return { x: at(w, W, fx), y: at(h, H, fy), w, h };
}

function drawSource(ctx: Ctx2D, src: CanvasImageSource, sw: number, sh: number, p: VideoProps, box: { x: number; y: number; w: number; h: number }) {
  ctx.save();
  ctx.translate(box.x + box.w / 2, box.y + box.h / 2);
  ctx.rotate((p.rotate * Math.PI) / 180);
  ctx.scale(p.flipH ? -1 : 1, p.flipV ? -1 : 1);
  const quarter = p.rotate === 90 || p.rotate === 270;
  const dw = quarter ? box.h : box.w;
  const dh = quarter ? box.w : box.h;
  ctx.drawImage(src, 0, 0, sw, sh, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
}

export default defineBlock({
  id: "video",
  name: "Video",
  summary: "A video clip: trim, speed, framing, zoom, colour",
  category: "media",
  defaultDuration: 5,
  schema,
  render(r: RenderArgs<VideoProps>) {
    const { ctx, props: p, t, width: W, height: H, unit, duration } = r;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const source = p.asset ? r.assets.video?.(p.asset) : undefined;
    const frame = source?.frame(videoSourceTime(p, t, source.duration), { speed: p.speed, volume: p.volume, muted: p.mute });
    if (!source || !frame || !source.width || !source.height) {
      drawPlaceholder(r as RenderArgs<unknown>, 0, 0, W, H, p.asset ? "Loading video…" : "Add a video");
      return;
    }
    const quarter = p.rotate === 90 || p.rotate === 270;
    const rw = quarter ? source.height : source.width;
    const rh = quarter ? source.width : source.height;
    const filter = colourFilter(p);
    if (p.fit === "blur") {
      ctx.save();
      ctx.filter = `blur(${Math.round(40 * unit)}px) brightness(0.65)${filter === "none" ? "" : " " + filter}`;
      drawSource(ctx, frame, source.width, source.height, p, place(rw, rh, W, H, "cover", 1.08, 0.5, 0.5));
      ctx.restore();
    }
    const zoom = lerp(p.zoomFrom, p.zoomTo, easings.inOutCubic(Math.min(1, Math.max(0, t / Math.max(duration, 0.001)))));
    ctx.save();
    ctx.filter = filter;
    drawSource(ctx, frame, source.width, source.height, p, place(rw, rh, W, H, p.fit === "cover" ? "cover" : "contain", zoom, p.focusX, p.focusY));
    ctx.restore();
  },
});
