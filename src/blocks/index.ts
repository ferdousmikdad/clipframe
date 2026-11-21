import { z } from "zod";
import * as engine from "../engine/index.js";
import { createRegistry, type BlockDefinition } from "../engine/index.js";
import video from "./blocks/video.js";
import titleReveal from "./blocks/title-reveal.js";
import kineticText from "./blocks/kinetic-text.js";
import uiMockup from "./blocks/ui-mockup.js";
import cursorClick from "./blocks/cursor-click.js";
import zoomPan from "./blocks/zoom-pan.js";
import featureCallout from "./blocks/feature-callout.js";
import featureGrid from "./blocks/feature-grid.js";
import statsCounter from "./blocks/stats-counter.js";
import beforeAfter from "./blocks/before-after.js";
import testimonial from "./blocks/testimonial.js";
import pricingCard from "./blocks/pricing-card.js";
import logoOutro from "./blocks/logo-outro.js";
import background from "./blocks/background.js";
import picture from "./blocks/picture.js";
import lowerThird from "./blocks/lower-third.js";
import captions from "./blocks/captions.js";
import watermark from "./blocks/watermark.js";
import { html, htmlOverlay, defineHtmlBlock } from "./blocks/html.js";
import { defineBlock } from "./define.js";
import * as shared from "./shared.js";
import { drawCard, drawIconTile } from "./card.js";
import { drawFrame, layoutFrame } from "./frames.js";

export const builtinBlocks: BlockDefinition[] = [
  video,
  titleReveal,
  kineticText,
  uiMockup,
  cursorClick,
  zoomPan,
  featureCallout,
  featureGrid,
  statsCounter,
  beforeAfter,
  testimonial,
  pricingCard,
  logoOutro,
  background,
  picture,
  html,
  lowerThird,
  captions,
  watermark,
  htmlOverlay,
];

export { defineBlock, defineHtmlBlock };
export type { HtmlFrameInfo } from "./blocks/html.js";
export { onHtmlFrame, ensureHtmlFrame, type HtmlSource } from "../html/index.js";
export { color, assetRef, videoRef, iconName, point, drawIcon, drawBackdrop, drawPlaceholder, enter, graphemes, initials, hasIcon, ICON_NAMES } from "./shared.js";
export { drawCard, drawIconTile, drawFrame, layoutFrame };
export * from "./describe.js";
export { videoSourceTime, colourFilter, type VideoProps } from "./blocks/video.js";

/** A fresh registry with all built-in blocks. Add your own with `registry.add(block)`. */
export function createBuiltinRegistry() {
  return createRegistry(builtinBlocks);
}

/** Everything a plugin module receives: `export default (api) => api.defineBlock({...})`. */
export const pluginApi = { z, defineBlock, defineHtmlBlock, ...engine, ...shared, drawCard, drawIconTile, drawFrame, layoutFrame };
export type PluginApi = typeof pluginApi;

/** Turn a plugin module's default export (factory, definition or array) into block definitions. */
export function resolvePluginExport(exported: unknown, source: string): BlockDefinition[] {
  const value = typeof exported === "function" ? (exported as (api: PluginApi) => unknown)(pluginApi) : exported;
  const list = (Array.isArray(value) ? value : [value]) as BlockDefinition[];
  for (const b of list) {
    if (!b || typeof b.id !== "string" || typeof b.render !== "function" || !b.schema) {
      throw new Error(`Plugin ${source}: default export must be a block definition (id, schema, render)`);
    }
    b.plugin = source;
    if (b.defaults === undefined) b.defaults = b.schema.parse({});
  }
  return list;
}
