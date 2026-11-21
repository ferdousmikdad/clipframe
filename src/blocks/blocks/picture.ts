// A still scene (Video Studio's explainer SceneVisual): a picture with a slow push-in and drift, or a calm colour,
// darkened at the top and bottom so titles and captions read.
import { z } from "zod";
import { drawImageFit, type RenderArgs } from "../../engine/index.js";
import { defineBlock } from "../define.js";
import { assetRef } from "../shared.js";

const schema = z.object({
  asset: assetRef("Picture asset id (empty = colour only)").default(""),
  color: z.string().default("").describe("Background colour (empty = the theme's background)"),
  accent: z.string().default("").describe("Glow colour of a colour-only scene (empty = the theme's primary)"),
  zoomFrom: z.number().min(1).max(3).default(1.04).describe("Zoom at the start"),
  zoomTo: z.number().min(1).max(3).default(1.14).describe("Zoom at the end"),
  pan: z.number().min(-10).max(10).default(1.5).describe("Sideways drift in % of the width (left → right)"),
  shade: z.boolean().default(true).describe("Darken the top and bottom for text"),
});
type Props = z.output<typeof schema>;

const hex = (c: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return `rgba(0,0,0,0)`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export default defineBlock({
  id: "picture",
  name: "Picture",
  summary: "A full-frame picture with a slow push-in (or a calm colour), for explainers and stories",
  category: "media",
  defaultDuration: 4,
  schema,
  render(r: RenderArgs<Props>) {
    const { ctx, props: p, theme, t, width: W, height: H, duration } = r;
    const k = Math.min(1, Math.max(0, t / Math.max(0.001, duration)));
    ctx.fillStyle = p.color || theme.background;
    ctx.fillRect(0, 0, W, H);
    const img = p.asset ? r.assets.get(p.asset) : undefined;
    if (img) {
      const z = p.zoomFrom + (p.zoomTo - p.zoomFrom) * k;
      const pan = (-p.pan + 2 * p.pan * k) / 100;
      ctx.save();
      ctx.translate(W / 2 + pan * W * z, H / 2);
      ctx.scale(z, z);
      drawImageFit(ctx, img, -W / 2, -H / 2, W, H, "cover");
      ctx.restore();
    } else {
      const g = ctx.createRadialGradient(W * 0.3, H * 0.2, 0, W * 0.3, H * 0.2, Math.max(W, H) * 0.6);
      g.addColorStop(0, hex(p.accent || theme.primary, 0.2));
      g.addColorStop(1, hex(p.accent || theme.primary, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (p.shade) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, "rgba(0,0,0,0.35)");
      g.addColorStop(0.3, "rgba(0,0,0,0)");
      g.addColorStop(0.55, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.65)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  },
});
