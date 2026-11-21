import { z } from "zod";
import type { BlockCategory, BlockDefinition, RenderArgs } from "../../engine/index.js";
import { ensureHtmlFrame, htmlFrame, type HtmlFrameArgs, type HtmlSource } from "../../html/index.js";
import { defineBlock } from "../define.js";

const fields = {
  html: z.string().describe('HTML fragment, laid out at 1080p size (e.g. 1920×1080 for 16:9). Images: src="asset:ID". No scripts'),
  css: z.string().default("").describe("CSS. @keyframes animations play on the video's clock; use var(--t) seconds, var(--p) 0–1 progress, var(--primary) etc."),
  tailwind: z.boolean().default(false).describe("Compile Tailwind v4 classes used in the HTML"),
  fonts: z.array(z.string()).default([]).describe("Extra font stylesheet URLs to embed, e.g. a Google Fonts css2 link"),
};

type Props = { html: string; css: string; tailwind: boolean; fonts: string[]; background?: string };

function args(r: RenderArgs<Props>, source: HtmlSource): HtmlFrameArgs {
  return { id: r.id, source, t: r.t, duration: r.duration, width: r.width, height: r.height, theme: r.theme, assets: r.assets };
}

function draw(r: RenderArgs<Props>, source: HtmlSource) {
  const img = htmlFrame(args(r, source));
  if (img) r.ctx.drawImage(img, 0, 0, r.width, r.height);
}

export const html = defineBlock({
  id: "html",
  name: "HTML",
  summary: "Any HTML + CSS (or Tailwind) as a scene, animated with CSS keyframes on the video clock",
  category: "media",
  defaultDuration: 4,
  schema: z.object({ ...fields, background: z.string().default("var(--background)").describe('CSS background behind the HTML ("transparent" to see the scene below during a transition)') }),
  defaults: {
    html: '<div class="hero"><h1>Hello, <span>HTML</span></h1><p>CSS animations run on the video clock.</p></div>',
    css: ".hero{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px}h1{font-size:140px;margin:0;animation:rise .8s cubic-bezier(.2,.8,.2,1) both}h1 span{color:var(--primary)}p{font-size:44px;opacity:.75;margin:0;animation:rise .8s .25s both}@keyframes rise{from{opacity:0;transform:translateY(60px)}}",
  },
  render: (r) => draw(r, r.props),
  prepare: (r) => ensureHtmlFrame(args(r, r.props)).then(() => undefined),
});

export const htmlOverlay = defineBlock({
  id: "html-overlay",
  name: "HTML overlay",
  summary: "Any HTML + CSS (or Tailwind) drawn over the scenes, transparent around it",
  category: "overlay",
  defaultDuration: 4,
  schema: z.object(fields),
  defaults: {
    html: '<div class="tag">Live</div>',
    css: ".tag{position:absolute;right:64px;top:64px;padding:14px 28px;border-radius:999px;background:var(--primary);font:700 36px var(--font);animation:pop .5s both}@keyframes pop{from{transform:scale(0)}}",
  },
  render: (r) => draw(r, r.props),
  prepare: (r) => ensureHtmlFrame(args(r, r.props)).then(() => undefined),
});

/** What a code-driven HTML block's `html` function gets each frame. */
export type HtmlFrameInfo = { t: number; progress: number; duration: number; time: number; width: number; height: number; theme: RenderArgs<unknown>["theme"] };

/**
 * A block whose HTML comes from code, called for every frame: the Remotion way of working, with plain
 * template strings (or React: `html: (p, f) => renderToStaticMarkup(<Title {...p} t={f.t} />)`).
 *
 *   defineHtmlBlock({
 *     id: "price-tag", name: "Price tag", summary: "Counts up to a price", category: "data", defaultDuration: 3,
 *     schema: z.object({ price: z.number().default(49) }),
 *     html: (p, f) => `<div class="tag">$${Math.round(p.price * Math.min(1, f.t / 1.5))}</div>`,
 *     css: ".tag{font:800 200px Inter;display:grid;place-items:center;height:100%}",
 *   })
 */
export function defineHtmlBlock<S extends z.ZodType>(def: {
  id: string;
  name: string;
  summary: string;
  category: BlockCategory;
  defaultDuration: number;
  schema: S;
  defaults?: z.input<S>;
  html: (props: z.output<S>, frame: HtmlFrameInfo) => string;
  css?: string | ((props: z.output<S>) => string);
  tailwind?: boolean;
  fonts?: string[];
  /** CSS background ("" = transparent). Default: the theme background, or transparent for overlays. */
  background?: string;
}): BlockDefinition<z.output<S>> {
  const source = (r: RenderArgs<z.output<S>>): HtmlSource => ({
    html: def.html(r.props, { t: r.t, progress: r.progress, duration: r.duration, time: r.time, width: r.width / r.unit, height: r.height / r.unit, theme: r.theme }),
    css: typeof def.css === "function" ? def.css(r.props) : (def.css ?? ""),
    tailwind: def.tailwind,
    fonts: def.fonts,
    background: def.background ?? (def.category === "overlay" ? "" : "var(--background)"),
  });
  const block = defineBlock({
    id: def.id,
    name: def.name,
    summary: def.summary,
    category: def.category,
    defaultDuration: def.defaultDuration,
    schema: def.schema,
    defaults: def.defaults,
    render: (r: RenderArgs<z.output<S>>) => draw(r as never, source(r)),
    prepare: (r: RenderArgs<z.output<S>>) => ensureHtmlFrame(args(r as never, source(r))).then(() => undefined),
  });
  return block as BlockDefinition<z.output<S>>;
}
