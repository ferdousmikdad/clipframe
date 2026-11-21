import { describe, expect, it } from "vitest";
import { motion } from "../src/index.js";

const { interpolate, interpolateColors, spring, measureSpring, Easing, sequence, series, loop, staggered, noise2D, noise3D } = motion;

describe("motion.interpolate", () => {
  it("maps multi-point ranges and extrapolates by default", () => {
    expect(interpolate(0.5, [0, 1, 2], [0, 10, 0])).toBe(5);
    expect(interpolate(1.5, [0, 1, 2], [0, 10, 0])).toBe(5);
    expect(interpolate(3, [0, 1], [0, 10])).toBe(30);
    expect(interpolate(-1, [0, 1], [0, 10])).toBe(-10);
  });

  it("clamps and passes through on request", () => {
    expect(interpolate(3, [0, 1], [0, 10], { extrapolateRight: "clamp" })).toBe(10);
    expect(interpolate(-1, [0, 1], [0, 10], { extrapolateLeft: "clamp" })).toBe(0);
    expect(interpolate(7, [0, 1], [0, 10], { extrapolateRight: "identity" })).toBe(7);
  });

  it("applies easing inside a segment", () => {
    expect(interpolate(0.5, [0, 1], [0, 100], { easing: Easing.cubic })).toBeCloseTo(12.5);
  });

  it("rejects bad ranges", () => {
    expect(() => interpolate(0, [1, 0], [0, 1])).toThrow(/increasing/);
    expect(() => interpolate(0, [0, 1], [0])).toThrow(/same length/);
  });

  it("interpolates colours", () => {
    expect(interpolateColors(0, [0, 1], ["#000000", "#ffffff"]).toLowerCase()).toMatch(/#000000|rgb\(0, ?0, ?0/);
    expect(interpolateColors(5, [0, 1], ["#000000", "#ff0000"])).toBe("#ff0000");
  });
});

describe("motion.spring", () => {
  it("starts at `from`, settles at `to` and respects delay", () => {
    expect(spring({ t: 0 })).toBe(0);
    expect(spring({ t: 10 })).toBeCloseTo(1, 3);
    expect(spring({ t: 0.5, delay: 1 })).toBe(0);
    expect(spring({ t: 10, from: 20, to: 80 })).toBeCloseTo(80, 1);
  });

  it("default config overshoots; overshootClamping stops it", () => {
    const peak = (clamp: boolean) => Math.max(...Array.from({ length: 300 }, (_, i) => spring({ t: i / 100, config: { overshootClamping: clamp } })));
    expect(peak(false)).toBeGreaterThan(1.05);
    expect(peak(true)).toBeLessThanOrEqual(1);
  });

  it("duration stretches the spring to settle on time", () => {
    const natural = measureSpring({ damping: 200 });
    expect(natural).toBeGreaterThan(0);
    expect(Math.abs(spring({ t: 0.5, duration: 0.5, config: { damping: 200 } }) - 1)).toBeLessThan(0.01);
    expect(spring({ t: 0.25, duration: 0.5, config: { damping: 200 } })).toBeLessThan(0.99);
  });

  it("handles over-damped springs", () => {
    const v = spring({ t: 0.3, config: { damping: 60, stiffness: 100 } });
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(1);
  });
});

describe("motion easing and time helpers", () => {
  it("bezier and wrappers hit both ends", () => {
    for (const e of [Easing.ease, Easing.bezier(0.33, 1, 0.68, 1), Easing.out(Easing.cubic), Easing.inOut(Easing.quad), Easing.bounce, Easing.elastic(1)]) {
      expect(e(0)).toBeCloseTo(0);
      expect(e(1)).toBeCloseTo(1);
    }
    expect(Easing.bezier(0.42, 0, 0.58, 1)(0.5)).toBeCloseTo(0.5, 3);
  });

  it("sequence, series, loop and staggered", () => {
    expect(sequence(1.5, 1, 2)).toBe(0.5);
    expect(sequence(0.5, 1, 2)).toBeNull();
    expect(sequence(3.5, 1, 2)).toBeNull();
    expect(series(2.5, [1, 2, 3])).toEqual({ index: 1, t: 1.5, duration: 2, progress: 0.75 });
    expect(series(7, [1, 2, 3])).toBeNull();
    expect(loop(5.5, 2)).toBeCloseTo(1.5);
    expect(loop(-0.5, 2)).toBeCloseTo(1.5);
    expect(staggered(0.5, 1, 0.2, 0.6)).toBeCloseTo(0.5);
  });
});

describe("motion noise", () => {
  it("is deterministic, smooth and in range", () => {
    expect(noise2D("a", 1.3, 2.7)).toBe(noise2D("a", 1.3, 2.7));
    expect(noise2D("a", 1.3, 2.7)).not.toBe(noise2D("b", 1.3, 2.7));
    let maxStep = 0;
    for (let i = 0; i < 1000; i++) {
      const v = noise3D(7, i / 100, 0.5, i / 300);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
      if (i) maxStep = Math.max(maxStep, Math.abs(v - noise3D(7, (i - 1) / 100, 0.5, (i - 1) / 300)));
    }
    expect(maxStep).toBeLessThan(0.1);
  });
});
