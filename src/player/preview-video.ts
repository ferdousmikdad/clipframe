// One <video> element per video asset, kept in step with the player's clock.
// Paused: seek to the asked time and redraw when the frame arrives. Playing: play along and correct drift.
import type { VideoHints, VideoSource } from "../engine/index.js";
import type { Asset } from "../schema/index.js";

const DRIFT = 0.25; // seconds of drift tolerated while playing

export type VideoClock = { playing: boolean; redraw(): void };

export class PreviewVideo implements VideoSource {
  readonly el: HTMLVideoElement;
  touched = false;
  private want = -1;

  constructor(
    url: string,
    private meta: Pick<Asset, "duration" | "width" | "height">,
    private clock: VideoClock,
  ) {
    const el = document.createElement("video");
    el.src = url;
    el.preload = "auto";
    el.playsInline = true;
    el.muted = true;
    el.crossOrigin = "anonymous";
    el.addEventListener("loadeddata", () => clock.redraw());
    el.addEventListener("seeked", () => {
      if (!clock.playing && this.want >= 0 && Math.abs(el.currentTime - this.want) > 1 / 60) el.currentTime = this.want;
      clock.redraw();
    });
    this.el = el;
  }

  get duration() {
    return Number.isFinite(this.el.duration) && this.el.duration > 0 ? this.el.duration : (this.meta.duration ?? 0);
  }
  get width() {
    return this.el.videoWidth || this.meta.width || 0;
  }
  get height() {
    return this.el.videoHeight || this.meta.height || 0;
  }

  frame(t: number, hints: VideoHints = {}): CanvasImageSource | null {
    const el = this.el;
    this.touched = true;
    this.want = t;
    if (this.clock.playing) {
      el.playbackRate = hints.speed ?? 1;
      el.muted = !!hints.muted;
      el.volume = Math.max(0, Math.min(1, hints.volume ?? 1));
      if (el.paused) {
        el.currentTime = t;
        void el.play().catch(() => undefined);
      } else if (Math.abs(el.currentTime - t) > DRIFT) el.currentTime = t;
    } else {
      if (!el.paused) el.pause();
      el.muted = true;
      if (!el.seeking && Math.abs(el.currentTime - t) > 1 / 60) el.currentTime = t;
    }
    return el.readyState >= 2 ? el : null;
  }

  /** Playing with sound right now (music ducks under it). */
  get sounding() {
    return !this.el.paused && !this.el.muted && this.el.volume > 0;
  }

  dispose() {
    this.el.pause();
    this.el.removeAttribute("src");
    this.el.load();
  }
}
