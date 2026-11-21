// Which video frames a project shows at a given time, and which video scenes make sound.
import { frameAt, resolveTimeline, type Project, type Scene } from "../schema/index.js";
import { resolveProps, type BlockRegistry } from "../engine/index.js";
import { videoSourceTime, type VideoProps } from "../blocks/blocks/video.js";

export type VideoNeed = { asset: string; t: number };

export const frameKey = (asset: string, t: number) => `${asset}@${Math.round(t * 1e6)}`;

export function videoProps(scene: Scene, registry: BlockRegistry): VideoProps | null {
  if (scene.block !== "video") return null;
  const def = registry.get("video");
  return def ? (resolveProps(def, scene.props) as VideoProps) : null;
}

/** Source frames on screen at `time` (the current scene, plus the outgoing one during a transition). */
export function videoNeeds(project: Project, time: number, durations: Map<string, number>, registry: BlockRegistry): VideoNeed[] {
  const state = frameAt(project, time);
  const out: VideoNeed[] = [];
  for (const layer of [state.previous, state.current]) {
    if (!layer) continue;
    const p = videoProps(layer.scene, registry);
    if (!p?.asset || !durations.has(p.asset)) continue;
    out.push({ asset: p.asset, t: videoSourceTime(p, layer.t, durations.get(p.asset)) });
  }
  return out;
}

/** Video assets used by video scenes. */
export function videoAssetIds(project: Project): string[] {
  const ids = new Set<string>();
  for (const s of project.scenes) {
    const a = s.props.asset;
    if (s.block === "video" && typeof a === "string" && a && project.assets.some((x) => x.id === a && x.type === "video")) ids.add(a);
  }
  return [...ids];
}

/** Video scenes with sound, in timeline order: where they play and which part of the source. */
export function soundingVideoScenes(project: Project, registry: BlockRegistry) {
  return resolveTimeline(project)
    .map(({ scene, start, end }) => ({ scene, start, end, p: videoProps(scene, registry) }))
    .filter((x): x is { scene: Scene; start: number; end: number; p: VideoProps } => !!x.p?.asset && !x.p.mute && !x.p.freeze && x.p.volume > 0);
}
