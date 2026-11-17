export type TransitionType = "none" | "zoomFlash" | "foamWipe" | "blobSwipe" | "iris" | "bubblePop";

export type SceneId =
  | "rush"
  | "hourglass"
  | "order"
  | "delivery"
  | "endcard"
  // earlier looks, still available to drop into timeline.json
  | "hook"
  | "flow"
  | "burst"
  | "shine"
  | "brand";

export type SceneConfig = {
  id: SceneId;
  name: string;
  seconds: number;
  headline: string;
  subline: string;
  line2?: string;
  vo: string;
  transitionOut: { type: TransitionType; frames: number };
};

export type TimelineConfig = {
  fps: number;
  width: number;
  height: number;
  scenes: SceneConfig[];
};

export type BrandConfig = {
  nameAr: string;
  nameEn: string;
  logo: {
    src: string | null;
    widthPx: number;
    heightPx: number;
    showPlaceholderTag: boolean;
  };
  slogan: { line1: string; line2: string };
  contact: { website: string; phone: string; whatsappLabel: string; city: string };
  colors: {
    yellow: string;
    yellowDeep: string;
    blue: string;
    blueDeep: string;
    navy: string;
    sky: string;
    white: string;
  };
};

export type AudioConfig = {
  /** Full voice-over file in public/, e.g. "audio/voiceover/voiceover.wav". */
  voiceoverSrc: string | null;
  voiceoverVolume: number;
  /** Shift the voice-over in frames (positive = later). */
  voiceoverOffsetFrames: number;
  /** Optional per-scene clips in public/, keyed by scene id. Each starts at its scene's first frame. */
  sceneClips: Partial<Record<SceneId, string>>;
  musicSrc: string | null;
  musicVolume: number;
  /** Music volume while a voice-over is present (simple ducking). */
  musicDuckedVolume: number;
};

export type AdProps = {
  timeline: TimelineConfig;
  brand: BrandConfig;
  audio: AudioConfig;
  /** false = silent review render (audio ignored even if configured). */
  withAudio: boolean;
};
