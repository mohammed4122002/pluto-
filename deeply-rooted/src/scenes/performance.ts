// The Walker's performance, frame by frame. Every beat reads its timing from config/production.ts.
import {character, FPS, wind} from '../config/production';
import {clamp, ease, ramp, track, pulse} from '../engine/anim';
import {noise1} from '../engine/noise';
import {neutralPose, Pose34} from '../character/Walker34';

const C = character;

export const breathAt = (f: number) => {
  const ph = (f / C.breathPeriod) * Math.PI * 2 + 0.6 * noise1(f / 90, 3);
  return 0.5 - 0.5 * Math.cos(ph);
};

export const blinkAt = (f: number) => {
  let b = 0;
  const extra = [C.s1.headTurnStart + 2, C.s2.lookUp[0] + 1, C.s2.lookDown[0] + 4];
  for (const k of [...C.blinks, ...extra]) {
    if (f >= k && f < k + 7) b = Math.max(b, f < k + 2 ? (f - k + 1) / 2 : 1 - (f - k - 2) / 5);
  }
  return clamp(b);
};

/** The small things that make a still person alive: weight shift, follow-through, saccades, micro-motion. */
export const lifeAt = (f: number) => {
  const sec = f / FPS;
  const swayAt = (ff: number) => 0.75 * Math.sin((ff / FPS) * ((2 * Math.PI) / 7.2) + 0.6) + 0.3 * noise1(ff / 95, 13);
  const sway = swayAt(f);
  const hemLag = -1.1 * (sway - swayAt(f - 9));
  // saccades: gaze hops to a new nearby target every ~0.6–1.5 s (3-frame hop), with micro-drift
  const seg = Math.floor(sec / 0.9 + 0.35 * noise1(sec * 0.7, 17));
  const segStart = (seg - 0.35 * noise1(sec * 0.7, 17)) * 0.9 * FPS;
  const prev = seg - 1;
  const tgt = (k: number, sd: number) => (Math.sin(k * 12.9898 + sd) * 43758.5453) % 1;
  const hop = clamp((f - segStart) / 3);
  const saccX = (tgt(prev, 1) + (tgt(seg, 1) - tgt(prev, 1)) * hop) * 0.13 + noise1(sec * 2.3, 19) * 0.015;
  const saccY = (tgt(prev, 2) + (tgt(seg, 2) - tgt(prev, 2)) * hop) * 0.08;
  return {
    sway,
    hemLag,
    saccX,
    saccY,
    microTilt: 0.55 * noise1(sec * 0.6, 23),
    microPitch: 0.45 * noise1(sec * 0.5, 29),
    time: sec,
  };
};

export const windAt = (f: number) => wind.strength * (0.35 + 0.45 * noise1((f / FPS) * 0.45 * wind.speed, 8));
export const flutterAt = (f: number) => wind.strength * noise1((f / FPS) * 1.6 * wind.speed, 9);

/** Scene 01 — standing at the crossroads, the folded map in his hand. */
export const scene1Pose = (f: number): Pose34 => {
  const s = C.s1;
  const turn = track(f, [
    [0, -0.1],
    [s.headTurnStart, -0.1],
    [s.headTurnStart + s.headTurnDur, -0.75, ease.inOutCubic],
    [s.headReturnStart, -0.75],
    [s.headReturnStart + s.headReturnDur, -0.3, ease.inOutSine],
  ]);
  const L = lifeAt(f);
  return {
    ...neutralPose,
    breath: breathAt(f),
    blink: blinkAt(f),
    headTurn: turn,
    headPitch: 3 + 1.5 * noise1(f / 70, 2) + L.microPitch,
    headTilt: -turn * 2.2 + L.microTilt,
    gazeX: -0.35 + turn * 0.7 + L.saccX,
    gazeY: -0.1 + L.saccY,
    sway: L.sway,
    hemLag: L.hemLag,
    time: L.time,
    browWorry: 0.3,
    lidLower: 0.2,
    mouthSad: 0.05,
    wind: windAt(f),
    detail: 1,
  };
};

/** Scene 02 — he unfolds the map, studies it, looks up at a landscape that does not match. */
export const scene2Pose = (f: number): Pose34 => {
  const s = C.s2;
  const arm = ramp(f, s.liftMap[0], s.liftMap[1], ease.inOutCubic);
  const rowOpen = ramp(f, s.unfoldA[0], s.unfoldA[1], ease.inOutCubic);
  const colOpen1 = ramp(f, s.unfoldB[0], s.unfoldB[1] * 0.62, ease.inOutCubic);
  const colOpen0 = ramp(f, s.unfoldB[0] + s.unfoldB[1] * 0.38, s.unfoldB[1] * 0.62, ease.inOutCubic);
  const grip = ramp(f, s.unfoldB[0] + s.unfoldB[1] * 0.5, 16, ease.inOutSine);
  const up = ramp(f, s.lookUp[0], s.lookUp[1], ease.inOutCubic) * (1 - ramp(f, s.lookDown[0], s.lookDown[1], ease.inOutCubic));
  const study = f > s.unfoldB[0] + s.unfoldB[1] ? 1 : 0;
  // small reading saccades along the drawn route while he studies it
  const sacc = study * (1 - up) * (Math.round(noise1(f / 11, 21) * 3) / 3) * 0.25;
  const sigh = pulse(f, s.sigh[0], s.sigh[1] * 0.45, s.sigh[0] + s.sigh[1], s.sigh[1] * 0.55);
  const realise = ramp(f, s.lookUp[0] + 10, 40);
  const L = lifeAt(f);
  // thumbs re-grip the paper twice while he reads
  const regrip = Math.max(pulse(f, s.unfoldB[0] + s.unfoldB[1] + 14, 6, s.unfoldB[0] + s.unfoldB[1] + 30, 10), pulse(f, s.lookUp[0] - 22, 5, s.lookUp[0] - 8, 8));
  return {
    ...neutralPose,
    sway: L.sway * 0.7,
    hemLag: L.hemLag * 0.7,
    time: L.time,
    thumbAdj: regrip,
    mapLower: 2.4 * up,
    breath: breathAt(f) * (1 - sigh) + sigh * (f < s.sigh[0] + s.sigh[1] * 0.45 ? 1 : 0.2),
    blink: blinkAt(f),
    armBlend: arm,
    rowOpen,
    colOpen1,
    colOpen0,
    farGrip: grip,
    headPitch: 8.5 * (1 - up) + 1 * up + 1.2 * noise1(f / 60, 4) + L.microPitch,
    headTurn: -0.1 - 0.25 * up,
    headTilt: 0.8 * up + L.microTilt,
    gazeX: -0.25 + sacc - 0.55 * up + L.saccX * up,
    gazeY: -0.95 * (1 - up) + 0.05 * up + L.saccY * up,
    lidLower: 0.55 * (1 - up) + 0.18 * up,
    browWorry: 0.25 + 0.4 * realise,
    mouthSad: 0.06 + 0.2 * realise,
    shoulderDrop: sigh * 0.9,
    wind: windAt(f),
    flutter: flutterAt(f) * rowOpen,
    detail: 1,
  };
};

/** End of Scene 03 — back in the mist, the open map in his hands; he lifts his eyes. */
export const presentEndPose = (f: number): Pose34 => {
  const [a, d] = C.s3.presentLookUp;
  const up = ramp(f, a, d, ease.inOutSine);
  const L = lifeAt(f);
  return {
    ...scene2Pose(C.s2.lookDown[0] + C.s2.lookDown[1] + 4),
    sway: L.sway * 0.6,
    hemLag: L.hemLag * 0.6,
    time: L.time,
    mapLower: 2.0 * up,
    headTilt: L.microTilt,
    breath: breathAt(f),
    blink: blinkAt(f),
    headPitch: 8 * (1 - up) + 2.5 * up,
    gazeY: -0.9 * (1 - up) + 0.1 * up,
    gazeX: -0.25 - 0.4 * up + L.saccX * up,
    lidLower: 0.5 * (1 - up) + 0.25 * up,
    browWorry: 0.5,
    mouthSad: 0.18,
    shoulderDrop: 0.4,
    wind: windAt(f),
    flutter: flutterAt(f),
  };
};
