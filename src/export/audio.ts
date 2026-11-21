// Export sound: music (volume, fade-out, ducking), voice-over, one-shot sounds and the sound of every video scene.
import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from "mediabunny";
import type { Project } from "../schema/index.js";
import type { BlockRegistry } from "../engine/index.js";
import { findAsset, type AssetResolver } from "../assets.js";
import { soundingVideoScenes } from "./plan.js";

export const SAMPLE_RATE = 48000;
const EDGE = 0.02; // seconds of fade at scene edges (no clicks)
const DUCK_RAMP = 0.25;

async function decode(ctx: BaseAudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load audio ${url} (${res.status})`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** Mix the project's sound, or null when there is none. */
export async function mixAudio(project: Project, duration: number, resolve: AssetResolver, registry: BlockRegistry): Promise<AudioBuffer | null> {
  const music = findAsset(project, project.audio?.music);
  const voice = findAsset(project, project.audio?.voice);
  const scenes = soundingVideoScenes(project, registry).filter((s) => s.start < duration);
  const sounds = (project.sounds ?? []).filter((s) => s.t < duration && findAsset(project, s.asset));
  if (!music && !voice && !scenes.length && !sounds.length) return null;

  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE);
  let hasSound = false;

  for (const s of scenes) {
    const asset = project.assets.find((a) => a.id === s.p.asset);
    if (!asset) continue;
    const input = new Input({ source: new UrlSource(resolve(asset.file)), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) continue;
      const end = Math.min(s.end, duration);
      const srcStart = s.p.start;
      const srcEnd = srcStart + (end - s.start) * s.p.speed;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, s.start);
      gain.gain.linearRampToValueAtTime(s.p.volume, s.start + EDGE);
      gain.gain.setValueAtTime(s.p.volume, Math.max(s.start + EDGE, end - EDGE));
      gain.gain.linearRampToValueAtTime(0, end);
      gain.connect(ctx.destination);
      for await (const chunk of new AudioBufferSink(track).buffers(srcStart, srcEnd)) {
        const from = Math.max(chunk.timestamp, srcStart);
        const to = Math.min(chunk.timestamp + chunk.duration, srcEnd);
        if (to <= from) continue;
        const node = ctx.createBufferSource();
        node.buffer = chunk.buffer;
        node.playbackRate.value = s.p.speed;
        node.connect(gain);
        node.start(s.start + (from - srcStart) / s.p.speed, from - chunk.timestamp, to - from);
        hasSound = true;
      }
    } finally {
      input.dispose();
    }
  }

  // One-shot sounds (whooshes, clicks, pops…) at their timeline times.
  const decoded = new Map<string, AudioBuffer>();
  for (const s of sounds) {
    const url = resolve(findAsset(project, s.asset)!.file);
    if (!decoded.has(url)) decoded.set(url, await decode(ctx, url));
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = 10 ** ((s.gain_db ?? 0) / 20);
    src.buffer = decoded.get(url)!;
    src.connect(g).connect(ctx.destination);
    src.start(s.t);
    hasSound = true;
  }

  // Narration / voice-over from the start of the video.
  let voiceEnd = 0;
  if (voice) {
    const src = ctx.createBufferSource();
    src.buffer = await decode(ctx, resolve(voice.file));
    voiceEnd = src.buffer.duration;
    const g = ctx.createGain();
    g.gain.value = project.audio?.voiceVolume ?? 1;
    src.connect(g).connect(ctx.destination);
    src.start(0);
    hasSound = true;
  }

  if (music) {
    const src = ctx.createBufferSource();
    src.buffer = await decode(ctx, resolve(music.file));
    const gain = ctx.createGain();
    const vol = project.audio?.volume ?? 1;
    const duck = project.audio?.duck ?? 1;
    const fade = Math.min(project.audio?.fadeOut ?? 0, duration);
    // Duck under each video with sound and under the voice: ramp down at its start, back up at its end.
    const under = [...scenes.map((s) => ({ start: s.start, end: s.end })), ...(voiceEnd ? [{ start: 0, end: voiceEnd }] : [])];
    const level = (t: number) => (duck < 1 && under.some((s) => t >= s.start && t < s.end) ? vol * duck : vol);
    gain.gain.setValueAtTime(level(0), 0);
    if (duck < 1) {
      for (const s of under) {
        for (const [at, v] of [[s.start, vol * duck], [s.end, level(s.end)]] as const) {
          if (at <= 0 || at >= duration) continue;
          gain.gain.setValueAtTime(level(Math.max(0, at - DUCK_RAMP)), Math.max(0, at - DUCK_RAMP));
          gain.gain.linearRampToValueAtTime(v, at);
        }
      }
    }
    if (fade > 0) {
      gain.gain.setValueAtTime(level(duration - fade), Math.max(0, duration - fade));
      gain.gain.linearRampToValueAtTime(0, duration);
    }
    src.connect(gain).connect(ctx.destination);
    src.start(0, Math.min(project.audio?.musicStart ?? 0, Math.max(0, src.buffer.duration - 0.01)));
    hasSound = true;
  }
  return hasSound ? ctx.startRendering() : null;
}
