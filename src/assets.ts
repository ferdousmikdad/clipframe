import type { Asset, Project } from "./schema/index.js";

/**
 * Maps an asset's `file` (as written in project.json) to a URL the browser can fetch.
 * The default leaves it as is, so absolute URLs and paths relative to the page just work.
 */
export type AssetResolver = (file: string) => string;

export const identityResolver: AssetResolver = (file) => file;

/** A resolver that puts `base` in front of relative files, e.g. `assetsFrom("/projects/promo/assets/")`. */
export function assetsFrom(base: string): AssetResolver {
  const root = base.endsWith("/") ? base : base + "/";
  return (file) => (/^([a-z]+:|\/)/i.test(file) ? file : root + file.replace(/^\.\//, ""));
}

/** The audio asset a project field points to (by id, or by file name for convenience). */
export function findAsset(project: Project, ref: string | undefined): Asset | undefined {
  if (!ref) return undefined;
  return project.assets.find((a) => a.id === ref) ?? project.assets.find((a) => a.file === ref);
}
