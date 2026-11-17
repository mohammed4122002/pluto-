import type { Clock } from "./config/timing";
import { clamp, easeInOutCubic, lerp, smoothstep } from "./lib/math";

/**
 * One continuous story for the foam inside the hourglass, across all scenes,
 * driven by scene progress (so it follows any retiming in timeline.json).
 *
 * The flip happens in the "burst" scene; after it, the bulbs swap roles.
 */
export type FoamState = { top: number; bottom: number; flow: number; flip: number };

export const FLIP_WINDOW: [number, number] = [0.1, 0.42]; // fraction of the burst scene

/** Foam level for any hourglass on screen: drains steadily over the whole ad. */
export const foamState = (c: Clock): FoamState => {
  if (c.span("burst") && c.span("hook") && c.span("flow")) return legacyFoamState(c);
  const last = c.spans[c.spans.length - 1];
  const total = last.from + last.durationInFrames;
  const k = clamp(c.frame / total);
  return { top: 0.82 - 0.62 * k, bottom: 0.18 + 0.62 * k, flow: 1, flip: 0 };
};

/**
 * The hourglass scene's own story (progress p of that scene): drains, flips
 * at FLIP_WINDOW, the bulbs swap roles, and it keeps flowing.
 */
export const HG_FLIP: [number, number] = [0.5, 0.7];
export const hourglassSceneState = (p: number): FoamState => {
  if (p < HG_FLIP[1]) {
    const drained = 0.08 + 0.42 * clamp(p / HG_FLIP[0]);
    const flipK = easeInOutCubic(clamp((p - HG_FLIP[0]) / (HG_FLIP[1] - HG_FLIP[0])));
    return {
      top: 1 - drained,
      bottom: drained,
      flow: smoothstep(0.12, 0.2, p) * (1 - smoothstep(HG_FLIP[0] - 0.04, HG_FLIP[0], p)),
      flip: flipK * 180,
    };
  }
  const top = 0.5 - 0.1 * clamp((p - HG_FLIP[1]) / (1 - HG_FLIP[1]));
  return { top, bottom: 1 - top, flow: smoothstep(HG_FLIP[1] + 0.03, HG_FLIP[1] + 0.1, p), flip: 0 };
};

const legacyFoamState = (c: Clock): FoamState => {
  const hook = c.progressOf("hook");
  const flow = c.progressOf("flow");
  const burst = c.progressOf("burst");
  const shine = c.progressOf("shine");
  const brand = c.progressOf("brand");
  const end = c.progressOf("endcard");

  // Phase A: from the start until the flip. "drained" = amount moved down.
  if (burst < FLIP_WINDOW[1]) {
    let drained = 0;
    drained += 0.06 * smoothstep(0.45, 1, hook);
    drained += 0.46 * clamp(flow);
    drained += 0.05 * clamp(burst / FLIP_WINDOW[0]);
    const streaming = hook < 0.45 ? 0 : burst < 0 ? 1 : burst < FLIP_WINDOW[0] ? 1 - burst / FLIP_WINDOW[0] : 0;
    const flipK = burst < FLIP_WINDOW[0] ? 0 : easeInOutCubic(clamp((burst - FLIP_WINDOW[0]) / (FLIP_WINDOW[1] - FLIP_WINDOW[0])));
    return {
      top: 1 - drained,
      bottom: drained,
      flow: smoothstep(0.45, 0.62, hook) * (streaming > 0 ? Math.min(1, streaming * 3) : 0),
      flip: flipK * 180,
    };
  }

  // Phase B: after the flip, the old bottom (≈57 %) is now on top.
  const start = 0.57;
  let drained = 0;
  drained += 0.04 * smoothstep(FLIP_WINDOW[1] + 0.08, 1, burst);
  drained += 0.18 * clamp(shine);
  drained += 0.14 * clamp(brand);
  drained += 0.16 * clamp(end);
  const top = clamp(start - drained);
  return {
    top,
    bottom: 1 - top,
    flow: smoothstep(FLIP_WINDOW[1] + 0.06, FLIP_WINDOW[1] + 0.2, burst) * (top > 0.01 ? 1 : 0),
    flip: 0,
  };
};

export const spinAt = (seconds: number, base = 0) => base + seconds * 0.55 + Math.sin(seconds * 0.7) * 0.15;

export const mixN = lerp;
