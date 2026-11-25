/**
 * DEEPLY ROOTED — Phase 01 production config.
 *
 * This is the single place to tune the prototype: narration placement, scene lengths, camera speed,
 * character action timing, fog, wind, lighting, transitions, captions, sound effects and grade.
 * All frame numbers are GLOBAL frames at 30 fps (frame 0 = first frame of Scene 01).
 */
import {palette} from './palette';

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const sec = (s: number) => Math.round(s * FPS);

// ---------------------------------------------------------------------------
// 1. Narration → film time
//    The picture follows the narrator's recording. Each narration segment is placed on the film
//    timeline (`at`, in src/data/narration.json); every scene cut and acting beat below is derived
//    from the words she says. To re-time the film, move a segment's `at` and re-render.
// ---------------------------------------------------------------------------
import narrationData from '../data/narration.json';

export const narration = {
  enabled: true,
  volume: 1,
  fadeFrames: 3, // micro-fades at segment edges (no clicks)
  ...narrationData,
};
type Seg = (typeof narrationData.segments)[number];

/** Film second at which a source second (in the recording) is heard. */
export const filmSecOf = (src: number): number => {
  const s = narrationData.segments.find((g: Seg) => src >= g.src[0] - 1e-6 && src <= g.src[1] + 1e-6);
  if (!s) throw new Error(`source time ${src}s is not inside any placed narration segment`);
  return s.at + (src - s.src[0]);
};
const beatF = (k: keyof typeof narrationData.beats) => sec(filmSecOf(narrationData.beats[k]));
const segAt = (id: string) => narrationData.segments.find((g: Seg) => g.id === id)!;

/** Key words, in GLOBAL film frames. */
export const beats = {
  wondered: beatF('wondered'),
  hereEnd: beatF('hereEnd'),
  isnt: beatF('isnt'),
  beEnd: beatF('beEnd'),
  plans: beatF('plans'),
  dreams: beatF('dreams'),
  imagined: beatF('imagined'),
  nowEnd: beatF('nowEnd'),
};

// ---------------------------------------------------------------------------
// 2. Scene timing — derived from the narration
// ---------------------------------------------------------------------------
const CUT12 = beats.hereEnd + sec(1.45); // hold after "…ended up here?" then the mist carries us closer
const CUT23 = sec(segAt('VO03a').at - 0.55); // cut on his glance down, just before "You had plans."
const MATCH = beats.dreams - 16; // the drawn route becomes the world on "dreams"
const RETURN = beats.nowEnd + sec(2.8); // let the imagined future breathe, then the mist returns
const RETURN_DUR = 78;
const END = RETURN + RETURN_DUR + 68;

export const scenes = {
  scene01: {id: 'Scene01', title: 'How Did I End Up Here?', start: 0, duration: CUT12},
  scene02: {id: 'Scene02', title: 'This Was Not the Plan', start: CUT12, duration: CUT23 - CUT12},
  scene03: {id: 'Scene03', title: 'The Life We Imagined', start: CUT23, duration: END - CUT23},
} as const;
export const TOTAL_FRAMES = END;

// ---------------------------------------------------------------------------
// 3. Camera (metres / pixels; see engine/camera.ts). `speed` scales how far each move travels.
// ---------------------------------------------------------------------------
export const JUNCTION_Z = 40; // where the crossroads sits in the present-day world
export const camera = {
  speed: 1,
  wide: {
    // Scene 01 — slow push toward the man at the crossroads
    from: {x: -2.3, y: 2.8, z: JUNCTION_Z - 30},
    to: {x: -1.35, y: 2.4, z: JUNCTION_Z - 20},
    f: 2637, // ~50 mm
    horizon: 0.47 * H,
    aperture: 9,
  },
  medium: {
    // Scene 02 — medium close-up, longer lens for portrait compression
    from: {x: 0.13, y: 1.5, z: JUNCTION_Z - 4.6},
    to: {x: 0.16, y: 1.5, z: JUNCTION_Z - 4.1},
    f: 4200, // ~80 mm
    horizon: 0.365 * H,
    aperture: 34,
  },
  mapPush: {
    // Scene 03 — POV insert: scale of the open map on screen (1 = map art fills the frame)
    fromScale: 0.5,
    toScale: 1,
  },
  imagined: {
    from: {x: 0, y: 1.65, z: 0},
    to: {x: 0.45, y: 1.7, z: 3.6},
    f: 2637,
    horizon: 0.44 * H,
    aperture: 6,
  },
};

// ---------------------------------------------------------------------------
// 4. Transitions (frames)
// ---------------------------------------------------------------------------
export const transitions = {
  fadeInFromCharcoal: 40,
  fogWipeS1toS2: 40, // dense mist crosses the lens, centred on the scene cut
  cutS2toS3: 'cut-on-action', // he glances down → POV of the map
  mapMatchStart: MATCH, // ink route starts becoming the real path
  mapMatchDuration: 84,
  imaginedCameraStart: MATCH + 50,
  returnToPresentStart: RETURN,
  returnToPresentDuration: RETURN_DUR,
  fadeOutToCharcoal: 26,
};

// ---------------------------------------------------------------------------
// 5. Character performance cues (global frames, derived from the narration)
// ---------------------------------------------------------------------------
const blinkList = (() => {
  const out: number[] = [];
  let f = 24;
  let k = 1;
  while (f < END - 10) {
    out.push(f);
    k = (k * 9301 + 49297) % 233280;
    f += 78 + Math.round((k / 233280) * 40);
  }
  return out;
})();

const LIFT = CUT12 + 8;
export const character = {
  breathPeriod: 4.6 * FPS, // frames per breath cycle
  blinks: blinkList,
  s1: {
    headTurnStart: beats.wondered - 10, // looks toward the far paths as she says "wondered"
    headTurnDur: 46,
    headReturnStart: beats.hereEnd + 8,
    headReturnDur: 54,
  },
  s2: {
    liftMap: [LIFT, 30] as const, // [start, duration]
    unfoldA: [LIFT + 28, 36] as const, // first fold opens ("Not because everything is terrible")
    unfoldB: [LIFT + 62, 44] as const, // panels swing open
    studyUntil: beats.isnt - 6,
    lookUp: [beats.isnt - 6, 26] as const, // eyes leave the map: "this isn't where…"
    rackToPaths: [beats.isnt + 4, 48] as const,
    sigh: [beats.beEnd + 20, 46] as const, // quiet exhale, shoulders settle
    rackBack: [beats.beEnd + 66, 34] as const,
    lookDown: [CUT23 - 34, 30] as const, // motivates the cut into Scene 03
  },
  s3: {
    walkSpeed: 1.25, // m/s — confident, unhurried
    walkStartZ: 7.2,
    presentLookUp: [RETURN + RETURN_DUR - 6, 40] as const,
  },
};

// ---------------------------------------------------------------------------
// 6. Atmosphere: fog, wind
// ---------------------------------------------------------------------------
export const fog = {
  density: 1, // global multiplier for every fog layer
  presentHaze: 0.016, // atmospheric extinction per metre (present day)
  imaginedHaze: 0.0042, // clearer air in the imagined future
  driftSpeed: 1, // multiplier on fog layer drift
  returnFogPeak: 0.92, // opacity of the mist that carries us back to the present
};

export const wind = {
  strength: 1, // grass, coat, hair, olive leaves, map paper
  speed: 1,
};

// ---------------------------------------------------------------------------
// 7. Lighting & grade
// ---------------------------------------------------------------------------
export const lighting = {
  present: {
    skyTop: '#59606A',
    skyMid: '#8A9398',
    skyHorizon: '#C9C6BD',
    glow: palette.gold,
    glowX: 0.78, // fraction of width where the sun will rise
    glowStrength: 0.42,
    ground: '#4E5243',
    groundFar: '#9CA19C',
    path: '#B5A994',
    haze: '#BFC0BA',
    rim: '#E9DCC4',
    rimStrength: 0.55,
    fill: '#8D969B',
  },
  imagined: {
    skyTop: '#B9AE9C',
    skyMid: '#DCCDB1',
    skyHorizon: '#F2E6CF',
    glow: palette.gold,
    glowX: 0.74,
    glowStrength: 0.85,
    ground: '#7F7A52',
    groundFar: '#CDBF9C',
    path: '#E3D2B1',
    haze: '#EADCC0',
    rim: '#F6DDA6',
    rimStrength: 0.9,
    fill: '#B7A386',
  },
};

export const grade = {
  grain: 0.085, // film grain opacity
  vignette: 0.42,
  saturation: 0.88,
  contrast: 0.97,
  lift: 0.05, // raises the blacks (never pure black)
  fadeColor: palette.charcoal,
};

// ---------------------------------------------------------------------------
// 8. On-screen script (captions + opening title), timed to the narration
// ---------------------------------------------------------------------------
export const captions = {
  enabled: true,
  leadIn: 0.08, // s before the first word
  holdAfter: 0.5, // s after the last word
  fadeIn: 7, // frames
  fadeOut: 9,
  fontFamily: 'Caladea, "Bitstream Charter", Georgia, serif',
  fontSize: 50,
  bottom: 96, // px from the bottom edge
  color: palette.ivory,
  scrim: 0.36, // soft charcoal gradient behind the text (readability over the bright map)
};

export interface TimedText {
  text: string;
  from: number; // global frames
  to: number;
  style?: string;
}

export const captionTrack: TimedText[] = narrationData.captions.map((c, i, arr) => {
  const from = sec(filmSecOf(c.src[0]) - captions.leadIn);
  let to = sec(filmSecOf(c.src[1]) + captions.holdAfter);
  if (i + 1 < arr.length) to = Math.min(to, sec(filmSecOf(arr[i + 1].src[0]) - captions.leadIn) - 2);
  return {text: c.text, from, to};
});

const titleOut = sec(filmSecOf(narrationData.titles[narrationData.titles.length - 1].src[1]) + 0.7);
export const titleTrack: TimedText[] = narrationData.titles.map((t) => ({
  text: t.text,
  style: t.style,
  from: sec(filmSecOf(t.src[0]) - 0.1),
  to: titleOut,
}));

// ---------------------------------------------------------------------------
// 9. Sound effects (procedural library in public/audio/sfx — scripts/generate_sfx.py)
//    Each cue: file, start frame, length, level and fades. Footsteps are generated from the
//    walk cycle in Timeline.tsx so every step lands on a heel strike.
// ---------------------------------------------------------------------------
export interface SfxCue {
  id: string;
  file: string;
  at: number; // global frame
  dur: number; // frames
  volume: number;
  fadeIn?: number;
  fadeOut?: number;
  trim?: number; // seconds skipped at the start of the file
}
const S2c = character.s2;
export const sfx = {
  enabled: true,
  master: 1,
  footsteps: {file: 'step_dirt', variants: 4, volume: 0.3, strideM: 1.45},
  cues: [
    {id: 'Dawn wind (present)', file: 'amb_dawn_wind', at: 0, dur: MATCH + 50, volume: 0.38, fadeIn: 45, fadeOut: 50},
    {id: 'Mist whoosh S01→S02', file: 'whoosh_mist', at: CUT12 - sec(1.35), dur: sec(3.0), volume: 0.42},
    {id: 'Coat shift', file: 'cloth_shift', at: LIFT - 2, dur: sec(0.9), volume: 0.45},
    {id: 'Paper: lift map', file: 'paper_handle', at: LIFT + 4, dur: sec(1.1), volume: 0.48},
    {id: 'Paper: first fold', file: 'paper_unfold_1', at: S2c.unfoldA[0] + 2, dur: sec(0.8), volume: 0.5},
    {id: 'Paper: panels open', file: 'paper_unfold_2', at: S2c.unfoldB[0] + 4, dur: sec(1.0), volume: 0.5},
    {id: 'Paper flutter', file: 'paper_flutter', at: S2c.unfoldB[0] + S2c.unfoldB[1], dur: S2c.sigh[0] - (S2c.unfoldB[0] + S2c.unfoldB[1]) + 20, volume: 0.3, fadeIn: 20, fadeOut: 30},
    {id: 'Exhale', file: 'breath_exhale', at: S2c.sigh[0] + 2, dur: sec(1.7), volume: 0.36},
    {id: 'Coat settle (looks down)', file: 'cloth_settle', at: S2c.lookDown[0], dur: sec(0.7), volume: 0.38},
    {id: 'Paper: POV grip', file: 'paper_handle', at: CUT23 + 2, dur: sec(1.1), volume: 0.32},
    {id: 'Shimmer: map becomes world', file: 'shimmer_bloom', at: MATCH - 8, dur: sec(5.5), volume: 0.3},
    {id: 'Meadow (imagined)', file: 'amb_meadow_warm', at: MATCH - 6, dur: RETURN + 56 - (MATCH - 6), volume: 0.5, fadeIn: 50, fadeOut: 56},
    {id: 'Mist whoosh: return', file: 'whoosh_return', at: RETURN - 8, dur: sec(3.8), volume: 0.4},
    {id: 'Dawn wind (return)', file: 'amb_dawn_wind', at: RETURN - 6, dur: END - (RETURN - 6), volume: 0.36, fadeIn: 60, fadeOut: 30, trim: 14},
  ] as SfxCue[],
};
