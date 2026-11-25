/**
 * DEEPLY ROOTED — Phase 01 production config.
 *
 * This is the single place to tune the prototype: scene lengths, voiceover sync points,
 * camera speed, character action timing, fog, wind, lighting, transitions and grade.
 * All frame numbers are GLOBAL frames at 30 fps (frame 0 = first frame of Scene 01).
 */
import {palette} from './palette';

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const sec = (s: number) => Math.round(s * FPS);

// ---------------------------------------------------------------------------
// 1. Scene timing
// ---------------------------------------------------------------------------
export const scenes = {
  scene01: {id: 'Scene01', title: 'How Did I End Up Here?', start: 0, duration: 330}, // 11.0 s
  scene02: {id: 'Scene02', title: 'This Was Not the Plan', start: 330, duration: 390}, // 13.0 s
  scene03: {id: 'Scene03', title: 'The Life We Imagined', start: 720, duration: 510}, // 17.0 s
} as const;
export const TOTAL_FRAMES = scenes.scene03.start + scenes.scene03.duration; // 1230 = 41.0 s

// ---------------------------------------------------------------------------
// 2. Voiceover sync points (placeholder timing until the real recording exists)
//    After recording: drop the files into public/audio/, set `enabled: true`, and move
//    `start` / beat frames to match the read. Character beats below are tied to these.
// ---------------------------------------------------------------------------
export const voiceover = {
  enabled: false, // no audio is rendered until the narrator's files exist
  volume: 1,
  lines: [
    {
      id: 'VO01',
      file: 'audio/VO01_have_you_ever_looked.wav',
      text: 'Have you ever looked at your life… and wondered how you ended up here?',
      start: 45,
      end: 205,
      beats: {looked: 66, life: 100, wondered: 128, here: 190},
    },
    {
      id: 'VO02',
      file: 'audio/VO02_not_because.wav',
      text: "Not because everything is terrible. But because… this isn't where you thought you would be.",
      start: 360,
      end: 612,
      beats: {terrible: 425, butBecause: 462, isnt: 528, wouldBe: 600},
    },
    {
      id: 'VO03',
      file: 'audio/VO03_you_had_plans.wav',
      text: 'You had plans. You had dreams. You imagined a different version of yourself by now.',
      start: 744,
      end: 1020,
      beats: {plans: 770, dreams: 846, imagined: 905, version: 950, byNow: 1005},
    },
  ],
} as const;
const beat = (line: number) => voiceover.lines[line].beats as Record<string, number>;

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
  mapMatchStart: 800, // ink route starts becoming the real path
  mapMatchDuration: 84,
  imaginedCameraStart: 850,
  returnToPresentStart: 1096,
  returnToPresentDuration: 78,
  fadeOutToCharcoal: 26,
};

// ---------------------------------------------------------------------------
// 5. Character performance cues (global frames, many derived from VO beats)
// ---------------------------------------------------------------------------
export const character = {
  breathPeriod: 4.6 * FPS, // frames per breath cycle
  blinks: [24, 112, 236, 318, 398, 486, 566, 636, 704, 1176],
  s1: {
    headTurnStart: beat(0).wondered - 14, // looks toward the far paths as she says "wondered"
    headTurnDur: 46,
    headReturnStart: 248,
    headReturnDur: 54,
  },
  s2: {
    liftMap: [340, 30] as const, // [start, duration]
    unfoldA: [368, 38] as const, // first fold opens
    unfoldB: [404, 44] as const, // second fold opens
    studyUntil: beat(1).isnt - 6,
    lookUp: [beat(1).isnt - 4, 26] as const, // eyes leave the map: "this isn't where…"
    rackToPaths: [beat(1).isnt + 4, 48] as const,
    sigh: [596, 46] as const, // quiet exhale, shoulders settle
    rackBack: [640, 34] as const,
    lookDown: [682, 30] as const, // motivates the cut into Scene 03
  },
  s3: {
    walkSpeed: 1.25, // m/s — confident, unhurried
    walkStartZ: 7.2,
    presentLookUp: [1170, 40] as const,
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
