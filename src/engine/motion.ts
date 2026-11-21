/**
 * Motion API: the animation helpers Remotion components are written with, re-implemented from
 * scratch for Clipframe's canvas engine (no Remotion code or dependency), so existing
 * Remotion-style animation code ports almost line by line.
 *
 * Everything works in **seconds** (Clipframe's unit). When porting Remotion code, replace
 * `frame` with `t = frame / fps` and frame counts with seconds. All functions are pure and
 * deterministic: the same inputs always give the same pixels (preview = export).
 */
import { clamp, type Easing as EasingFn } from "./easing.js";
import { mix } from "./color.js";
import { hashString } from "./random.js";

export type Extrapolate = "extend" | "clamp" | "identity";

export type InterpolateOptions = {
  easing?: EasingFn;
  extrapolateLeft?: Extrapolate;
  extrapolateRight?: Extrapolate;
};

/**
 * Map `input` through matching ranges, e.g. `interpolate(t, [0, 0.3, 1], [0, 1.1, 1])`.
 * `inputRange` must be strictly increasing. Defaults extrapolate (like Remotion); pass
 * `extrapolateLeft/Right: "clamp"` to hold the end values.
 */
export function interpolate(input: number, inputRange: readonly number[], outputRange: readonly number[], options: InterpolateOptions = {}): number {
  if (inputRange.length !== outputRange.length) throw new Error("interpolate: inputRange and outputRange must have the same length");
  if (inputRange.length < 2) throw new Error("interpolate: ranges need at least 2 values");
  for (let i = 1; i < inputRange.length; i++) {
    if (!(inputRange[i] > inputRange[i - 1])) throw new Error("interpolate: inputRange must be strictly increasing");
  }
  const { easing = (x: number) => x, extrapolateLeft = "extend", extrapolateRight = "extend" } = options;
  let seg = 1;
  while (seg < inputRange.length - 1 && input > inputRange[seg]) seg++;
  const i0 = inputRange[seg - 1];
  const i1 = inputRange[seg];
  const o0 = outputRange[seg - 1];
  const o1 = outputRange[seg];

  if (input < inputRange[0]) {
    if (extrapolateLeft === "clamp") return outputRange[0];
    if (extrapolateLeft === "identity") return input;
  }
  if (input > inputRange[inputRange.length - 1]) {
    if (extrapolateRight === "clamp") return outputRange[outputRange.length - 1];
    if (extrapolateRight === "identity") return input;
  }
  const p = (input - i0) / (i1 - i0);
  // Easing applies inside the range; outside it the line keeps its end slope.
  const eased = p >= 0 && p <= 1 ? easing(p) : p;
  return o0 + (o1 - o0) * eased;
}

/** Interpolate between hex colours, e.g. `interpolateColors(t, [0, 1], ["#000", "#7C3AED"])`. */
export function interpolateColors(input: number, inputRange: readonly number[], colors: readonly string[]): string {
  if (inputRange.length !== colors.length) throw new Error("interpolateColors: ranges must have the same length");
  if (input <= inputRange[0]) return colors[0];
  const last = inputRange.length - 1;
  if (input >= inputRange[last]) return colors[last];
  let seg = 1;
  while (input > inputRange[seg]) seg++;
  const p = (input - inputRange[seg - 1]) / (inputRange[seg] - inputRange[seg - 1]);
  return mix(colors[seg - 1], colors[seg], p);
}

// ---------------------------------------------------------------- springs

export type SpringConfig = {
  /** Default 10, like Remotion. */
  damping?: number;
  /** Default 1. */
  mass?: number;
  /** Default 100. */
  stiffness?: number;
  /** Never go past the target. */
  overshootClamping?: boolean;
};

export type SpringOptions = {
  /** Seconds since the spring was triggered. */
  t: number;
  from?: number;
  to?: number;
  /** Seconds to wait before starting. */
  delay?: number;
  /** Stretch or squeeze the spring so it settles after this many seconds. */
  duration?: number;
  config?: SpringConfig;
};

const DEFAULT_SPRING: Required<SpringConfig> = { damping: 10, mass: 1, stiffness: 100, overshootClamping: false };

/** Closed-form damped harmonic oscillator, 0 → 1. */
function springUnit(t: number, c: Required<SpringConfig>): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(c.stiffness / c.mass);
  const zeta = c.damping / (2 * Math.sqrt(c.stiffness * c.mass));
  let x: number;
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    x = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  } else if (zeta === 1) {
    x = 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  } else {
    const s = w0 * Math.sqrt(zeta * zeta - 1);
    const r1 = -zeta * w0 + s;
    const r2 = -zeta * w0 - s;
    x = 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  }
  return c.overshootClamping ? Math.min(x, 1) : x;
}

const settleCache = new Map<string, number>();

/** Seconds until a spring stays within `threshold` of its target. */
export function measureSpring(config: SpringConfig = {}, threshold = 0.005): number {
  const c = { ...DEFAULT_SPRING, ...config };
  const key = `${c.damping}|${c.mass}|${c.stiffness}|${c.overshootClamping}|${threshold}`;
  const hit = settleCache.get(key);
  if (hit !== undefined) return hit;
  const step = 1 / 240;
  let lastOutside = 0;
  for (let t = step; t < 30; t += step) {
    if (Math.abs(springUnit(t, c) - 1) > threshold) lastOutside = t;
    else if (t - lastOutside > 1) break;
  }
  const settle = lastOutside + step;
  settleCache.set(key, settle);
  return settle;
}

/** A spring from `from` (0) to `to` (1). Like Remotion's `spring()`, in seconds. */
export function spring({ t, from = 0, to = 1, delay = 0, duration, config = {} }: SpringOptions): number {
  const c = { ...DEFAULT_SPRING, ...config };
  let local = t - delay;
  if (duration !== undefined && duration > 0) local *= measureSpring(c) / duration;
  return from + (to - from) * springUnit(local, c);
}

// ---------------------------------------------------------------- easing

/** Cubic-bezier easing like CSS `cubic-bezier(x1, y1, x2, y2)`. */
function bezier(x1: number, y1: number, x2: number, y2: number): EasingFn {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const solve = (x: number) => {
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-6) return s;
      const d = slopeX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
      if (sampleX(s) < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  };
  return (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : sampleY(solve(x)));
}

/** Easing helpers with Remotion's names (`Easing.bezier`, `Easing.out(Easing.cubic)`, …). */
export const Easing = {
  linear: (x: number) => x,
  ease: bezier(0.25, 0.1, 0.25, 1),
  quad: (x: number) => x * x,
  cubic: (x: number) => x * x * x,
  poly: (n: number) => (x: number) => x ** n,
  sin: (x: number) => 1 - Math.cos((x * Math.PI) / 2),
  circle: (x: number) => 1 - Math.sqrt(1 - x * x),
  exp: (x: number) => (x === 0 ? 0 : 2 ** (10 * (x - 1))),
  back:
    (s = 1.70158) =>
    (x: number) =>
      x * x * ((s + 1) * x - s),
  elastic: (bounciness = 1) => {
    const p = bounciness * Math.PI;
    return (x: number) => 1 - Math.cos((x * Math.PI) / 2) ** 3 * Math.cos(x * p);
  },
  bounce: (x: number) => {
    if (x < 1 / 2.75) return 7.5625 * x * x;
    if (x < 2 / 2.75) return 7.5625 * (x -= 1.5 / 2.75) * x + 0.75;
    if (x < 2.5 / 2.75) return 7.5625 * (x -= 2.25 / 2.75) * x + 0.9375;
    return 7.5625 * (x -= 2.625 / 2.75) * x + 0.984375;
  },
  bezier,
  in: (e: EasingFn) => e,
  out: (e: EasingFn) => (x: number) => 1 - e(1 - x),
  inOut: (e: EasingFn) => (x: number) => (x < 0.5 ? e(x * 2) / 2 : 1 - e((1 - x) * 2) / 2),
};

// ---------------------------------------------------------------- time helpers

/** Local time inside a sequence that starts at `from` (and lasts `duration`), or null when outside. */
export function sequence(t: number, from: number, duration = Infinity): number | null {
  const local = t - from;
  return local >= 0 && local < duration ? local : null;
}

export type SeriesItem = { index: number; t: number; duration: number; progress: number };

/** Items played back to back: which one is on screen at `t`, and its local time. Null after the end. */
export function series(t: number, durations: readonly number[], offset = 0): SeriesItem | null {
  let start = offset;
  if (t < start) return null;
  for (let i = 0; i < durations.length; i++) {
    const d = durations[i];
    if (t < start + d) return { index: i, t: t - start, duration: d, progress: d > 0 ? (t - start) / d : 1 };
    start += d;
  }
  return null;
}

/** Time inside a repeating loop of `period` seconds. */
export function loop(t: number, period: number): number {
  if (period <= 0) return 0;
  return ((t % period) + period) % period;
}

/** Progress (0..1) of item `index` when items start `each` seconds apart and animate for `duration`. */
export function staggered(t: number, index: number, each: number, duration: number, start = 0): number {
  return duration > 0 ? clamp((t - start - index * each) / duration) : t >= start + index * each ? 1 : 0;
}

// ---------------------------------------------------------------- noise

const fade = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);

function lattice(seed: number, ...coords: number[]): number {
  let h = seed;
  for (const c of coords) h = Math.imul(h ^ (c | 0), 0x27d4eb2d) ^ (h >>> 15);
  h = Math.imul(h ^ (h >>> 13), 0x165667b1);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

const seedOf = (seed: string | number) => (typeof seed === "string" ? hashString(seed) : seed >>> 0);

/** Smooth deterministic noise in -1..1 (value noise with quintic fade). */
export function noise2D(seed: string | number, x: number, y: number): number {
  const s = seedOf(seed);
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const a = lattice(s, xi, yi);
  const b = lattice(s, xi + 1, yi);
  const c = lattice(s, xi, yi + 1);
  const d = lattice(s, xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 3D version (e.g. x, y and time). */
export function noise3D(seed: string | number, x: number, y: number, z: number): number {
  const zi = Math.floor(z);
  const w = fade(z - zi);
  const s = seedOf(seed);
  const lo = noise2D(Math.imul(s ^ zi, 0x9e3779b1) >>> 0, x, y);
  const hi = noise2D(Math.imul(s ^ (zi + 1), 0x9e3779b1) >>> 0, x, y);
  return lo + (hi - lo) * w;
}
