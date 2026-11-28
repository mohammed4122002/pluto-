/**
 * DEEPLY ROOTED — Episode 01 · "When Life Doesn't Go as Planned"  (v2: one production, two formats)
 *
 * One picture system feeds two masters:
 *   Episode01          1920×1080 (16:9) long-form
 *   Episode01Vertical  1080×1920 (9:16) Shorts master — the same shots, re-framed per shot (`vx`), not a centre crop
 * Both share the narration, sound, cues, timing, sets, characters and story devices. Bilingual subtitles are burned in
 * afterwards from the same cue data (the subtitle component lays itself out for each format).
 * Plan: docs/episode01/EP01_PLAN.md · Revision notes: docs/episode01/EP01_V2_NOTES.md
 */
import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {loadFont} from '@remotion/fonts';
import arabic500 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2';
import {clamp, ease, lerp, ramp} from '../engine/anim';
import {ensureFonts, TITLE_FONT} from '../post/fonts';
import {blendPose, POSES, StickPose} from '../stickman/Stickman';
import {BilingualSubtitles} from '../subtitles/BilingualSubtitles';
import {BilingualCue} from '../subtitles/style';
import timed from '../data/subtitles/ep01.timed.json';
import {breathe, Cam, DriftLight, frontWalkPose, GlowFigure, Lantern, lampLevel, lampSwitch, PlanLine, plate, STAND_BACK, STRIDE, TimelineRuler, toScreen, Tree, Roots, walkPose} from './kit';
import {aimCam, Hill, hillY, LakeMedium, LakeWide, lerpLight, pathAt, pathU, Plain, plainCam, ROAD_FEET_Y, RoadSide, Trav} from './sets';
import {cut, EP_FRAMES, FPS, fr, pe, ps, SEGMENTS, speaking, VOICE, word} from './timing';

ensureFonts();
loadFont({family: 'DR Arabic', url: arabic500, weight: '500'});
export {EP_FRAMES};
const AR_FONT = '"DR Arabic", "IBM Plex Sans Arabic", sans-serif';

// ------------------------------------------------------------------ shared poses & helpers
const HEAD_DOWN: StickPose = {...POSES.headDown, headTilt: 16, headDrop: 3, lean: 4, shoulderDrop: 2.5};
const STAND_TALL: StickPose = {...POSES.breathe};
const LOOK_BACK: StickPose = {...POSES.lookBack, headTilt: -18};
const BACK_DOWN: StickPose = {...STAND_BACK, headDrop: 2, shoulderDrop: 2.5};
const SIT: StickPose = {...POSES.hugKnees, hipDrop: 62};
const KNEEL: StickPose = {...POSES.kneelPlant};
/** distance walked (plate px) from frame a to f with speed(frame) px/frame */
const walked = (a: number, f: number, speed: (t: number) => number) => {
  let d = 0;
  for (let t = a; t < f; t++) d += speed(t);
  return d;
};
const flick = (f: number) => lampLevel(f, 1);
/** 0 → 1 → 0 over [a, a+dur] */
const bell = (f: number, a: number, dur: number) => Math.sin(Math.PI * clamp((f - a) / dur));

// ------------------------------------------------------------------ the shot table
/** How a shot arrives from the previous one. Every change of place is motivated, and no two neighbours repeat. */
type Tx =
  | {kind: 'dissolve'; dur: number}
  | {kind: 'push'; dur: number} // dissolve inside one continuous forward camera move
  | {kind: 'mist'; dur: number; tone: 'night' | 'dawn'} // mist / fog rolls through and carries us to the next place
  | {kind: 'bloom'; dur: number; at: [number, number]} // light swells (lamp, first sun) and opens onto the next place
  | {kind: 'nightfall'; dur: number}; // the light goes down through dusk into the next scene (never to black)
interface Shot {
  id: string;
  from: number;
  to: number;
  tx?: Tx; // none = a cut that does not read as one (continuous camera / same set and motion)
  grade?: {color: string; a: number; dur: number}; // the new place arrives in the old light and settles into its own
  bed: Bed;
  render: (f: number, s: Shot) => React.ReactNode;
  vx: (f: number) => number; // vertical master: landscape screen x the 9:16 frame centres on (the action, not the middle)
}
type Bed = 'lake' | 'rain' | 'wind' | 'dawn';
const S: Shot[] = [];
const add = (sh: Omit<Shot, 'to' | 'vx'> & {vx?: number | ((f: number) => number)}) =>
  S.push({...sh, to: 0, vx: typeof sh.vx === 'function' ? sh.vx : () => (sh.vx as number | undefined) ?? 960} as Shot);

const C_PILOT = fr(7.767); // the pilot's cut, in the pause after "…your life…"
const HERE = word(4, 'here');
const pilotCam = (D: number, extra: Partial<Cam> = {}): Cam => ({ax: 1560, ay: 880, z: 1 + 0.07 * D, px: 24 * D, ...extra});
const HIM: [number, number] = [1600, 1168]; // his place at the end of the pier (pilot)
const SELF0: [number, number] = [2200, 1180]; // where the imagined self forms, out on the water
const SELF_FAR = 2330; // …and where it walks on to, "by now"
const ROAD_SCALE = 2.3;
const roadCam = (x: number, z = 1, sx = 760): Cam => ({ax: x, ay: ROAD_FEET_Y, z, px: x - sx / 0.75});
const screenX = (c: Cam, x: number, y: number, k = 1) => toScreen(c, k, x, y)[0];

// ---- Act I · night at the lake
// 1 · Title over the night sky; the camera drifts down toward him (the title is the only text; no episode number)
const TITLE_OUT = ps(1) + 26;
add({id: '01 title', from: 0, bed: 'lake', vx: 1250, render: (f, s) => {
  const t = ramp(f, s.from, s.to - s.from);
  const down = ease.inOutSine(ramp(f, s.to - 40, 70));
  const cam: Cam = {ax: 1560, ay: 560, z: 1.32 - 0.06 * t, py: -40 + 40 * t + 70 * down};
  return <LakeMedium f={f} cam={cam} time="night" lamp={flick(f)} skyOnly />;
}});
// 2 · "Have you ever looked at your life…" — arrives on the same downward drift (matched camera motion)
add({id: '02 looked', from: TITLE_OUT + 6, tx: {kind: 'dissolve', dur: 30}, bed: 'lake', vx: 1290, render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from + 10, ease.inOutSine);
  const settle = 1 - ease.outCubic(ramp(f, s.from, 50));
  const look = ramp(f, fr(6.136), 40, ease.inOutSine);
  const pose = breathe(f, blendPose(POSES.stand, HEAD_DOWN, look * 0.9));
  return <LakeMedium f={f} cam={pilotCam(D, {py: -60 * settle})} time="night" lamp={flick(f)}><Trav id="t02" pose={pose} feet={HIM} scale={3.55} light="lampNight" keyMul={flick(f)} /></LakeMedium>;
}});
// 3 · "…and wondered how you ended up here?" — the pilot's crane-up reveal (a short, soft cut on the reveal)
add({id: '03 here', from: C_PILOT, tx: {kind: 'dissolve', dur: 8}, bed: 'lake', vx: 960, render: (f, s) => {
  const R = ramp(f, s.from, 110, ease.inOutSine);
  const turn = ramp(f, HERE - 12, 30, ease.inOutSine);
  return <LakeWide f={f} R={R} time="night" lamp={flick(f)}><Trav id="t03" pose={breathe(f, blendPose(BACK_DOWN, LOOK_BACK, turn))} feet={[1271, 603]} scale={0.42} light="lampWide" keyMul={flick(f)} facing={-1} /></LakeWide>;
}});
// 4 · "Not because…" → "…by this age, by this moment, everything would finally make sense."
//     One continuous shot. Plans: a golden route is drawn out over the water. Dreams: its stars kindle. The light gathers
//     at its far end into the imagined self, which walks on ahead "by now" while he stays. Happier / more successful /
//     more loved: it brightens on each. The people who were beside him appear, and are gone. "By this age, by this
//     moment": a day and a night pass over the lake in seconds — mist racing, his shadow swinging — and he has not moved.
const S4 = cut(5);
const AGE = word(15, 'age') - 4, MOMENT = word(15, 'moment') - 4;
const timeLapse = (f: number) => 0.92 * bell(f, AGE, 56) + 0.7 * bell(f, MOMENT, 44);
const selfX4 = (f: number) => SELF0[0] + (SELF_FAR - SELF0[0]) * ramp(f, word(10, 'now') - 8, 80, ease.inOutSine);
const cam4 = (f: number): Cam => {
  const D = ramp(f, S4, cut(17) - S4, ease.inOutSine);
  return {ax: 1700, ay: lerp(900, 925, D), z: lerp(1.0, 1.07, D), px: lerp(0, 25, D)};
};
// vertical: him + the plan/self, then him + the people beside him, then him + the self again
const vx4 = (f: number) => lerp(lerp(1490, 1410, ramp(f, ps(14) - 20, 40, ease.inOutSine)), 1470, ramp(f, AGE + 50, 60, ease.inOutSine));
add({id: '04 imagined · by this age', from: S4, tx: {kind: 'push', dur: 26}, bed: 'lake', vx: vx4, render: (f) => {
  const cam = cam4(f);
  const lift = ramp(f, ps(7), 30);
  const toSelf = ramp(f, ps(10) + 10, 40);
  const down = ramp(f, ps(16) + 6, 50);
  const tl = timeLapse(f);
  const pose = breathe(f, blendPose(blendPose(blendPose(POSES.stand, HEAD_DOWN, 0.9), {...POSES.stand, headTilt: -4 - 4 * toSelf}, lift), {...POSES.stand, headTilt: 8, headDrop: 1.5}, down), 1 - 0.8 * tl);
  // the plan line, from him out over the water to where the self will stand
  const sx = selfX4(f);
  const chest: [number, number] = [SELF0[0], SELF0[1] - 300];
  const pts: [number, number][] = [[1690, 820], [1800, 690], [1960, 620], [2110, 650], chest];
  const assemble = ramp(f, ps(10) + 18, 54, ease.inOutSine);
  const walking = f > word(10, 'now') - 8 && f < word(10, 'now') + 72;
  const pulse = 0.8 * bell(f, ps(11) + 4, 24) + 0.9 * bell(f, ps(12), 24) + bell(f, ps(13), 26);
  const ghosts = Math.min(ramp(f, ps(14) + 8, 30), 1 - ramp(f, AGE + 6, 40));
  const lamp = flick(f) * (1 - 0.65 * tl);
  const mistX = -f * 0.6 - 900 * ramp(f, AGE, 56, ease.inOutSine) - 650 * ramp(f, MOMENT, 44, ease.inOutSine);
  return (
    <LakeMedium f={f} cam={cam} time="night" lamp={lamp} dawnMix={tl} mistX={mistX}>
      <PlanLine pts={pts} draw={ramp(f, ps(8) - 4, 42, ease.inOutSine)} dreams={ramp(f, ps(9) - 4, 30)} gather={ramp(f, ps(10), 50)} f={f} />
      {assemble > 0 && (
        <>
          <GlowFigure id="self04" f={f} pose={walking ? walkPose((sx - SELF0[0]) / (STRIDE * 3.3), 1) : breathe(f, STAND_TALL, 0.5)} feet={[sx, SELF0[1]]} scale={3.3} opacity={0.9 * assemble} dissolve={1 - assemble} />
          <Lantern x={sx} y={SELF0[1] - 300} sc={3} o={0.25 * pulse * assemble} />
        </>
      )}
      {ghosts > 0 &&
        [[1440, 1160, 3.45, 1], [1775, 1172, 3.5, -1]].map(([x, y, sc, fc], i) => (
          <GlowFigure key={i} id={`g04-${i}`} f={f} tint="ghost" pose={breathe(f + i * 40, {...POSES.stand, headTilt: i === 1 ? -6 : 4})} feet={[x, y]} scale={sc} opacity={ghosts * 0.24} facing={fc as 1 | -1} />
        ))}
      <Trav id="t04" pose={pose} feet={HIM} scale={3.55} light={tl > 0.02 ? lerpLight('lampNight', 'dawnLake', tl) : 'lampNight'} keyMul={tl > 0.02 ? 1 : lamp} />
    </LakeMedium>
  );
}});
// 5 · "But life… had other plans." The lamp goes out.
add({id: '05 lamp out', from: cut(17), tx: {kind: 'dissolve', dur: 14}, bed: 'lake', vx: 960, render: (f) => {
  const lamp = lampSwitch(f, word(18, 'other'), 'off', 26) * flick(f);
  return <LakeWide f={f} R={1} time="night" lamp={lamp}><Trav id="t05" pose={breathe(f, BACK_DOWN)} feet={[1271, 603]} scale={0.42} light="lampWide" keyMul={lamp} facing={-1} /></LakeWide>;
}});
// 6 · "And sometimes the hardest part…" — in the dark, the imagined self dissolves into the mist.
add({id: '06 accept', from: cut(19), tx: {kind: 'push', dur: 20}, bed: 'lake', vx: 1450, render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const dis = ramp(f, ps(21), 75, ease.inOutSine);
  const down = ramp(f, ps(21) + 50, 40);
  return (
    <LakeMedium f={f} cam={{ax: 1800, ay: 920, z: 1.02 + 0.06 * D, px: 20 * D}} time="night" lamp={0}>
      <GlowFigure id="self06" f={f} pose={breathe(f, STAND_TALL, 0.5)} feet={[SELF_FAR, SELF0[1]]} scale={3.3} opacity={0.75} dissolve={dis} />
      <Trav id="t06" pose={breathe(f, blendPose({...POSES.stand, headTilt: -6}, HEAD_DOWN, down))} feet={HIM} scale={3.55} light="moon" />
    </LakeMedium>
  );
}});

// ---- Act II · the road at dusk: one continuous tracking shot (8–10), the camera easing between framings
const ROAD0 = cut(22);
const roadV = 243 / FPS; // plate px per frame: one stride cycle per 1.1 s at scale 2.3
const C24 = cut(24), C29 = cut(29);
const roadSx = (f: number) => lerp(760, 620, ramp(f, C24 - 10, 60, ease.inOutSine));
// 7 · "But what if you're not falling behind?…" — the lake mist carries us onto the road; dusk light comes up slowly.
add({id: '07 walk', from: ROAD0, tx: {kind: 'mist', dur: 44, tone: 'night'}, grade: {color: '#1A2236', a: 0.6, dur: 110}, bed: 'wind', vx: (f) => roadSx(f) + 230, render: (f) => {
  const x = 1000 + walked(ROAD0, f, () => roadV);
  return <RoadSide f={f} cam={roadCam(x, 1.0, roadSx(f))} time="dusk"><Trav id="t07" pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDusk" /></RoadSide>;
}});
// 8 · "…invisible timelines." The ruler of 'should' across the land: each "I should…" lights a milestone just ahead of
//     him — and each one cools to grey as it slips behind him. Missed, while he keeps walking.
add({id: '08 timeline', from: C24, bed: 'wind', vx: (f) => roadSx(f) + 230, render: (f, s) => {
  const x = 1000 + walked(ROAD0, f, () => roadV);
  const cam = roadCam(x, 1.0, roadSx(f));
  const litAt = [ps(25), ps(26), ps(27), ps(28)];
  const lit: [number, number][] = litAt.map((t, i) => {
    const xw = 1000 + walked(ROAD0, t, () => roadV);
    const c = roadCam(xw, 1.0, roadSx(t));
    const plateX = (980 + i * 60) / 0.75 + c.px! * 0.45; // on the meadow plane (k = 0.45), ~350 px ahead of him when it lights
    return [Math.round(plateX / 140) * 140, t];
  });
  const on = ramp(f, ps(24) + 30, 40) * (1 - ramp(f, s.to - 20, 20));
  return (
    <RoadSide f={f} cam={cam} time="dusk" midChildren={<TimelineRuler y={590} x0={cam.px! * 0.45 - 500} x1={cam.px! * 0.45 + 3500} spacing={140} lit={lit} f={f} opacity={on} />}>
      <Trav id="t08" pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDusk" />
    </RoadSide>
  );
}});
// 9 · "…a race against a version of ourselves that doesn't even exist." He hurries after the imagined self; it dissolves.
add({id: '09 race', from: C29, bed: 'wind', vx: (f) => 850 + 140 * ramp(f, ps(30) - 30, 40, ease.inOutSine), render: (f) => {
  const race0 = ps(30), stopAt = word(30, 'exist') - 6;
  const v = (t: number) => roadV * (1 + 0.7 * ramp(t, race0, 30)) * (1 - ramp(t, stopAt, 36));
  const x = 1000 + walked(ROAD0, C29, () => roadV) + walked(C29, f, v);
  const cam = roadCam(x, 1.0, 620);
  const selfX = x + 420 + walked(C29, f, (t) => roadV * 0.6 * ramp(t, race0, 30));
  const selfIn = ramp(f, ps(30) - 20, 25);
  const dis = ramp(f, word(30, "doesn't") - 4, 40);
  const moving = 1 - ramp(f, stopAt, 36);
  const stand = {...POSES.stand, lean: 10, headTilt: 6, shoulderDrop: 4, headDrop: 2};
  const pose = moving > 0.02 ? blendPose(stand, walkPose(x / (STRIDE * ROAD_SCALE), 4 + 5 * ramp(f, race0, 30)), moving) : breathe(f, stand, 1.6);
  return (
    <RoadSide f={f} cam={cam} time="dusk">
      <GlowFigure id="self09" f={f} pose={walkPose(selfX / (STRIDE * ROAD_SCALE), 2)} feet={[selfX, ROAD_FEET_Y - 4]} scale={ROAD_SCALE} opacity={selfIn * 0.85} dissolve={dis} />
      <Trav id="t09" pose={pose} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDusk" />
    </RoadSide>
  );
}});
// 10–11 · "We forget that people grow differently…" — many travellers on many paths, each with their own small light,
//         each at their own pace; then "There is no universal timeline…": the camera rises and he walks his own path.
const C31 = cut(31), C40 = cut(40);
const TRAVELLERS: {path: number; y0: number; vy: number; kind: 'walk' | 'sit' | 'stand' | 'pair'}[] = [
  {path: 0, y0: 1120, vy: 0.05, kind: 'walk'},
  {path: 0, y0: 960, vy: 0, kind: 'sit'},
  {path: 1, y0: 1060, vy: 0.11, kind: 'walk'},
  {path: 3, y0: 1150, vy: 0.07, kind: 'pair'},
  {path: 4, y0: 1010, vy: 0.025, kind: 'walk'},
  {path: 4, y0: 900, vy: 0, kind: 'stand'},
  {path: 1, y0: 860, vy: 0.04, kind: 'walk'},
  {path: 3, y0: 880, vy: 0.06, kind: 'walk'},
];
const Others: React.FC<{f: number; t0: number; light: 'plainDusk' | 'plainDawn'; lanterns?: number}> = ({f, t0, light, lanterns = 1}) => (
  <>
    {TRAVELLERS.map((t, i) => {
      const u = pathU(t.path, t.y0 - t.vy * (f - t0));
      const [x, y, sc] = pathAt(t.path, u);
      const pose = t.kind === 'sit' ? POSES.sitRock : t.kind === 'stand' ? breathe(f + i * 30, STAND_BACK) : frontWalkPose((f - t0) / 33 + i * 0.37);
      const fig = (dx: number, k: string) => (
        <g key={k}>
          <Lantern x={x + dx} y={y - 95 * sc} sc={sc} o={0.75 * lanterns} />
          <Trav id={`o${i}${k}`} pose={pose} feet={[x + dx, y]} scale={sc} light={light} opacity={0.92} />
        </g>
      );
      return t.kind === 'pair' ? [fig(-22 * sc, 'a'), fig(22 * sc, 'b')] : fig(0, 'a');
    })}
  </>
);
const MY_U0 = pathU(2, 1150);
const cam10 = (f: number) => (f < C40 ? plainCam(1.3 - 0.08 * ramp(f, C31, C40 - C31), 1290) : plainCam(1.22 - 0.22 * ramp(f, C40, cut(42) - C40, ease.inOutSine), 1290));
const my11 = (f: number) => pathAt(2, pathU(2, 1150 - walked(ps(41), f, (t) => 0.09 * ramp(t, ps(41), 30))));
add({id: '10 paths', from: C31, tx: {kind: 'push', dur: 30}, bed: 'wind', vx: (f) => clamp(screenX(cam10(f), ...(pathAt(2, MY_U0).slice(0, 2) as [number, number])) + 40, 400, 1520), render: (f) => {
  const [x, y, sc] = pathAt(2, MY_U0);
  return (
    <Plain f={f} cam={cam10(f)} time="dusk">
      <Others f={f} t0={C31} light="plainDusk" lanterns={ramp(f, C31 + 20, 40)} />
      <Lantern x={x} y={y - 95 * sc} sc={sc} o={0.9} />
      <Trav id="t10" pose={breathe(f, STAND_BACK)} feet={[x, y]} scale={sc} light="plainDusk" />
    </Plain>
  );
}});
add({id: '11 own pace', from: C40, bed: 'wind', vx: (f) => clamp(screenX(cam10(f), my11(f)[0], my11(f)[1]), 400, 1520), render: (f) => {
  const go = ramp(f, ps(41), 30);
  const [x, y, sc] = my11(f);
  return (
    <Plain f={f} cam={cam10(f)} time="dusk">
      <Others f={f} t0={C31} light="plainDusk" />
      <Lantern x={x} y={y - 95 * sc} sc={sc} o={0.95} />
      <Trav id="t11" pose={go > 0.02 ? blendPose(STAND_BACK, frontWalkPose((f - ps(41)) / 36), go) : breathe(f, STAND_BACK)} feet={[x, y]} scale={sc} light="plainDusk" />
    </Plain>
  );
}});
// 12 · "So please, stop treating your life like a deadline…" — the ruler of 'should' returns over him on "deadline";
//      he stops and breathes; on "You are a human being… not a project…" it falls apart, tick by tick.
const C42 = cut(42);
add({id: '12 deadline', from: C42, tx: {kind: 'dissolve', dur: 24}, bed: 'wind', vx: 960, render: (f, s) => {
  const stopAt = word(43, 'stop');
  const v = (t: number) => roadV * 0.8 * (1 - ramp(t, stopAt, 30));
  const x = 3000 + walked(C42, f, v);
  const moving = 1 - ramp(f, stopAt, 30);
  const tall = ramp(f, ps(44), 40);
  const pose = moving > 0.02 ? blendPose(POSES.stand, walkPose(x / (STRIDE * ROAD_SCALE)), moving) : breathe(f, blendPose(POSES.stand, STAND_TALL, tall), 1.3);
  const D = ramp(f, stopAt, s.to - stopAt, ease.inOutSine);
  const cam = roadCam(x, 1.0 + 0.3 * D, 860);
  const on = ramp(f, word(43, 'deadline') - 14, 24);
  const drop = ramp(f, ps(44) + 8, 120, ease.inOutSine);
  return (
    <RoadSide f={f} cam={cam} time="dusk" midChildren={on > 0 ? <TimelineRuler y={560} x0={cam.px! * 0.45 - 900} x1={cam.px! * 0.45 + 3800} spacing={140} lit={[]} f={f} opacity={on * 0.9} drop={drop} /> : undefined}>
      <Trav id="t12" pose={pose} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDusk" />
    </RoadSide>
  );
}});

// ---- Act III · night, rain, the lamp out
// 13 · "And then, there are the things we never wanted to lose…" — dusk goes down into the rainy night; small lights
//      leave his hands and drift away over the water, one for each loss.
add({id: '13 losses', from: cut(46), tx: {kind: 'nightfall', dur: 54}, grade: {color: '#0E1422', a: 0.45, dur: 70}, bed: 'rain', vx: 1440, render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const starts = [ps(48), ps(49), word(49, 'dream'), ps(50)];
  const hand: [number, number] = [HIM[0] + 70, HIM[1] - 300];
  return (
    <LakeMedium f={f} cam={{ax: 1750, ay: 900, z: 1.04 + 0.04 * D, px: 15 * D}} time="night" lamp={0} rain={0.85}>
      {starts.map((t, i) => <DriftLight key={i} f={f} start={t - 4} from={[hand[0] + i * 6, hand[1] + i * 10]} to={[2250 + i * 50, 780 - i * 30]} size={13} dur={170} />)}
      <Trav id="t13" pose={breathe(f, {...POSES.stand, headTilt: -2, armR: [24, 30]})} feet={HIM} scale={3.55} light="moon" />
    </LakeMedium>
  );
}});
// 14 · "Losing something you truly wanted hurts…" — he sits, knees drawn in, in the rain.
add({id: '14 sit', from: cut(51), tx: {kind: 'push', dur: 18}, bed: 'rain', vx: 1250, render: (f, s) => {
  const sit = ramp(f, s.from + 6, 46, ease.inOutSine);
  const D = ramp(f, s.from, s.to - s.from);
  return (
    <LakeMedium f={f} cam={{ax: 1600, ay: 1000, z: 1.18 + 0.06 * D}} time="night" lamp={0} rain={0.85}>
      <Trav id="t14" pose={breathe(f, blendPose(POSES.stand, SIT, sit), 0.6)} feet={HIM} scale={3.55} light="moon" />
    </LakeMedium>
  );
}});
// 15 · "Sometimes you just need to sit with the feeling…" — the held wide; a small seated figure in the rain.
add({id: '15 hold', from: cut(54), tx: {kind: 'dissolve', dur: 26}, bed: 'rain', vx: 960, render: (f, s) => (
  <LakeWide f={f} R={1} time="night" lamp={0} rain={0.8 - 0.3 * ramp(f, s.to - 60, 60)}>
    <Trav id="t15" pose={breathe(f, {...SIT, lean: 30}, 0.5)} feet={[1271, 603]} scale={0.42} light="lampWide" keyMul={0} facing={-1} />
  </LakeWide>
)});

// ---- Act IV · courage to begin again (the light returns; pre-dawn → dawn)
// 16 · "But don't let one painful chapter…" — the rain eases, the lamp relights; he lifts his head and stands.
add({id: '16 relight', from: cut(59), tx: {kind: 'push', dur: 24}, bed: 'lake', vx: 1330, render: (f, s) => {
  const lampAt = word(59, 'story');
  const lamp = lampSwitch(f, lampAt, 'on', 30) * flick(f);
  const lift = ramp(f, ps(60), 40);
  const up = ramp(f, ps(61), 60, ease.inOutSine);
  const sitLift = blendPose(SIT, {...SIT, headTilt: -10, headDrop: 0, lean: 18}, lift);
  const D = ramp(f, s.from, s.to - s.from);
  return (
    <LakeMedium f={f} cam={{ax: 1600, ay: 960, z: 1.12 - 0.08 * D}} time="night" lamp={lamp} rain={0.6 * (1 - ramp(f, s.from, 70))}>
      <Trav id="t16" pose={breathe(f, blendPose(sitLift, {...POSES.stand, headTilt: -6}, up), 0.8)} feet={HIM} scale={3.55} light={lamp > 0.05 ? 'lampNight' : 'moon'} keyMul={lamp} />
    </LakeMedium>
  );
}});
// 17 · "Sometimes, the most important growth happens quietly. When nobody is watching…" — under the hill the roots grow
//      while, above, he kneels alone by a sapling. The camera rises out of the soil to find him; he chooses to get up.
const TREE_X = 1450;
const S17 = cut(63), S17_END = cut(70);
add({id: '17 roots · get up', from: S17, tx: {kind: 'dissolve', dur: 40}, grade: {color: '#1A2032', a: 0.35, dur: 80}, bed: 'wind', vx: (f) => lerp(1010, 1030, ramp(f, ps(65), 120)), render: (f) => {
  const g = ramp(f, S17, S17_END - S17, ease.inOutSine);
  const rise = ramp(f, ps(65) - 10, 120, ease.inOutSine); // "when nobody is watching": we find him
  const cam: Cam = {ax: lerp(1450, 1400, rise), ay: lerp(930, 840, rise), z: lerp(1.55 - 0.05 * g, 1.18, rise)};
  const upAt = word(67, 'get') - 6;
  const up = ramp(f, upAt, 45, ease.inOutSine);
  const myX = 1300;
  return (
    <Hill f={f} cam={cam} time="predawn" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.0} grow={0.08 + 0.74 * g} glow={0.22 * g + 0.25 * ramp(f, ps(69), 40)} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={0.9} grow={0.22} />
      <Trav id="t17" pose={breathe(f, blendPose(KNEEL, {...POSES.stand, headTilt: -4}, up), 0.7)} feet={[myX, hillY(myX) + 3]} scale={2.1} light="hillPre" />
    </Hill>
  );
}});
// 18 · "Maybe you need to hear this today… You are allowed…" — first sun; he walks back along the pier toward us.
//      "Allowed to outgrow the dreams you once had": the faint glow of the old dream stays behind at the pier's end.
const C70 = cut(70);
add({id: '18 allowed', from: C70, tx: {kind: 'bloom', dur: 50, at: [1150, 360]}, grade: {color: '#3A4266', a: 0.35, dur: 100}, bed: 'dawn', vx: 960, render: (f, s) => {
  const t = clamp((f - (C70 + 20)) / (s.to - C70 - 20));
  const tw = 0.03 * t;
  const tt = (1 - 1 / (1 + 22 * tw)) / (1 - 1 / 23);
  const y = 600 + (1480 - 600) * tt;
  const sc = 0.42 * (44 + 996 * tt) / 44;
  const walking = f > C70 + 20 && t < 1;
  const pose = walking ? frontWalkPose((f - C70) / 34) : breathe(f, STAND_BACK);
  const dream = Math.min(ramp(f, ps(73), 30), 1 - ramp(f, ps(74) + 20, 60));
  return (
    <LakeWide f={f} R={1} time="dawn" lamp={0.35 * flick(f)}>
      {dream > 0 && <GlowFigure id="dream18" f={f} pose={breathe(f, STAND_TALL, 0.4)} feet={[1271, 603]} scale={0.42} opacity={0.75 * dream} dissolve={ramp(f, ps(74) + 20, 60)} />}
      <Trav id="t18" pose={pose} feet={[1280, y + 3]} scale={sc} light="dawnWide" />
    </LakeWide>
  );
}});
// 19–20 · "Don't underestimate the quiet courage…" — walking on at dawn; the camera eases in closer, continuously.
//         "Not every victory is visible": a small light kindles in his chest that no one else could see.
//         "…beautiful pages left to be written": the road ahead fills with light.
const ROAD2 = cut(77), C80 = cut(80);
const road2 = (f: number) => {
  const close = ramp(f, C80 - 20, 70, ease.inOutSine);
  return {z: lerp(1.0, 1.35 + 0.05 * ramp(f, C80, cut(84) - C80), close), sx: lerp(700, 880, close)};
};
const RoadDawnWalk: React.FC<{f: number; id: string}> = ({f, id}) => {
  const x = 2000 + walked(ROAD2, f, () => roadV);
  const {z, sx} = road2(f);
  const victory = Math.min(ramp(f, ps(78), 20), 1 - 0.6 * ramp(f, ps(79) + 30, 60));
  const pages = ramp(f, ps(83) + 10, 90, ease.inOutSine);
  return (
    <AbsoluteFill>
      <RoadSide f={f} cam={roadCam(x, z, sx)} time="dawn">
        <Trav id={id} pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDawn" />
        {victory > 0 && <Lantern x={x + 4} y={ROAD_FEET_Y - 112 * ROAD_SCALE} sc={ROAD_SCALE * 0.55} o={victory * (0.75 + 0.25 * Math.sin(f / 9))} />}
      </RoadSide>
      {pages > 0 && <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(255,226,180,0) 35%, rgba(255,226,180,0.35) 85%, rgba(255,236,200,0.5) 100%)', mixBlendMode: 'screen', opacity: pages}} />}
    </AbsoluteFill>
  );
};
add({id: '19 courage', from: ROAD2, tx: {kind: 'mist', dur: 40, tone: 'dawn'}, bed: 'wind', vx: (f) => road2(f).sx + 210, render: (f) => <RoadDawnWalk f={f} id="t19" />});
add({id: '20 pages', from: C80, bed: 'wind', vx: (f) => road2(f).sx + 210, render: (f) => <RoadDawnWalk f={f} id="t20" />});

// ---- Act V · faith and the bigger picture (dawn)
// 21 · "And perhaps there is another way to look at all of this…" — he opens his hand; a small light floats free.
add({id: '21 let go', from: cut(84), tx: {kind: 'push', dur: 30}, bed: 'wind', vx: 1130, render: (f, s) => {
  const openAt = word(86, 'loosen') - 4;
  const open = ramp(f, openAt, 30);
  const myX = 1290;
  const feet: [number, number] = [myX, hillY(myX) + 3];
  return (
    <Hill f={f} cam={{ax: 1380, ay: 800, z: 1.25 + 0.04 * ramp(f, s.from, s.to - s.from)}} time="dawn" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.0} grow={0.82} glow={0.15} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={0.9} grow={0.42} sway={Math.sin(f / 50) * 2} />
      <Trav id="t21" pose={breathe(f, blendPose({...POSES.stand, armR: [40, 70]}, {...POSES.letGo, armR: [70, 8]}, open))} feet={feet} scale={2.1} light="hillDawn" />
      <DriftLight f={f} start={openAt + 18} from={[feet[0] + 120, feet[1] - 230]} to={[feet[0] + 420, feet[1] - 720]} size={6} dur={170} />
    </Hill>
  );
}});
// 22 · The verse — the sky at first light, nothing else. The released light is still rising, and fades into the sky.
add({id: '22 verse', from: cut(87), tx: {kind: 'dissolve', dur: 48}, bed: 'dawn', vx: 1100, render: (f, s) => {
  const t = ramp(f, s.from, s.to - s.from, ease.inOutSine);
  return (
    <LakeMedium f={f} cam={{ax: 1700, ay: 640, z: 1.18 - 0.05 * t, py: 30 - 110 * t}} time="dawn" lamp={0} skyOnly
      over={<svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}><DriftLight f={f} start={s.from - 60} from={[1180, 560]} to={[1240, 160]} size={5} dur={200} /></svg>} />
  );
}});
// 23–24 · "Think about that for a moment…" — he looks back along the winding path behind him; then, on
//         "God knows the whole picture", one continuous pull-back from him to the whole land.
const C91 = cut(91), C95 = cut(95);
const LOOK_U = pathU(2, 1150);
const BIG = 1.55; // the Traveller a touch larger in the plain close shots, so his gesture reads
const cam23 = (f: number): Cam => {
  const [x, y] = pathAt(2, LOOK_U);
  const z = f < C95 ? 1.8 - 0.1 * ramp(f, C91, C95 - C91) : lerp(1.7, 1.9, ramp(f, C95, 90, ease.inOutSine));
  const a = aimCam(x, y, z, 960, 790);
  const out = ramp(f, ps(99) - 6, 80, ease.inOutCubic);
  const b = plainCam(1.0, 1280);
  return {ax: lerp(a.ax, b.ax, out), ay: lerp(a.ay, b.ay, out), z: lerp(a.z, b.z, out), px: lerp(a.px!, b.px!, out), py: lerp(a.py!, b.py!, out)};
};
const vx23 = (f: number) => clamp(screenX(cam23(f), pathAt(2, LOOK_U)[0], pathAt(2, LOOK_U)[1]), 400, 1520);
add({id: '23 look back', from: C91, tx: {kind: 'mist', dur: 48, tone: 'dawn'}, bed: 'wind', vx: vx23, render: (f) => {
  const [x, y, sc] = pathAt(2, LOOK_U);
  const back = ramp(f, ps(93), 40);
  return (
    <Plain f={f} cam={cam23(f)} time="dawn">
      <Trav id="t23" pose={breathe(f, blendPose(STAND_BACK, LOOK_BACK, back))} feet={[x, y]} scale={sc * BIG} light="plainDawn" facing={-1} />
    </Plain>
  );
}});
add({id: '24 whole picture', from: C95, bed: 'wind', vx: vx23, render: (f) => {
  const [x, y, sc] = pathAt(2, LOOK_U);
  const out = ramp(f, ps(99) - 6, 80, ease.inOutCubic);
  return (
    <Plain f={f} cam={cam23(f)} time="dawn">
      <Others f={f} t0={C31} light="plainDawn" lanterns={out} />
      <Lantern x={x} y={y - 95 * sc} sc={sc} o={0.9 * out} />
      <Trav id="t24" pose={breathe(f, STAND_BACK)} feet={[x, y]} scale={sc * lerp(BIG, 1, out)} light="plainDawn" />
    </Plain>
  );
}});
// 25 · "And sometimes faith means taking the next step even when you cannot see the entire road." — into the fog.
const C100 = cut(100);
add({id: '25 next step', from: C100, tx: {kind: 'mist', dur: 40, tone: 'dawn'}, bed: 'wind', vx: 900, render: (f) => {
  const stepAt = word(100, 'taking') - 4;
  const v = (t: number) => roadV * 0.85 * ramp(t, stepAt, 20);
  const x = 5000 + walked(C100, f, v);
  const moving = ramp(f, stepAt, 20);
  const pose = moving > 0.02 ? blendPose(POSES.stand, walkPose((x - 5000) / (STRIDE * ROAD_SCALE)), moving) : breathe(f, POSES.stand);
  return <RoadSide f={f} cam={roadCam(5000, 1.0, 640)} time="dawn" fog={0.9}><Trav id="t25" pose={pose} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDawn" /></RoadSide>;
}});

// ---- Act VI · the story is still unfolding (sunrise → morning)
// 26 · "So, if life doesn't look the way you planned, take a breath…" — out of the fog, the opening place at sunrise.
add({id: '26 sunrise', from: cut(102), tx: {kind: 'bloom', dur: 50, at: [1500, 420]}, bed: 'dawn', vx: 1300, render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const tall = ramp(f, ps(104), 45);
  return (
    <LakeMedium f={f} cam={pilotCam(D * 0.8)} time="dawn" lamp={0.3 * flick(f)}>
      <Trav id="t26" pose={breathe(f, blendPose({...POSES.stand, headTilt: -4}, STAND_TALL, tall), 1.3)} feet={HIM} scale={3.55} light="dawnLake" />
    </LakeMedium>
  );
}});
// 27 · "Keep growing. Keep learning. Keep becoming…" — the tree has grown; the roots glow.
add({id: '27 keep growing', from: cut(108), tx: {kind: 'push', dur: 30}, bed: 'wind', vx: 1030, render: (f, s) => {
  const grow = 0.55 + 0.12 * ramp(f, ps(108), 30) + 0.12 * ramp(f, ps(109), 30) + 0.12 * ramp(f, ps(110), 30);
  const glow = ramp(f, ps(108), 90);
  const myX = 1270;
  return (
    <Hill f={f} cam={{ax: 1420, ay: 880, z: 1.1 + 0.04 * ramp(f, s.from, s.to - s.from)}} time="morning" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.05} grow={0.9} glow={0.7 * glow} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={1.15} grow={grow} sway={Math.sin(f / 45) * 2} />
      <Trav id="t27" pose={breathe(f, {...POSES.stand, headTilt: -14})} feet={[myX, hillY(myX) + 3]} scale={2.1} light="hillMorning" />
    </Hill>
  );
}});
// 28 · "Because life isn't only about reaching…" — his imagined self walks beside him, then becomes him.
const ROAD3 = cut(112);
add({id: '28 together', from: ROAD3, tx: {kind: 'dissolve', dur: 30}, bed: 'wind', vx: 900, render: (f) => {
  const x = 7000 + walked(ROAD3, f, () => roadV);
  const merge = ramp(f, word(113, 'become') - 10, 50, ease.inOutSine);
  const selfX = x + 150 * (1 - merge);
  const warm = Math.min(ramp(f, word(113, 'become') + 30, 15), 1 - ramp(f, word(113, 'become') + 50, 40));
  return (
    <RoadSide f={f} cam={roadCam(x, 1.08, 760)} time="dawn">
      <GlowFigure id="self28" f={f} pose={walkPose(x / (STRIDE * ROAD_SCALE) + 0.03, 2)} feet={[selfX, ROAD_FEET_Y - 3]} scale={ROAD_SCALE} opacity={(1 - merge * merge) * 0.8 * ramp(f, ROAD3, 20)} />
      <Trav id="t28" pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDawn" keyMul={1 + warm * 0.6} />
    </RoadSide>
  );
}});
// 29 · "And wherever you are right now…" — he walks his own path toward the sunrise, his own light with him.
const C115 = cut(115);
const cam29 = (f: number) => plainCam(1.45 - 0.4 * ramp(f, C115, cut(119) - C115, ease.inOutSine), 1300);
const my29 = (f: number) => pathAt(2, pathU(2, 1180 - 0.1 * (f - C115)));
add({id: '29 unfolding', from: C115, tx: {kind: 'push', dur: 30}, bed: 'wind', vx: (f) => clamp(screenX(cam29(f), my29(f)[0], my29(f)[1]), 400, 1520), render: (f) => {
  const [x, y, sc] = my29(f);
  return (
    <Plain f={f} cam={cam29(f)} time="dawn">
      <Lantern x={x} y={y - 95 * sc} sc={sc} o={0.8} />
      <Trav id="t29" pose={frontWalkPose((f - C115) / 36)} feet={[x, y]} scale={sc} light="plainDawn" />
    </Plain>
  );
}});
// 30 · "This is Deeply Rooted…" — the tree, the roots, the end card.
add({id: '30 outro', from: cut(119), tx: {kind: 'dissolve', dur: 50}, bed: 'wind', vx: 1030, render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from, ease.inOutSine);
  const myX = 1280;
  return (
    <Hill f={f} cam={{ax: 1420, ay: 860, z: 1.22 - 0.16 * D}} time="morning" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.05} grow={0.95} glow={0.7} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={1.15} grow={0.92} sway={Math.sin(f / 45) * 2} />
      <Trav id="t30" pose={breathe(f, {...POSES.sitRock, headTilt: -8}, 0.6)} feet={[myX, hillY(myX) + 3]} scale={2.1} light="hillMorning" />
    </Hill>
  );
}});
for (let i = 0; i < S.length; i++) S[i].to = i + 1 < S.length ? S[i + 1].from : EP_FRAMES;
export const SHOTS = S;

// ------------------------------------------------------------------ transitions
const shotAt = (f: number) => S.findIndex((s) => f >= s.from && f < s.to);
/** progress 0…1 of the transition into shot i at frame f (1 = fully arrived) */
const txProgress = (i: number, f: number) => {
  const s = S[i];
  if (!s.tx || i === 0) return 1;
  return ease.inOutSine(clamp((f - s.from) / s.tx.dur));
};
const Graded: React.FC<{s: Shot; f: number; children: React.ReactNode}> = ({s, f, children}) => {
  const g = s.grade ? s.grade.a * (1 - ease.inOutSine(clamp((f - s.from) / s.grade.dur))) : 0;
  return (
    <AbsoluteFill>
      {children}
      {g > 0.005 && <AbsoluteFill style={{background: s.grade!.color, opacity: g, mixBlendMode: 'multiply'}} />}
    </AbsoluteFill>
  );
};
const MistVeil: React.FC<{f: number; amount: number; tone: 'night' | 'dawn'}> = ({f, amount, tone}) => {
  if (amount <= 0.005) return null;
  const src = plate(tone === 'night' ? 'pilot01/s1_mist.png' : 'ep01/lake1_dawn_mist.png');
  const x = -((f * 3.2) % 1920);
  const img = (dx: number, flip: boolean, y: number, o: number) => (
    <Img src={src} style={{position: 'absolute', left: 0, top: y, width: 1920, height: 1080, opacity: o, transform: `translateX(${dx}px) ${flip ? 'scaleX(-1)' : ''}`}} />
  );
  return (
    <AbsoluteFill style={{opacity: amount, filter: 'blur(6px)'}}>
      <AbsoluteFill style={{background: tone === 'night' ? 'rgba(92,106,130,0.55)' : 'rgba(236,222,204,0.6)'}} />
      {img(x, false, 120, 1)}
      {img(x + 1920, true, 120, 1)}
      {img(-x * 0.6 - 1920, true, -160, 0.8)}
      {img(-x * 0.6, false, -160, 0.8)}
    </AbsoluteFill>
  );
};

/** The picture (format independent: drawn in 1920×1080 landscape space). */
const Picture: React.FC<{f: number}> = ({f}) => {
  const i = Math.max(0, shotAt(f));
  const cur = S[i];
  const p = txProgress(i, f);
  const layer = (s: Shot, style?: React.CSSProperties) => (
    <AbsoluteFill key={s.id} style={style}>
      <Graded s={s} f={f}>{s.render(f, s)}</Graded>
    </AbsoluteFill>
  );
  if (p >= 1 || !cur.tx) return layer(cur);
  const prev = S[i - 1];
  const tx = cur.tx;
  const b = Math.sin(Math.PI * p); // bell, peaks mid-transition
  if (tx.kind === 'push') {
    return (
      <>
        {layer(prev, {transform: `scale(${1 + 0.045 * p})`})}
        {layer(cur, {opacity: p, transform: `scale(${1.045 - 0.045 * p})`})}
      </>
    );
  }
  return (
    <>
      {layer(prev)}
      {layer(cur, {opacity: p})}
      {tx.kind === 'mist' && <MistVeil f={f} amount={0.85 * b} tone={tx.tone} />}
      {tx.kind === 'bloom' && (
        <AbsoluteFill style={{background: `radial-gradient(circle at ${tx.at[0]}px ${tx.at[1]}px, rgba(255,226,178,0.95) 0%, rgba(255,210,160,0.5) 22%, rgba(255,200,150,0) 62%)`, mixBlendMode: 'screen', opacity: 0.85 * b}} />
      )}
      {tx.kind === 'nightfall' && <AbsoluteFill style={{background: '#121A2C', mixBlendMode: 'multiply', opacity: 0.6 * Math.sin(Math.PI * clamp(p * 0.9 + 0.1))}} />}
    </>
  );
};

/** Vertical framing: where (landscape screen x) the 9:16 frame looks, blended across transitions. */
const verticalX = (f: number) => {
  const i = Math.max(0, shotAt(f));
  const cur = S[i];
  const p = txProgress(i, f);
  return p >= 1 || i === 0 ? cur.vx(f) : lerp(S[i - 1].vx(f), cur.vx(f), p);
};

// ------------------------------------------------------------------ titles (laid out per format)
type Format = 'landscape' | 'vertical';
const TitleCard: React.FC<{f: number; format: Format}> = ({f, format}) => {
  const a = ps(0) - 6, b = TITLE_OUT;
  const o = Math.min(ramp(f, a, 24), 1 - ramp(f, b - 22, 22));
  if (o <= 0) return null;
  const v = format === 'vertical';
  const rise = (1 - ease.outCubic(clamp((f - a) / 60))) * 10;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: v ? 'flex-start' : 'center', paddingTop: v ? 560 : 0, opacity: o, transform: `translateY(${rise - (v ? 0 : 40)}px)`}}>
      <div style={{fontFamily: TITLE_FONT, fontWeight: 600, fontSize: v ? 80 : 82, lineHeight: 1.12, textAlign: 'center', maxWidth: v ? 760 : undefined, textWrap: v ? 'balance' : undefined, color: '#F4EFE6', letterSpacing: 0.5, textShadow: '0 2px 18px rgba(0,0,0,0.5)'}}>
        When Life Doesn't Go as Planned
      </div>
      <div lang="ar" dir="rtl" style={{fontFamily: AR_FONT, fontWeight: 500, fontSize: v ? 58 : 52, color: '#F4EFE6', marginTop: v ? 22 : 10, textShadow: '0 2px 14px rgba(0,0,0,0.5)'}}>حين لا تسير الحياة كما خطّطنا</div>
      <div style={{fontFamily: TITLE_FONT, fontWeight: 600, fontSize: v ? 28 : 26, color: '#E6D7BD', letterSpacing: 8, marginTop: 34, opacity: ramp(f, ps(1) - 6, 20)}}>DEEPLY ROOTED</div>
    </AbsoluteFill>
  );
};
/** The verse's reference, quietly at the top while it is read. */
const VerseRef: React.FC<{f: number; format: Format}> = ({f, format}) => {
  const o = Math.min(ramp(f, ps(87) + 40, 36), 1 - ramp(f, pe(90) + 30, 40));
  if (o <= 0) return null;
  const v = format === 'vertical';
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'flex-start', paddingTop: v ? 330 : 96, opacity: o * 0.92}}>
      <div style={{fontFamily: TITLE_FONT, fontWeight: 600, fontSize: v ? 34 : 30, letterSpacing: 5, color: '#F4EFE6', textShadow: '0 2px 12px rgba(0,0,0,0.35)'}}>AL-BAQARAH · 2:216</div>
      <div lang="ar" dir="rtl" style={{fontFamily: AR_FONT, fontWeight: 500, fontSize: v ? 38 : 34, marginTop: 6, color: '#F4EFE6', textShadow: '0 2px 12px rgba(0,0,0,0.35)'}}>سورة البقرة · الآية ٢١٦</div>
    </AbsoluteFill>
  );
};
const EndCard: React.FC<{f: number; format: Format}> = ({f, format}) => {
  const o = ramp(f, pe(124) + 20, 40);
  if (o <= 0) return null;
  const v = format === 'vertical';
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: o}}>
      <div style={{fontFamily: TITLE_FONT, fontWeight: 600, fontSize: v ? 104 : 96, color: '#F7F1E6', letterSpacing: 2, textShadow: '0 2px 22px rgba(0,0,0,0.45)', transform: `translateY(${v ? -720 : -385}px)`}}>Deeply Rooted</div>
    </AbsoluteFill>
  );
};
const TextLayer: React.FC<{f: number; format: Format}> = (p) => (
  <>
    <TitleCard {...p} />
    <VerseRef {...p} />
    <EndCard {...p} />
  </>
);

// ------------------------------------------------------------------ sound: one continuous soundscape
// Every ambience bed plays for the whole film (seamless loops, never restarted). Each shot only sets the target mix of
// its place; the mix glides between places over 4 s, a quiet wind "air" bed runs underneath everything, all beds are
// matched in loudness, and they dip only gently and slowly under the voice.
const BEDS: Record<Bed, {src: string; vol: number}> = {
  // gains bring every bed to the same loudness (≈ −38.5 LUFS in the mix before mastering)
  lake: {src: 'audio/ep01/loop_lake.wav', vol: 0.216},
  rain: {src: 'audio/ep01/loop_rain.wav', vol: 0.133},
  wind: {src: 'audio/ep01/loop_wind.wav', vol: 0.232},
  dawn: {src: 'audio/ep01/loop_dawn.wav', vol: 0.251},
};
const MIX: Record<Bed, Record<Bed, number>> = {
  lake: {lake: 1, rain: 0, wind: 0.3, dawn: 0},
  rain: {lake: 0.35, rain: 1, wind: 0.25, dawn: 0},
  wind: {lake: 0, rain: 0, wind: 1, dawn: 0},
  dawn: {lake: 0, rain: 0, wind: 0.3, dawn: 1},
};
const BED_NAMES: Bed[] = ['lake', 'rain', 'wind', 'dawn'];
const boxSmooth = (a: Float32Array, r: number) => {
  const out = new Float32Array(a.length);
  let acc = 0;
  const pre = new Float64Array(a.length + 1);
  for (let i = 0; i < a.length; i++) pre[i + 1] = pre[i] + a[i];
  for (let i = 0; i < a.length; i++) {
    const lo = Math.max(0, i - r), hi = Math.min(a.length, i + r + 1);
    acc = (pre[hi] - pre[lo]) / (hi - lo);
    out[i] = acc;
  }
  return out;
};
const MIXCURVE = (() => {
  const w: Record<Bed, Float32Array> = {lake: new Float32Array(EP_FRAMES), rain: new Float32Array(EP_FRAMES), wind: new Float32Array(EP_FRAMES), dawn: new Float32Array(EP_FRAMES)};
  for (const s of S) {
    const mid = s.tx ? Math.round(s.tx.dur / 2) : 0; // the sound changes place with the picture's transition
    for (let f = Math.max(0, s.from + mid); f < Math.min(EP_FRAMES, s.to + (S[S.indexOf(s) + 1]?.tx ? Math.round(S[S.indexOf(s) + 1].tx!.dur / 2) : 0)); f++) {
      for (const b of BED_NAMES) w[b][f] = MIX[s.bed][b];
    }
  }
  for (const b of BED_NAMES) w[b] = boxSmooth(boxSmooth(w[b], 60), 30); // ≈ 4 s glide, smooth at both ends
  const sp = new Float32Array(EP_FRAMES);
  for (let f = 0; f < EP_FRAMES; f++) sp[f] = speaking(f) ? 1 : 0;
  const duck = boxSmooth(boxSmooth(sp, 25), 25); // slow and gentle: no pumping
  return {w, duck};
})();
const Soundtrack: React.FC = () => (
  <>
    {SEGMENTS.map((sg, i) => {
      const from = Math.round(sg.at * FPS);
      const dur = Math.round((sg.src[1] - sg.src[0]) * FPS);
      return (
        <Sequence key={`vo${i}`} from={from} durationInFrames={dur} name={`VO ${i + 1} · ${sg.note.slice(0, 40)}`} layout="none">
          <Audio src={staticFile(VOICE)} trimBefore={Math.round(sg.src[0] * FPS)} volume={(fr_) => clamp(fr_ / 2) * clamp((dur - fr_) / 2)} />
        </Sequence>
      );
    })}
    {BED_NAMES.map((b) => (
      <Audio
        key={b}
        name={`Ambience · ${b}`}
        src={staticFile(BEDS[b].src)}
        loop
        volume={(g) => {
          const f = Math.min(EP_FRAMES - 1, Math.max(0, g));
          const w = MIXCURVE.w[b][f];
          if (w < 0.002) return 0;
          return BEDS[b].vol * Math.sqrt(w) * (1 - 0.14 * MIXCURVE.duck[f]) * clamp(f / 30) * clamp((EP_FRAMES - f) / 75);
        }}
      />
    ))}
  </>
);

// ------------------------------------------------------------------ the two masters
const Fades: React.FC<{f: number}> = ({f}) => {
  const fadeIn = 1 - ramp(f, 0, 20);
  const fadeOut = ramp(f, EP_FRAMES - 45, 45);
  return <AbsoluteFill style={{background: '#06090F', opacity: Math.max(fadeIn, fadeOut)}} />;
};
/** 16:9 long-form master (clean: picture + sound, subtitles are burned in afterwards). */
export const Episode01: React.FC<{sound?: boolean}> = ({sound = true}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: '#06090F'}}>
      <Picture f={f} />
      <TextLayer f={f} format="landscape" />
      <Fades f={f} />
      {sound && <Soundtrack />}
    </AbsoluteFill>
  );
};

/** Vertical framing constants (shared with the paint pass, which extends the picture below V_PIC_BOTTOM). */
export const V_SCALE = 1.4; // landscape → vertical scale
export const V_SAFE_Y = 1230; // landscape y = 905 (top of the subtitle-safe band) lands here
export const V_TOP = V_SAFE_Y - 905 * V_SCALE; // −37
export const V_PIC_BOTTOM = Math.round(V_TOP + 1080 * V_SCALE); // 1475
/** 9:16 Shorts master (clean): the same picture re-framed per shot, titles laid out for a phone. */
export const Episode01Vertical: React.FC<{sound?: boolean}> = ({sound = true}) => {
  const f = useCurrentFrame();
  const cx = verticalX(f);
  const tx = clamp(540 - cx * V_SCALE, 1080 - 1920 * V_SCALE, 0);
  return (
    <AbsoluteFill style={{background: '#06090F'}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${tx}px, ${V_TOP}px) scale(${V_SCALE})`, overflow: 'hidden'}}>
        <Picture f={f} />
      </div>
      <TextLayer f={f} format="vertical" />
      <Fades f={f} />
      {sound && <Soundtrack />}
    </AbsoluteFill>
  );
};

/** Studio previews with the burned-in bilingual subtitles (the render pipeline burns them in post instead). */
const cues = (timed.cues as (BilingualCue & {burn?: boolean})[]).filter((c) => c.burn !== false);
export const Episode01Preview: React.FC<{showSafeZone?: boolean}> = ({showSafeZone = false}) => (
  <AbsoluteFill>
    <Episode01 />
    <BilingualSubtitles cues={cues} showSafeZone={showSafeZone} />
  </AbsoluteFill>
);
export const Episode01VerticalPreview: React.FC = () => (
  <AbsoluteFill>
    <Episode01Vertical />
    <BilingualSubtitles cues={cues} />
  </AbsoluteFill>
);
/** One subtitle cue at full opacity on a transparent frame (used by the subtitle burner; works in both formats). */
export const BilingualCueStill: React.FC<{en: string; ar: string; scrim?: boolean}> = ({en, ar, scrim}) => (
  <BilingualSubtitles cues={[{from: -1000, to: 100000, en, ar, scrim}]} />
);
