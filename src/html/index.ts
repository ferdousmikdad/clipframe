// HTML / CSS / Tailwind in a video frame.
//
// Each frame of an html block is turned into an SVG <foreignObject> (as a data: URL, which Chrome draws
// without tainting the canvas), decoded to an image and drawn on the frame. Everything the HTML needs is
// embedded: fonts, images, Tailwind's generated CSS. CSS @keyframes animations are frozen at the frame's
// exact time (each animated element gets `animation-delay: <its delay − t>` and is paused), and the time is
// also given to CSS as variables: --t (seconds), --p (0–1 progress), --duration, plus the theme colours.
//
// Same code in the player, in browser export and in the CLI. Export awaits each frame (`prepare`), so the
// file is exact; the player shows the newest finished picture while the next one is being made.
import type { LoadedAssets } from "../engine/index.js";
import { BUNDLED_FONTS, bundledFontsUrl } from "../engine/fonts.js";
import type { Theme } from "../schema/index.js";

export type HtmlSource = {
  /** HTML (a fragment; no <html> / <body> needed). `src="asset:ID"` and `url(asset:ID)` use project images. */
  html: string;
  css?: string;
  /** Compile Tailwind v4 classes used in `html` (and @apply / @theme in `css`). */
  tailwind?: boolean;
  /** Extra font stylesheets to embed, e.g. a Google Fonts css2 URL. */
  fonts?: string[];
  /** Page background behind the HTML ("" = transparent). */
  background?: string;
};

export type HtmlFrameArgs = {
  id: string;
  source: HtmlSource;
  t: number;
  duration: number;
  width: number;
  height: number;
  theme: Theme;
  assets: LoadedAssets;
};

type Doc = {
  /** Serialised XHTML of the content with `__CF_A<i>__` placeholders on animated elements. */
  body: string;
  /** Animation delays (seconds) of each animated element, in placeholder order. */
  delays: number[][];
  css: string;
  /** Design size the HTML is laid out at (1080p-equivalent). */
  dw: number;
  dh: number;
  /** One glyph per embedded font face the content uses: the frame is ready once they all have ink. */
  sentinels: Sentinel[];
};

type Sentinel = { family: string; weight: string; style: string; ch: string };

/** Height (design px) of the strip under the frame that holds the font sentinels. */
const STRIP = 48;

const XHTML = "http://www.w3.org/1999/xhtml";
const MAX_FRAMES = 12; // decoded 1080p frames are ~8 MB each

// ---------- small helpers ----------

function hash(s: string): string {
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

const escapeXmlText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeXmlText(s).replace(/"/g, "&quot;");

async function toDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(bin)}`;
}

const urlCache = new Map<string, Promise<string>>();
/** Fetch a URL once and keep it as a data: URL (null on failure, e.g. CORS). */
function fetchAsDataUrl(url: string): Promise<string | null> {
  let p = urlCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.blob().then(toDataUrl);
    });
    urlCache.set(url, p);
    p.catch(() => urlCache.delete(url));
  }
  return p.catch(() => null);
}

const assetUrlCache = new WeakMap<object, string>();
/** A project image (already decoded by the asset loader) as a PNG data: URL. */
function assetDataUrl(assets: LoadedAssets, id: string): string | null {
  const img = assets.get(id);
  if (!img) return null;
  const hit = assetUrlCache.get(img);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.drawImage(img, 0, 0);
  const url = c.toDataURL("image/png");
  assetUrlCache.set(img, url);
  return url;
}

/** Replace `asset:ID` and http(s)/relative URLs in src / href / url() with embedded data: URLs. */
async function embedUrls(text: string, assets: LoadedAssets): Promise<string> {
  const re = /(\b(?:src|href|poster)\s*=\s*["']|url\(\s*["']?)(?!data:|#)([^"')\s]+)/gi;
  const found = new Set<string>();
  for (const m of text.matchAll(re)) found.add(m[2]);
  const map = new Map<string, string>();
  await Promise.all(
    [...found].map(async (u) => {
      const data = u.startsWith("asset:") ? assetDataUrl(assets, u.slice(6)) : await fetchAsDataUrl(new URL(u, document.baseURI).href);
      if (data) map.set(u, data);
    }),
  );
  return text.replace(re, (all, pre: string, u: string) => (map.has(u) ? pre + map.get(u) : all));
}

// ---------- fonts ----------

const UNICODE: Record<string, string> = {
  latin: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
  bengali: "U+0951-0952, U+0964-0965, U+0980-09FE, U+1CD0, U+1CD2, U+1CD5-1CD6, U+1CD8, U+1CE1, U+1CEA, U+1CED, U+1CF2, U+1CF5-1CF7, U+200C-200D, U+20B9, U+25CC, U+A8F1",
};

/** @font-face rules (with embedded files) for the bundled families the HTML uses, plus extra stylesheets. */
async function fontCss(text: string, theme: Theme, extra: string[]): Promise<string> {
  const lower = text.toLowerCase();
  const bangla = /[ঀ-৿]/.test(text);
  const fams = BUNDLED_FONTS.filter((f) => f.family === theme.font || f.family === "Inter" || lower.includes(f.family.toLowerCase()) || (bangla && f.subsets.includes("bengali")));
  const base = bundledFontsUrl();
  const rules = await Promise.all(
    fams.flatMap((f) =>
      f.weights.flatMap((w) =>
        f.subsets
          .filter((s) => s === "latin" || bangla)
          .map(async (s) => {
            const data = await fetchAsDataUrl(new URL(`${base}/${f.slug}-${s}-${w}.woff2`, document.baseURI).href);
            return data ? `@font-face{font-family:"${f.family}";font-weight:${w};font-style:normal;font-display:block;unicode-range:${UNICODE[s]};src:url(${data}) format("woff2")}` : "";
          }),
      ),
    ),
  );
  const sheets = await Promise.all(
    extra.map(async (href) => {
      try {
        const res = await fetch(href);
        if (!res.ok) return "";
        const css = await res.text();
        const abs = css.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/g, (_m, u: string) => `url(${new URL(u, href).href})`);
        // block (not swap): a frame must never be captured with a stand-in font
        return embedUrls(abs.replace(/font-display\s*:\s*[\w-]+/g, "font-display:block"), { get: () => undefined });
      } catch {
        return "";
      }
    }),
  );
  return rules.join("\n") + "\n" + sheets.join("\n");
}

// ---------- Tailwind ----------

type TwCompiler = { build(candidates: string[]): string };
const twCache = new Map<string, Promise<TwCompiler>>();

function tailwindCompiler(userCss: string): Promise<TwCompiler> {
  let p = twCache.get(userCss);
  if (!p) {
    p = (async () => {
      const [{ compile }, { TAILWIND_FILES }] = await Promise.all([import("tailwindcss"), import("./tailwind-css.js")]);
      return compile(`@import "tailwindcss";\n${userCss}`, {
        base: "/",
        loadStylesheet: async (id: string, base: string) => {
          const name = id === "tailwindcss" ? "index.css" : id.replace(/^tailwindcss\//, "").replace(/^\.\//, "");
          const content = TAILWIND_FILES[name];
          if (content === undefined) throw new Error(`Tailwind: cannot load "${id}"`);
          return { path: name, base, content };
        },
      } as never) as Promise<TwCompiler>;
    })();
    twCache.set(userCss, p);
  }
  return p;
}

/** Every class-like token in the HTML (Tailwind ignores the ones that aren't utilities). */
function candidates(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/\bclass(?:Name)?\s*=\s*("([^"]*)"|'([^']*)')/g)) for (const c of (m[2] ?? m[3]).split(/\s+/)) if (c) out.add(c);
  return [...out];
}

// ---------- building a document ----------

const docs = new Map<string, Promise<Doc>>();

/** Animation delays of every animated element, measured on a hidden live copy (inside a shadow root). */
function measureAnimations(fragment: DocumentFragment, css: string, dw: number, dh: number): { els: Element[]; delays: number[][] } {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-${dw * 2}px;top:0;width:${dw}px;height:${dh}px;visibility:hidden;pointer-events:none;contain:strict;`;
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const wrap = document.createElement("div");
  wrap.className = "cf-root";
  wrap.style.cssText = `width:${dw}px;height:${dh}px;`;
  wrap.appendChild(fragment);
  root.append(style, wrap);
  document.body.appendChild(host);
  const els: Element[] = [];
  const delays: number[][] = [];
  try {
    for (const el of wrap.querySelectorAll("*")) {
      const cs = getComputedStyle(el);
      if (!cs.animationName || cs.animationName === "none") continue;
      els.push(el);
      delays.push(cs.animationDelay.split(",").map((d) => (d.trim().endsWith("ms") ? parseFloat(d) / 1000 : parseFloat(d)) || 0));
    }
  } finally {
    host.remove();
  }
  // move the nodes back out of the shadow root so they can be serialised
  const back = document.createDocumentFragment();
  while (wrap.firstChild) back.appendChild(wrap.firstChild);
  fragment.appendChild(back);
  return { els, delays };
}

function inRanges(cp: number, ranges: string): boolean {
  if (!ranges.trim()) return true;
  return ranges.split(",").some((r) => {
    const m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(r.trim());
    if (!m) return false;
    const lo = parseInt(m[1].replace(/\?/g, "0"), 16);
    const hi = m[2] ? parseInt(m[2], 16) : m[1].includes("?") ? parseInt(m[1].replace(/\?/g, "f"), 16) : lo;
    return cp >= lo && cp <= hi;
  });
}

/** For every @font-face whose unicode-range covers a character of the content: that face plus one such character. */
function sentinelsFor(fontRules: string, text: string): Sentinel[] {
  const sheet = new CSSStyleSheet();
  try {
    sheet.replaceSync(fontRules);
  } catch {
    return [];
  }
  const chars = [...new Set([...text].filter((c) => /[\p{L}\p{N}]/u.test(c)))].slice(0, 4000);
  const out: Sentinel[] = [];
  const seen = new Set<string>();
  for (const rule of sheet.cssRules) {
    if (!(rule instanceof CSSFontFaceRule)) continue;
    const st = rule.style;
    const family = st.getPropertyValue("font-family").replace(/^["']|["']$/g, "");
    const range = st.getPropertyValue("unicode-range");
    const ch = chars.find((c) => inRanges(c.codePointAt(0)!, range));
    if (!family || !ch) continue;
    const weight = st.getPropertyValue("font-weight") || "400";
    const style = st.getPropertyValue("font-style") || "normal";
    const key = `${family}|${weight}|${style}|${range}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ family, weight: weight.split(" ")[0], style, ch });
  }
  return out;
}

async function buildDoc(src: HtmlSource, theme: Theme, assets: LoadedAssets, dw: number, dh: number): Promise<Doc> {
  const userCss = src.css ?? "";
  const html = await embedUrls(src.html, assets);
  let css = await embedUrls(userCss, assets);
  if (src.tailwind) css = (await tailwindCompiler(userCss)).build(candidates(src.html));
  const fonts = await fontCss(src.html + userCss, theme, src.fonts ?? []);
  css = fonts + "\n" + css;
  const text = new DOMParser().parseFromString(src.html, "text/html").body.textContent + " " + userCss + " Hক";
  // :root / :host / html / body in the author's CSS mean the frame's root element here
  css = css.replace(/:root\b|:host\b/g, ".cf-root");
  css = `.cf-root{box-sizing:border-box;position:relative;overflow:hidden;margin:0;font-family:"${theme.font}","Inter","Hind Siliguri","Noto Sans Bengali",sans-serif;color:var(--text);-webkit-font-smoothing:antialiased}.cf-root *,.cf-root *::before,.cf-root *::after{box-sizing:border-box;animation-play-state:paused!important}\n${css}`;

  const parsed = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
  parsed.querySelectorAll("script").forEach((s) => s.remove());
  const fragment = document.createDocumentFragment();
  for (const n of [...parsed.body.childNodes]) fragment.appendChild(document.importNode(n, true));

  let delays: number[][] = [];
  if (/animation/i.test(css)) {
    const m = measureAnimations(fragment, css, dw, dh);
    delays = m.delays;
    // a placeholder in each animated element's style: replaced per frame with its delays minus t
    m.els.forEach((el, i) => {
      const own = (el.getAttribute("style") ?? "").trim().replace(/;?$/, ";");
      el.setAttribute("style", `${own === ";" ? "" : own}animation-delay:__CF_A${i}__ !important;animation-play-state:paused !important;`);
    });
  }
  const ser = new XMLSerializer();
  let body = "";
  for (const n of fragment.childNodes) body += ser.serializeToString(n);
  return { body, delays, css, dw, dh, sentinels: sentinelsFor(fonts, text) };
}

function doc(src: HtmlSource, theme: Theme, assets: LoadedAssets, dw: number, dh: number): Promise<Doc> {
  const key = hash(JSON.stringify([src.html, src.css ?? "", !!src.tailwind, src.fonts ?? [], theme, dw, dh]));
  let p = docs.get(key);
  if (!p) {
    p = buildDoc(src, theme, assets, dw, dh);
    docs.set(key, p);
    p.catch(() => docs.delete(key));
    if (docs.size > 300) docs.delete(docs.keys().next().value!);
  }
  return p;
}

// ---------- one frame ----------

function frameSvg(d: Doc, a: HtmlFrameArgs): string {
  const { theme, t, duration } = a;
  const p = Math.min(1, Math.max(0, t / Math.max(duration, 1e-6)));
  const body = d.body.replace(/__CF_A(\d+)__/g, (_m, i: string) => d.delays[Number(i)].map((x) => `${(x - t).toFixed(4)}s`).join(","));
  const vars = `--t:${t.toFixed(4)};--p:${p.toFixed(5)};--duration:${duration};--primary:${theme.primary};--secondary:${theme.secondary};--background:${theme.background};--text:${theme.text};--radius:${theme.radius}px;--font:"${theme.font}";`;
  const bg = a.source.background ? `background:${a.source.background};` : "";
  const u = a.height / d.dh;
  const cells = d.sentinels
    .map((s, i) => `<span style="position:absolute;left:${i * STRIP}px;top:0;width:${STRIP}px;height:${STRIP}px;font:${s.style} ${s.weight} ${STRIP * 0.7}px &quot;${escapeAttr(s.family)}&quot;,monospace;line-height:${STRIP}px;color:#fff;text-align:center;overflow:hidden">${escapeXmlText(s.ch)}</span>`)
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${a.width}" height="${a.height + Math.round(STRIP * u)}" viewBox="0 0 ${d.dw} ${d.dh + STRIP}" preserveAspectRatio="none">` +
    `<foreignObject x="0" y="0" width="${d.dw}" height="${d.dh + STRIP}">` +
    `<div xmlns="${XHTML}" style="position:relative;width:${d.dw}px;height:${d.dh + STRIP}px;margin:0">` +
    `<div class="cf-root" style="${escapeAttr(vars + bg)}width:${d.dw}px;height:${d.dh}px;">` +
    `<style>${escapeXmlText(d.css)}</style>${body}</div>` +
    `<div style="position:absolute;left:0;top:${d.dh}px;width:${d.dw}px;height:${STRIP}px;overflow:hidden">${cells}</div>` +
    `</div></foreignObject></svg>`
  );
}

type Picture = HTMLCanvasElement | OffscreenCanvas;
type Frame = { img: Picture; key: string };
const frames = new Map<string, Picture>();
const lastFor = new Map<string, Frame>();
const pending = new Map<string, Promise<Picture>>();
const wanted = new Map<string, () => Promise<unknown>>();
const busy = new Set<string>();
const listeners = new Set<() => void>();

/** Called whenever a new HTML frame finished in the background (players redraw on it). */
export function onHtmlFrame(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function frameKey(a: HtmlFrameArgs): string {
  const s = a.source;
  return `${a.id}|${hash(JSON.stringify([s.html, s.css ?? "", !!s.tailwind, s.fonts ?? [], s.background ?? "", a.theme]))}|${a.width}x${a.height}|${Math.round(a.t * 1000)}|${a.duration}`;
}

function designSize(w: number, h: number) {
  const u = Math.min(w, h) / 1080;
  return { dw: Math.round(w / u), dh: Math.round(h / u) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Sentinel cells that never got ink for a document (a face without that glyph): skipped after the first timeout. */
const deadCells = new WeakMap<Doc, Set<number>>();

/** Wait until every font sentinel under the frame has ink (fonts inside an SVG image load after decode()). */
async function fontsReady(img: HTMLImageElement, d: Doc, w: number, h: number, stripH: number): Promise<void> {
  if (!d.sentinels.length) return;
  const cell = stripH; // cells are square: STRIP design px wide and tall
  const probe = new OffscreenCanvas(Math.max(1, Math.min(w, cell * d.sentinels.length)), Math.max(1, stripH));
  const pctx = probe.getContext("2d", { willReadFrequently: true })!;
  const dead = deadCells.get(d) ?? new Set<number>();
  deadCells.set(d, dead);
  const started = performance.now();
  for (;;) {
    pctx.clearRect(0, 0, probe.width, probe.height);
    pctx.drawImage(img, 0, h, probe.width, stripH, 0, 0, probe.width, stripH);
    const px = pctx.getImageData(0, 0, probe.width, probe.height).data;
    const missing: number[] = [];
    d.sentinels.forEach((_s, i) => {
      if (dead.has(i)) return;
      const x0 = Math.floor(i * cell);
      const x1 = Math.min(probe.width, Math.floor((i + 1) * cell));
      if (x0 >= probe.width) return;
      for (let y = 0; y < probe.height; y++) for (let x = x0; x < x1; x++) if (px[(y * probe.width + x) * 4 + 3] > 40) return;
      missing.push(i);
    });
    if (!missing.length) return;
    if (performance.now() - started > 2500) {
      for (const i of missing) dead.add(i);
      console.warn(`[clipframe] html: font(s) did not load in time: ${missing.map((i) => d.sentinels[i].family + " " + d.sentinels[i].weight).join(", ")}`);
      return;
    }
    await sleep(8);
  }
}

async function rasterize(a: HtmlFrameArgs, key: string): Promise<Picture> {
  const { dw, dh } = designSize(a.width, a.height);
  const d = await doc(a.source, a.theme, a.assets, dw, dh);
  const svg = frameSvg(d, a).replace(/[^\x00-\x7e]/gu, (c) => `&#${c.codePointAt(0)};`);
  (globalThis as { __clipframeDebugSvg?: (svg: string, id: string) => void }).__clipframeDebugSvg?.(svg, a.id);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const stripH = img.naturalHeight - a.height;
  await fontsReady(img, d, a.width, a.height, stripH);
  const pic: Picture = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(a.width, a.height) : Object.assign(document.createElement("canvas"), { width: a.width, height: a.height });
  (pic.getContext("2d") as CanvasRenderingContext2D).drawImage(img, 0, 0, a.width, a.height, 0, 0, a.width, a.height);
  frames.set(key, pic);
  if (frames.size > MAX_FRAMES) frames.delete(frames.keys().next().value!);
  lastFor.set(a.id, { img: pic, key });
  return pic;
}

/** Make the frame (once) and wait for it. Used by `prepare` so exports are exact. */
export function ensureHtmlFrame(a: HtmlFrameArgs): Promise<Picture> {
  const key = frameKey(a);
  const hit = frames.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    p = rasterize(a, key).finally(() => pending.delete(key));
    pending.set(key, p);
  }
  return p;
}

/**
 * The picture for this frame if it is ready; otherwise the newest picture of the same block (and the
 * exact one is made in the background, newest request first).
 */
export function htmlFrame(a: HtmlFrameArgs): Picture | null {
  const key = frameKey(a);
  const hit = frames.get(key);
  if (hit) return hit;
  wanted.set(a.id, () => ensureHtmlFrame(a));
  if (!busy.has(a.id)) pump(a.id);
  return lastFor.get(a.id)?.img ?? null;
}

function pump(id: string) {
  const job = wanted.get(id);
  if (!job) return void busy.delete(id);
  wanted.delete(id);
  busy.add(id);
  job()
    .catch((e) => console.error("[clipframe] html frame:", e))
    .finally(() => {
      listeners.forEach((fn) => fn());
      pump(id);
    });
}
