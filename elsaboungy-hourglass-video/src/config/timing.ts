import type { SceneConfig, SceneId, TimelineConfig } from "./types";

export type SceneSpan = SceneConfig & {
  index: number;
  from: number;
  durationInFrames: number;
};

export const buildSpans = (timeline: TimelineConfig): SceneSpan[] => {
  let from = 0;
  return timeline.scenes.map((s, index) => {
    const durationInFrames = Math.max(1, Math.round(s.seconds * timeline.fps));
    const span = { ...s, index, from, durationInFrames };
    from += durationInFrames;
    return span;
  });
};

export const totalFrames = (timeline: TimelineConfig) =>
  buildSpans(timeline).reduce((sum, s) => sum + s.durationInFrames, 0);

/** Which scene owns this frame (the last scene owns everything past the end). */
export const sceneAt = (spans: SceneSpan[], frame: number): SceneSpan => {
  for (const s of spans) {
    if (frame < s.from + s.durationInFrames) return s;
  }
  return spans[spans.length - 1];
};

/**
 * Timing helper handed to every visual layer. All motion is a pure function of
 * the frame, so scenes can be retimed in timeline.json without touching code.
 */
export type Clock = {
  frame: number;
  fps: number;
  spans: SceneSpan[];
  current: SceneSpan;
  /** 0..1 progress through the current scene. */
  p: number;
  /** Seconds since the current scene started. */
  local: number;
  /** Progress through a named scene (unclamped: <0 before it, >1 after it). */
  progressOf: (id: SceneId) => number;
  span: (id: SceneId) => SceneSpan | undefined;
};

export const makeClock = (spans: SceneSpan[], frame: number, fps: number): Clock => {
  const current = sceneAt(spans, frame);
  const local = (frame - current.from) / fps;
  return {
    frame,
    fps,
    spans,
    current,
    p: (frame - current.from) / current.durationInFrames,
    local,
    progressOf: (id) => {
      const s = spans.find((x) => x.id === id);
      if (!s) return -1;
      return (frame - s.from) / s.durationInFrames;
    },
    span: (id) => spans.find((x) => x.id === id),
  };
};
