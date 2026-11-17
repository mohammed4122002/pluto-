import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Clock, SceneSpan } from "../config/timing";
import { makeClock } from "../config/timing";
import type { BrandConfig } from "../config/types";

export type SceneProps = {
  span: SceneSpan;
  spans: SceneSpan[];
  brand: BrandConfig;
};

/** Per-scene timing: local frame, seconds, progress and the global clock. */
export const useScene = (span: SceneSpan, spans: SceneSpan[]) => {
  const f = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const clock: Clock = makeClock(spans, span.from + f, fps);
  const D = span.durationInFrames;
  // Frame at which on-screen text should pop out, just before the transition.
  const exitAt = D - Math.ceil(span.transitionOut.frames / 2) - 7;
  return { f, fps, t: f / fps, p: f / D, D, clock, width, height, exitAt };
};

export const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill>
    <svg width="100%" height="100%" viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {children}
    </svg>
  </AbsoluteFill>
);

/** Absolutely positioned full-width text slot. */
export const TextSlot: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => (
  <div style={{ position: "absolute", left: 0, right: 0, top }}>{children}</div>
);
