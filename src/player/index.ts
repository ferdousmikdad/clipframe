// A small, framework-free player: draws the project on a <canvas> with the same renderer the
// exporter uses, plays music / voice / one-shot sounds / video sound, and (optionally) shows controls.
import { dimensions, projectDuration, type Project, type Resolution } from "../schema/index.js";
import { EMPTY_ASSETS, loadFonts, loadImageAssets, renderFrame, type BlockRegistry, type LoadedAssets } from "../engine/index.js";
import { createBuiltinRegistry } from "../blocks/index.js";
import { findAsset, identityResolver, type AssetResolver } from "../assets.js";
import { PreviewVideo } from "./preview-video.js";

export type PlayerOptions = {
  project: Project;
  /** Blocks the project can use. Default: all built-in blocks. */
  registry?: BlockRegistry;
  /** Maps an asset `file` to a URL. Default: use it as is. */
  resolveAsset?: AssetResolver;
  /** Canvas size. Default "720p" (export picks its own size; blocks scale, so it looks the same). */
  resolution?: Resolution;
  /** Show a play button, a scrubber and the time. Default true. */
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  /** Where the bundled .woff2 fonts are served (copy the package's fonts/ folder there). Null skips them. */
  fontsUrl?: string | null;
};

export type PlayerEvent = "play" | "pause" | "timeupdate" | "ended" | "ready";

export type Player = {
  readonly canvas: HTMLCanvasElement;
  readonly time: number;
  readonly duration: number;
  readonly playing: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(time: number): void;
  /** Swap in a changed project (keeps the playhead). */
  setProject(project: Project): void;
  on(event: PlayerEvent, fn: (time: number) => void): () => void;
  destroy(): void;
};

export function createPlayer(container: HTMLElement, options: PlayerOptions): Player {
  const registry = options.registry ?? createBuiltinRegistry();
  const resolve = options.resolveAsset ?? identityResolver;
  const resolution = options.resolution ?? "720p";
  let project = options.project;
  let time = 0;
  let playing = false;
  let destroyed = false;
  let assets: LoadedAssets = EMPTY_ASSETS;
  let videos = new Map<string, PreviewVideo>();
  const listeners = new Map<PlayerEvent, Set<(t: number) => void>>();
  const emit = (e: PlayerEvent) => listeners.get(e)?.forEach((fn) => fn(time));

  const root = document.createElement("div");
  root.className = "clipframe-player";
  root.style.cssText = "position:relative;display:flex;flex-direction:column;gap:8px;max-width:100%;";
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:auto;border-radius:8px;background:#000;cursor:pointer;";
  root.appendChild(canvas);
  container.appendChild(root);

  const music = new Audio();
  const voice = new Audio();
  for (const a of [music, voice]) a.preload = "auto";

  // ---------- drawing ----------
  let raf = 0;
  let redrawQueued = false;
  const clock = {
    get playing() {
      return playing;
    },
    redraw() {
      if (playing || redrawQueued) return;
      redrawQueued = true;
      requestAnimationFrame(() => {
        redrawQueued = false;
        draw();
      });
    },
  };

  function size() {
    const { width, height } = dimensions(project.meta.format, resolution);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw() {
    if (destroyed) return;
    size();
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    renderFrame(ctx, project, time, assets, registry);
    for (const v of videos.values()) {
      if (!v.touched && !v.el.paused) v.el.pause();
      v.touched = false;
    }
    ui?.update();
  }

  async function load() {
    const p = project;
    const images = await loadImageAssets(p, resolve);
    if (p !== project || destroyed) return;
    const next = new Map<string, PreviewVideo>();
    for (const a of p.assets.filter((x) => x.type === "video")) {
      const url = resolve(a.proxy ?? a.file);
      const old = videos.get(a.id);
      next.set(a.id, old && old.el.src.endsWith(url) ? old : new PreviewVideo(url, a, clock));
    }
    for (const [id, v] of videos) if (next.get(id) !== v) v.dispose();
    videos = next;
    assets = { get: images.get, video: (id) => videos.get(id) };
    const m = findAsset(p, p.audio?.music);
    const vo = findAsset(p, p.audio?.voice);
    setSrc(music, m ? resolve(m.file) : "");
    setSrc(voice, vo ? resolve(vo.file) : "");
    draw();
  }

  // ---------- sound ----------
  const sfx = new Map<string, HTMLAudioElement>();
  function playSoundsBetween(from: number, to: number) {
    for (const s of project.sounds ?? []) {
      if (s.t < from || s.t >= to) continue;
      const a = findAsset(project, s.asset);
      if (!a) continue;
      const url = resolve(a.file);
      let base = sfx.get(url);
      if (!base) sfx.set(url, (base = new Audio(url)));
      const el = base.cloneNode() as HTMLAudioElement;
      el.volume = Math.max(0, Math.min(1, 10 ** ((s.gain_db ?? 0) / 20)));
      void el.play().catch(() => undefined);
    }
  }

  function musicVolume(t: number, duration: number) {
    const a = project.audio;
    if (!a) return 0;
    const fade = a.fadeOut > 0 ? Math.min(1, Math.max(0, (duration - t) / a.fadeOut)) : 1;
    const duck = a.duck ?? 1;
    const under = duck < 1 && ([...videos.values()].some((v) => v.sounding) || (!voice.paused && !voice.ended));
    return Math.max(0, Math.min(1, a.volume * fade * (under ? duck : 1)));
  }

  // ---------- playback ----------
  function play() {
    if (playing || destroyed) return;
    const duration = projectDuration(project);
    if (duration <= 0) return;
    if (time >= duration - 0.01) time = 0;
    playing = true;
    const start = time;
    const t0 = performance.now();
    let last = start;
    music.currentTime = start + (project.audio?.musicStart ?? 0);
    voice.currentTime = start;
    voice.volume = Math.min(1, project.audio?.voiceVolume ?? 1);
    for (const a of [music, voice]) if (a.src) void a.play().catch(() => undefined);
    const tick = () => {
      if (!playing) return;
      const t = start + (performance.now() - t0) / 1000;
      if (t >= duration) {
        time = duration;
        stop();
        draw();
        emit("timeupdate");
        if (options.loop) {
          time = 0;
          play();
        } else emit("ended");
        return;
      }
      time = t;
      draw();
      playSoundsBetween(last, t);
      last = t;
      music.volume = musicVolume(t, duration);
      emit("timeupdate");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    emit("play");
    ui?.update();
  }

  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    music.pause();
    voice.pause();
    for (const v of videos.values()) v.el.pause();
  }

  function pause() {
    if (!playing) return;
    stop();
    draw();
    emit("pause");
  }

  function seek(t: number) {
    const was = playing;
    if (was) stop();
    time = Math.max(0, Math.min(t, projectDuration(project)));
    draw();
    emit("timeupdate");
    if (was) play();
  }

  canvas.addEventListener("click", () => (playing ? pause() : play()));

  // ---------- controls ----------
  const ui = options.controls === false ? null : controls(root, { play, pause, seek, get: () => ({ time, playing, duration: projectDuration(project), fps: project.meta.fps }) });

  const player: Player = {
    canvas,
    get time() {
      return time;
    },
    get duration() {
      return projectDuration(project);
    },
    get playing() {
      return playing;
    },
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    seek,
    setProject(p) {
      const assetsChanged = JSON.stringify(p.assets) !== JSON.stringify(project.assets) || JSON.stringify(p.audio) !== JSON.stringify(project.audio);
      project = p;
      time = Math.min(time, projectDuration(p));
      if (assetsChanged) void load();
      else if (!playing) draw();
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    destroy() {
      destroyed = true;
      stop();
      for (const v of videos.values()) v.dispose();
      setSrc(music, "");
      setSrc(voice, "");
      root.remove();
    },
  };

  size();
  void (options.fontsUrl === null ? Promise.resolve() : loadFonts(options.fontsUrl ?? "/fonts"))
    .then(load)
    .then(() => {
      emit("ready");
      if (options.autoPlay) play();
    });
  return player;
}

function setSrc(el: HTMLAudioElement, url: string) {
  if (!url) {
    if (el.getAttribute("src")) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
  } else if (el.getAttribute("src") !== url) el.src = url;
}

type Ctl = { play(): void; pause(): void; seek(t: number): void; get(): { time: number; playing: boolean; duration: number; fps: number } };

function controls(root: HTMLElement, c: Ctl) {
  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;gap:10px;font:12px/1 system-ui,sans-serif;color:inherit;";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.cssText = "width:32px;height:32px;border-radius:50%;border:0;cursor:pointer;background:#7c3aed;color:#fff;font-size:13px;flex:none;";
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.step = "any";
  range.style.cssText = "flex:1;min-width:0;accent-color:#7c3aed;";
  range.setAttribute("aria-label", "Seek");
  const label = document.createElement("span");
  label.style.cssText = "font-variant-numeric:tabular-nums;opacity:.75;flex:none;";
  bar.append(btn, range, label);
  root.appendChild(bar);
  btn.addEventListener("click", () => (c.get().playing ? c.pause() : c.play()));
  range.addEventListener("input", () => c.seek(Number(range.value)));
  const fmt = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, "0")}`;
  return {
    update() {
      const s = c.get();
      btn.textContent = s.playing ? "❚❚" : "▶";
      btn.setAttribute("aria-label", s.playing ? "Pause" : "Play");
      range.max = String(s.duration);
      range.value = String(s.time);
      label.textContent = `${fmt(s.time)} / ${fmt(s.duration)}`;
    },
  };
}
