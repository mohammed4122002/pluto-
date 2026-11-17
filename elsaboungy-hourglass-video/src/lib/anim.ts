import { spring } from "remotion";
import { clamp } from "./math";

/** Bouncy pop-in (0 → 1 with overshoot). */
export const pop = (frame: number, fps: number, delay = 0, stiffness = 170, damping = 9) =>
  spring({ frame: frame - delay, fps, config: { stiffness, damping, mass: 0.75 } });

/** Soft settle (no visible overshoot). */
export const settle = (frame: number, fps: number, delay = 0, durationInFrames?: number) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 200 },
    ...(durationInFrames ? { durationInFrames } : {}),
  });

/** Pop-out: 1 → (slight grow) → 0 over `len` frames starting at `start`. */
export const popOut = (frame: number, start: number, len = 8) => {
  const k = clamp((frame - start) / len);
  const c1 = 2.2;
  const e = (c1 + 1) * k * k * k - c1 * k * k; // easeInBack
  return Math.max(0, 1 - e);
};

export const wobble = (t: number, freq: number, amp: number, phase = 0) =>
  Math.sin(t * freq * Math.PI * 2 + phase) * amp;

/** Squash & stretch from a spring value that overshoots 1. */
export const squash = (s: number, amount = 2.4) => {
  const k = clamp((s - 1) * amount, -0.18, 0.18);
  return { sx: 1 + k, sy: 1 - k };
};
