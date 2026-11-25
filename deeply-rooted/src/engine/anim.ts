// Frame-based animation helpers. Everything is a pure function of the frame number,
// so any frame renders identically on any machine (Remotion renders frames in parallel).

export type Ease = (t: number) => number;

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => clamp((x - a) / (b - a));
export const smoothstep = (a: number, b: number, x: number) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};

export const ease = {
  linear: ((t) => t) as Ease,
  inSine: ((t) => 1 - Math.cos((t * Math.PI) / 2)) as Ease,
  outSine: ((t) => Math.sin((t * Math.PI) / 2)) as Ease,
  inOutSine: ((t) => -(Math.cos(Math.PI * t) - 1) / 2) as Ease,
  inCubic: ((t) => t * t * t) as Ease,
  outCubic: ((t) => 1 - Math.pow(1 - t, 3)) as Ease,
  inOutCubic: ((t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)) as Ease,
  inOutQuint: ((t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2)) as Ease,
};

/** 0→1 progress of a timed action starting at `start` lasting `dur` frames, eased. */
export const ramp = (frame: number, start: number, dur: number, e: Ease = ease.inOutSine) =>
  e(clamp((frame - start) / Math.max(1, dur)));

/** Rises 0→1 over [a, a+inDur], holds, falls 1→0 over [b-outDur, b]. */
export const pulse = (frame: number, a: number, inDur: number, b: number, outDur: number, e: Ease = ease.inOutSine) =>
  Math.min(ramp(frame, a, inDur, e), 1 - ramp(frame, b - outDur, outDur, e));

export type Key = [frame: number, value: number, easeIn?: Ease];

/** Piecewise keyframe track. The ease of a key applies to the segment arriving at it. */
export const track = (frame: number, keys: Key[]): number => {
  if (frame <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [f1, v1, e] = keys[i];
    const [f0, v0] = keys[i - 1];
    if (frame <= f1) return lerp(v0, v1, (e ?? ease.inOutSine)(clamp((frame - f0) / Math.max(1e-6, f1 - f0))));
  }
  return keys[keys.length - 1][1];
};
