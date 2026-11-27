/**
 * DEEPLY ROOTED — Episode 01 · "When Life Doesn't Go as Planned"
 * Picture + sound (clean master). Bilingual subtitles are burned in afterwards from the same cue data
 * (see Episode01Preview for an in-Studio view with subtitles). Plan: docs/episode01/EP01_PLAN.md
 */
import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {loadFont} from '@remotion/fonts';
import arabic500 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2';
import {clamp, ease, lerp, ramp} from '../engine/anim';
import {ensureFonts, TITLE_FONT} from '../post/fonts';
import {blendPose, POSES, StickPose} from '../stickman/Stickman';
import {BilingualSubtitles} from '../subtitles/BilingualSubtitles';
import {BilingualCue} from '../subtitles/style';
import timed from '../data/subtitles/ep01.timed.json';
import {breathe, Cam, DriftLight, frontWalkPose, GlowFigure, lampLevel, lampSwitch, STAND_BACK, STRIDE, TimelineRuler, Tree, Roots, walkPose} from './kit';
import {aimCam, Hill, hillY, LakeMedium, LakeWide, pathAt, pathU, Plain, plainCam, ROAD_FEET_Y, RoadSide, Trav} from './sets';
import {cut, EP_FRAMES, FPS, fr, pe, ps, SEGMENTS, speaking, VOICE, word} from './timing';

ensureFonts();
loadFont({family: 'DR Arabic', url: arabic500, weight: '500'});
export {EP_FRAMES};

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

// ------------------------------------------------------------------ the shot table
interface Shot {
  id: string;
  from: number;
  to: number;
  xIn?: number; // cross-dissolve frames from the previous shot
  bed: 'lake' | 'rain' | 'wind' | 'dawn' | 'none';
  render: (f: number, s: Shot) => React.ReactNode;
}

const T_PILOT = fr(5.3); // after "…Episode one"
const C_PILOT = fr(7.767); // the pilot's cut, in the pause after "…your life…"
const HERE = word(4, 'here');

// lake medium camera = the pilot's shot 1 framing
const pilotCam = (D: number, extra: Partial<Cam> = {}): Cam => ({ax: 1560, ay: 880, z: 1 + 0.07 * D, px: 24 * D, ...extra});
const HIM: [number, number] = [1600, 1168]; // his place at the end of the pier (pilot)
const SELF: [number, number] = [2290, 1180]; // the imagined self, standing on the water
const ROAD_SCALE = 2.3;
/** Road camera: keeps the walker at screen x `sx` (feet fixed on screen); zoom is anchored on him. */
const roadCam = (x: number, z = 1, sx = 760): Cam => ({ax: x, ay: ROAD_FEET_Y, z, px: x - sx / 0.75});

const S: Shot[] = [];
const add = (sh: Omit<Shot, 'to'> & {to?: number}) => S.push({...sh, to: sh.to ?? 0} as Shot);

// 1 · Title over the night lake (no figure yet)
add({id: '01 title', from: 0, bed: 'lake', render: (f, s) => {
  const t = ramp(f, s.from, s.to - s.from);
  const cam: Cam = {ax: 1560, ay: 560, z: 1.32 - 0.06 * t, py: -40 + 40 * t};
  return <LakeMedium f={f} cam={cam} time="night" lamp={flick(f)} skyOnly over={<TitleCard f={f} a={ps(0) - 6} b={s.to - 4} />} />;
}});
// 2 · Pilot shot 1: "Have you ever looked at your life…"
add({id: '02 looked', from: T_PILOT, bed: 'lake', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from + 10, ease.inOutSine);
  const look = ramp(f, fr(6.136), 40, ease.inOutSine);
  const pose = breathe(f, blendPose(POSES.stand, HEAD_DOWN, look * 0.9));
  return <LakeMedium f={f} cam={pilotCam(D)} time="night" lamp={flick(f)}><Trav id="t02" pose={pose} feet={HIM} scale={3.55} light="lampNight" keyMul={flick(f)} /></LakeMedium>;
}});
// 3 · Pilot shot 2: "…and wondered how you ended up here?"
add({id: '03 here', from: C_PILOT, bed: 'lake', render: (f, s) => {
  const R = ramp(f, s.from, 110, ease.inOutSine);
  const turn = ramp(f, HERE - 12, 30, ease.inOutSine);
  return <LakeWide f={f} R={R} time="night" lamp={flick(f)}><Trav id="t03" pose={breathe(f, blendPose(BACK_DOWN, LOOK_BACK, turn))} feet={[1271, 603]} scale={0.42} light="lampWide" keyMul={flick(f)} facing={-1} /></LakeWide>;
}});
// 4 · "Not because…" → "…a different version of yourself by now." The imagined self appears on the water.
add({id: '04 imagined', from: cut(5), bed: 'lake', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const lift = ramp(f, ps(8), 30);
  const toSelf = ramp(f, ps(10) + 10, 40);
  const pose = breathe(f, blendPose(blendPose(POSES.stand, HEAD_DOWN, 0.9), {...POSES.stand, headTilt: -4 - 4 * toSelf}, lift));
  const selfIn = ramp(f, ps(10), 45);
  return (
    <LakeMedium f={f} cam={{ax: 1700, ay: 900, z: 1.0 + 0.05 * D, px: 30 * D}} time="night" lamp={flick(f)}>
      <GlowFigure id="self04" f={f} pose={breathe(f, STAND_TALL, 0.5)} feet={SELF} scale={3.3} opacity={selfIn * 0.9} />
      <Trav id="t04" pose={pose} feet={HIM} scale={3.55} light="lampNight" keyMul={flick(f)} />
    </LakeMedium>
  );
}});
// 5 · "Maybe you thought you'd be happier…" → "…make sense." The people who were beside him, and are not.
add({id: '05 beside', from: cut(11), bed: 'lake', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const ghosts = Math.min(ramp(f, ps(14), 24), 1 - ramp(f, pe(15) - 10, 40));
  const down = ramp(f, ps(15), 40);
  const pose = breathe(f, blendPose({...POSES.stand, headTilt: -6}, HEAD_DOWN, down));
  return (
    <LakeMedium f={f} cam={{ax: 1600, ay: 940, z: 1.05 + 0.07 * D, px: 10 * D}} time="night" lamp={flick(f)}>
      <GlowFigure id="self05" f={f} pose={breathe(f, STAND_TALL, 0.5)} feet={SELF} scale={3.3} opacity={0.9 - 0.25 * down} />
      {[[1330, 1152, 3.4, 1], [1780, 1172, 3.5, -1]].map(([x, y, sc, fc], i) => (
        <GlowFigure key={i} id={`g05-${i}`} f={f} tint="ghost" pose={breathe(f + i * 40, {...POSES.stand, headTilt: i === 1 ? -6 : 4})} feet={[x, y]} scale={sc} opacity={ghosts * 0.2} facing={fc as 1 | -1} />
      ))}
      <Trav id="t05" pose={pose} feet={HIM} scale={3.55} light="lampNight" keyMul={flick(f)} />
    </LakeMedium>
  );
}});
// 6 · "But life… had other plans." The lamp goes out.
add({id: '06 lamp out', from: cut(17), bed: 'lake', render: (f) => {
  const lamp = lampSwitch(f, word(18, 'other'), 'off', 26) * flick(f);
  return <LakeWide f={f} R={1} time="night" lamp={lamp}><Trav id="t06" pose={breathe(f, BACK_DOWN)} feet={[1271, 603]} scale={0.42} light="lampWide" keyMul={lamp} facing={-1} /></LakeWide>;
}});
// 7 · "And sometimes the hardest part…" — the imagined self dissolves into the mist.
add({id: '07 accept', from: cut(19), bed: 'lake', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const dis = ramp(f, ps(21), 75, ease.inOutSine);
  const down = ramp(f, ps(21) + 50, 40);
  return (
    <LakeMedium f={f} cam={{ax: 1800, ay: 920, z: 1.02 + 0.06 * D, px: 20 * D}} time="night" lamp={0}>
      <GlowFigure id="self07" f={f} pose={breathe(f, STAND_TALL, 0.5)} feet={SELF} scale={3.3} opacity={0.75} dissolve={dis} />
      <Trav id="t07" pose={breathe(f, blendPose({...POSES.stand, headTilt: -6}, HEAD_DOWN, down))} feet={HIM} scale={3.55} light="moon" />
    </LakeMedium>
  );
}});

// ---- Act II · the road at dusk (walking); world x continues across the road shots
const ROAD0 = cut(22);
const roadV = 243 / FPS; // plate px per frame: one stride cycle per 1.1 s at scale 2.3
// 8 · "But what if you're not falling behind?…"
add({id: '08 walk', from: ROAD0, xIn: 24, bed: 'wind', render: (f) => {
  const x = 1000 + walked(ROAD0, f, () => roadV);
  return <RoadSide f={f} cam={roadCam(x, 1.0, 760)} time="dusk"><Trav id="t08" pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDusk" /></RoadSide>;
}});
// 9 · "…invisible timelines." The ruler of 'should' across the land; a tick lights on each "I should…".
const C24 = cut(24);
add({id: '09 timeline', from: C24, bed: 'wind', render: (f, s) => {
  const x = 1000 + walked(ROAD0, f, () => roadV);
  const cam = roadCam(x, 1.0, 620);
  const litAt = [ps(25), ps(26), ps(27), ps(28)];
  // ticks light ahead of him: fixed points on the meadow plane, placed where they will be seen
  const lit: [number, number][] = litAt.map((t, i) => {
    const xw = 1000 + walked(ROAD0, t, () => roadV);
    const c = roadCam(xw, 1.0, 620);
    const plateX = (1350 + i * 110) / 0.75 + c.px! * 0.45; // a tick that sits at screen x≈1350+ when it lights (meadow plane, k = 0.45)
    return [Math.round(plateX / 140) * 140, t];
  });
  const on = ramp(f, ps(24) + 30, 40) * (1 - ramp(f, s.to - 20, 20));
  return (
    <RoadSide f={f} cam={cam} time="dusk" midChildren={<TimelineRuler y={590} x0={cam.px! * 0.45 - 500} x1={cam.px! * 0.45 + 3500} spacing={140} lit={lit} f={f} opacity={on} />}>
      <Trav id="t09" pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDusk" />
    </RoadSide>
  );
}});
// 10 · "…a race against a version of ourselves that doesn't even exist." He hurries after the imagined self; it dissolves; he stops.
const C29 = cut(29);
add({id: '10 race', from: C29, bed: 'wind', render: (f, s) => {
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
      <GlowFigure id="self10" f={f} pose={walkPose(selfX / (STRIDE * ROAD_SCALE), 2)} feet={[selfX, ROAD_FEET_Y - 4]} scale={ROAD_SCALE} opacity={selfIn * 0.85} dissolve={dis} />
      <Trav id="t10" pose={pose} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDusk" />
    </RoadSide>
  );
}});
// 11 · "We forget that people grow differently…" — many travellers, many paces, on many paths.
const C31 = cut(31);
// other travellers: start height on their path (plate y) and pace (plate px per frame up the path)
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
const Others: React.FC<{f: number; t0: number}> = ({f, t0}) => (
  <>
    {TRAVELLERS.map((t, i) => {
      const u = pathU(t.path, t.y0 - t.vy * (f - t0));
      const [x, y, sc] = pathAt(t.path, u);
      const pose = t.kind === 'sit' ? POSES.sitRock : t.kind === 'stand' ? breathe(f + i * 30, STAND_BACK) : frontWalkPose((f - t0) / 33 + i * 0.37);
      const fig = (dx: number, k: string) => <Trav key={k} id={`o${i}${k}`} pose={pose} feet={[x + dx, y]} scale={sc} light="plainDusk" opacity={0.92} />;
      return t.kind === 'pair' ? [fig(-22 * sc, 'a'), fig(22 * sc, 'b')] : fig(0, 'a');
    })}
  </>
);
const MY_U0 = pathU(2, 1150);
add({id: '11 paths', from: C31, xIn: 20, bed: 'wind', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const [x, y, sc] = pathAt(2, MY_U0);
  return (
    <Plain f={f} cam={plainCam(1.3 - 0.08 * D, 1290)} time="dusk">
      <Others f={f} t0={C31} />
      <Trav id="t11" pose={breathe(f, STAND_BACK)} feet={[x, y]} scale={sc} light="plainDusk" />
    </Plain>
  );
}});
// 12 · "There is no universal timeline…" — the camera rises; he begins walking his own path at his own pace.
const C40 = cut(40);
add({id: '12 own pace', from: C40, bed: 'wind', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from, ease.inOutSine);
  const go = ramp(f, ps(41), 30);
  const u = pathU(2, 1150 - walked(ps(41), f, (t) => 0.09 * ramp(t, ps(41), 30)));
  const [x, y, sc] = pathAt(2, u);
  return (
    <Plain f={f} cam={plainCam(1.22 - 0.22 * D, 1290)} time="dusk">
      <Others f={f} t0={C31} />
      <Trav id="t12" pose={go > 0.02 ? blendPose(STAND_BACK, frontWalkPose((f - ps(41)) / 36), go) : breathe(f, STAND_BACK)} feet={[x, y]} scale={sc} light="plainDusk" />
    </Plain>
  );
}});
// 13 · "So please, stop treating your life like a deadline…" — he stops, and breathes.
const C42 = cut(42);
add({id: '13 breathe', from: C42, xIn: 16, bed: 'wind', render: (f, s) => {
  const stopAt = word(43, 'stop');
  const v = (t: number) => roadV * 0.8 * (1 - ramp(t, stopAt, 30));
  const x = 3000 + walked(C42, f, v);
  const moving = 1 - ramp(f, stopAt, 30);
  const tall = ramp(f, ps(44), 40);
  const pose = moving > 0.02 ? blendPose(POSES.stand, walkPose(x / (STRIDE * ROAD_SCALE)), moving) : breathe(f, blendPose(POSES.stand, STAND_TALL, tall), 1.3);
  const D = ramp(f, stopAt, s.to - stopAt, ease.inOutSine);
  return (
    <RoadSide f={f} cam={roadCam(x, 1.0 + 0.3 * D, 860)} time="dusk">
      <Trav id="t13" pose={pose} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDusk" />
    </RoadSide>
  );
}});

// ---- Act III · night, rain, the lamp out
// 14 · "And then, there are the things we never wanted to lose…" — small lights leave his hands and drift away.
add({id: '14 losses', from: cut(46), xIn: 30, bed: 'rain', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const starts = [ps(48), ps(49), word(49, 'dream'), ps(50)];
  const hand: [number, number] = [HIM[0] + 70, HIM[1] - 300];
  return (
    <LakeMedium f={f} cam={{ax: 1750, ay: 900, z: 1.04 + 0.04 * D, px: 15 * D}} time="night" lamp={0} rain={0.85}>
      {starts.map((t, i) => <DriftLight key={i} f={f} start={t - 4} from={[hand[0] + i * 6, hand[1] + i * 10]} to={[2350 + i * 70, 760 - i * 30]} size={13} dur={170} />)}
      <Trav id="t14" pose={breathe(f, {...POSES.stand, headTilt: -2, armR: [24, 30]})} feet={HIM} scale={3.55} light="moon" />
    </LakeMedium>
  );
}});
// 15 · "Losing something you truly wanted hurts…" — he sits, knees drawn in, in the rain.
add({id: '15 sit', from: cut(51), bed: 'rain', render: (f, s) => {
  const sit = ramp(f, s.from + 6, 46, ease.inOutSine);
  const D = ramp(f, s.from, s.to - s.from);
  return (
    <LakeMedium f={f} cam={{ax: 1600, ay: 1000, z: 1.18 + 0.06 * D}} time="night" lamp={0} rain={0.85}>
      <Trav id="t15" pose={breathe(f, blendPose(POSES.stand, SIT, sit), 0.6)} feet={HIM} scale={3.55} light="moon" />
    </LakeMedium>
  );
}});
// 16 · "Sometimes you just need to sit with the feeling…" — the held wide; a small seated figure in the rain.
add({id: '16 hold', from: cut(54), bed: 'rain', render: (f, s) => (
  <LakeWide f={f} R={1} time="night" lamp={0} rain={0.8 - 0.3 * ramp(f, s.to - 60, 60)}>
    <Trav id="t16" pose={breathe(f, {...SIT, lean: 30}, 0.5)} feet={[1271, 603]} scale={0.42} light="lampWide" keyMul={0} facing={-1} />
  </LakeWide>
)});

// ---- Act IV · courage to begin again (the light returns; pre-dawn → dawn)
// 17 · "But don't let one painful chapter…" — the rain stops, the lamp relights; he lifts his head and stands.
add({id: '17 relight', from: cut(59), bed: 'lake', render: (f, s) => {
  const lampAt = word(59, 'story');
  const lamp = lampSwitch(f, lampAt, 'on', 30) * flick(f);
  const lift = ramp(f, ps(60), 40);
  const up = ramp(f, ps(61), 60, ease.inOutSine);
  const sitLift = blendPose(SIT, {...SIT, headTilt: -10, headDrop: 0, lean: 18}, lift);
  const D = ramp(f, s.from, s.to - s.from);
  return (
    <LakeMedium f={f} cam={{ax: 1600, ay: 960, z: 1.12 - 0.08 * D}} time="night" lamp={lamp} rain={0.6 * (1 - ramp(f, s.from, 70))}>
      <Trav id="t17" pose={breathe(f, blendPose(sitLift, {...POSES.stand, headTilt: -6}, up), 0.8)} feet={HIM} scale={3.55} light={lamp > 0.05 ? 'lampNight' : 'moon'} keyMul={lamp} />
    </LakeMedium>
  );
}});
// 18 · "Sometimes, the most important growth happens quietly…" — under the hill, roots grow in the dark.
const TREE_X = 1450;
add({id: '18 roots', from: cut(63), xIn: 30, bed: 'wind', render: (f, s) => {
  const g = ramp(f, s.from, s.to - s.from + 40, ease.inOutSine);
  return (
    <Hill f={f} cam={{ax: 1450, ay: 920, z: 1.55 - 0.1 * g}} time="predawn" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.0} grow={0.08 + 0.62 * g} glow={0.25 * g} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={0.9} grow={0.22} />
    </Hill>
  );
}});
// 19 · "When there are no achievements…" → "That matters too." — he kneels by the sapling, and gets up.
add({id: '19 get up', from: cut(66), bed: 'wind', render: (f, s) => {
  const upAt = word(67, 'get') - 6;
  const up = ramp(f, upAt, 45, ease.inOutSine);
  const myX = 1300;
  return (
    <Hill f={f} cam={{ax: 1400, ay: 840, z: 1.18}} time="predawn" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.0} grow={0.7 + 0.1 * ramp(f, s.from, s.to - s.from)} glow={0.25} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={0.9} grow={0.22} />
      <Trav id="t19" pose={breathe(f, blendPose(KNEEL, {...POSES.stand, headTilt: -4}, up), 0.7)} feet={[myX, hillY(myX) + 3]} scale={2.1} light="hillPre" />
    </Hill>
  );
}});
// 20 · "Maybe you need to hear this today… You are allowed…" — at dawn he walks back along the pier toward us.
const C70 = cut(70);
add({id: '20 allowed', from: C70, xIn: 30, bed: 'dawn', render: (f, s) => {
  const t = clamp((f - (C70 + 20)) / (s.to - C70 - 20));
  const tw = 0.03 * t; // world progress along the pier (the pilot plate's own perspective)
  const tt = (1 - 1 / (1 + 22 * tw)) / (1 - 1 / 23);
  const y = 600 + (1480 - 600) * tt;
  const sc = 0.42 * (44 + 996 * tt) / 44;
  const walking = f > C70 + 20 && t < 1;
  const pose = walking ? frontWalkPose((f - C70) / 34) : breathe(f, STAND_BACK);
  return (
    <LakeWide f={f} R={1} time="dawn" lamp={0.35 * flick(f)}>
      <Trav id="t20" pose={pose} feet={[1280, y + 3]} scale={sc} light="dawnWide" />
    </LakeWide>
  );
}});
// 21 · "Don't underestimate the quiet courage…" — walking on, at dawn.
const ROAD2 = cut(77);
add({id: '21 courage', from: ROAD2, xIn: 24, bed: 'wind', render: (f) => {
  const x = 2000 + walked(ROAD2, f, () => roadV);
  return <RoadSide f={f} cam={roadCam(x, 1.0, 700)} time="dawn"><Trav id="t21" pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDawn" /></RoadSide>;
}});
// 22 · "Sometimes it's choosing peace…" — closer, still walking.
add({id: '22 pages', from: cut(80), bed: 'wind', render: (f, s) => {
  const x = 2000 + walked(ROAD2, f, () => roadV);
  const D = ramp(f, s.from, s.to - s.from);
  return <RoadSide f={f} cam={roadCam(x, 1.35 + 0.05 * D, 880)} time="dawn"><Trav id="t22" pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDawn" /></RoadSide>;
}});

// ---- Act V · faith and the bigger picture (dawn)
// 23 · "And perhaps there is another way to look at all of this…" — he opens his hand; a small light floats free.
add({id: '23 let go', from: cut(84), xIn: 24, bed: 'wind', render: (f, s) => {
  const openAt = word(86, 'loosen') - 4;
  const open = ramp(f, openAt, 30);
  const myX = 1290;
  const feet: [number, number] = [myX, hillY(myX) + 3];
  return (
    <Hill f={f} cam={{ax: 1380, ay: 800, z: 1.25 + 0.04 * ramp(f, s.from, s.to - s.from)}} time="dawn" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.0} grow={0.82} glow={0.15} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={0.9} grow={0.42} sway={Math.sin(f / 50) * 2} />
      <Trav id="t23" pose={breathe(f, blendPose({...POSES.stand, armR: [40, 70]}, {...POSES.letGo, armR: [70, 8]}, open))} feet={feet} scale={2.1} light="hillDawn" />
      <DriftLight f={f} start={openAt + 18} from={[feet[0] + 120, feet[1] - 230]} to={[feet[0] + 700, feet[1] - 650]} size={6} dur={150} />
    </Hill>
  );
}});
// 24 · The verse — the sky at first light, nothing else.
add({id: '24 verse', from: cut(87), xIn: 36, bed: 'dawn', render: (f, s) => {
  const t = ramp(f, s.from, s.to - s.from, ease.inOutSine);
  return <LakeMedium f={f} cam={{ax: 1700, ay: 640, z: 1.18 - 0.05 * t, py: 30 - 110 * t}} time="dawn" lamp={0} skyOnly />;
}});
// 25 · "Think about that for a moment…" — he looks back along the winding path behind him.
const C91 = cut(91);
const LOOK_U = pathU(2, 1150);
const BIG = 1.25; // the Traveller a touch larger in the plain close shots, so his gesture reads
add({id: '25 look back', from: C91, xIn: 24, bed: 'wind', render: (f, s) => {
  const [x, y, sc] = pathAt(2, LOOK_U);
  const back = ramp(f, ps(93), 40);
  const D = ramp(f, s.from, s.to - s.from);
  return (
    <Plain f={f} cam={aimCam(x, y, 1.8 - 0.1 * D, 960, 790)} time="dawn">
      <Trav id="t25" pose={breathe(f, blendPose(STAND_BACK, LOOK_BACK, back))} feet={[x, y]} scale={sc * BIG} light="plainDawn" facing={-1} />
    </Plain>
  );
}});
// 26 · "We see a moment. God knows the whole picture." — from close on him to the whole land.
add({id: '26 whole picture', from: cut(95), bed: 'wind', render: (f, s) => {
  const [x, y, sc] = pathAt(2, LOOK_U);
  const out = ramp(f, ps(99) - 6, 80, ease.inOutCubic);
  const a = aimCam(x, y, 2.0, 960, 790), b = plainCam(1.0, 1280);
  return (
    <Plain f={f} cam={{ax: lerp(a.ax, b.ax, out), ay: lerp(a.ay, b.ay, out), z: lerp(a.z, b.z, out), px: lerp(a.px!, b.px!, out), py: lerp(a.py!, b.py!, out)}} time="dawn">
      <Trav id="t26" pose={breathe(f, STAND_BACK)} feet={[x, y]} scale={sc * lerp(BIG, 1, out)} light="plainDawn" />
    </Plain>
  );
}});
// 27 · "And sometimes faith means taking the next step even when you cannot see the entire road."
const C100 = cut(100);
add({id: '27 next step', from: C100, xIn: 20, bed: 'wind', render: (f) => {
  const stepAt = word(100, 'taking') - 4;
  const v = (t: number) => roadV * 0.85 * ramp(t, stepAt, 20);
  const x = 5000 + walked(C100, f, v);
  const moving = ramp(f, stepAt, 20);
  const pose = moving > 0.02 ? blendPose(POSES.stand, walkPose((x - 5000) / (STRIDE * ROAD_SCALE)), moving) : breathe(f, POSES.stand);
  return <RoadSide f={f} cam={roadCam(5000, 1.0, 640)} time="dawn" fog={0.9}><Trav id="t27" pose={pose} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDawn" /></RoadSide>;
}});

// ---- Act VI · the story is still unfolding (sunrise → morning)
// 28 · "So, if life doesn't look the way you planned, take a breath…" — the opening place, now at sunrise.
add({id: '28 sunrise', from: cut(102), xIn: 30, bed: 'dawn', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from);
  const tall = ramp(f, ps(104), 45);
  return (
    <LakeMedium f={f} cam={pilotCam(D * 0.8)} time="dawn" lamp={0.3 * flick(f)}>
      <Trav id="t28" pose={breathe(f, blendPose({...POSES.stand, headTilt: -4}, STAND_TALL, tall), 1.3)} feet={HIM} scale={3.55} light="dawnLake" />
    </LakeMedium>
  );
}});
// 29 · "Keep growing. Keep learning. Keep becoming…" — the tree has grown; the roots glow.
add({id: '29 keep growing', from: cut(108), xIn: 24, bed: 'wind', render: (f, s) => {
  const grow = 0.55 + 0.12 * ramp(f, ps(108), 30) + 0.12 * ramp(f, ps(109), 30) + 0.12 * ramp(f, ps(110), 30);
  const glow = ramp(f, ps(108), 90);
  const myX = 1270;
  return (
    <Hill f={f} cam={{ax: 1420, ay: 880, z: 1.1 + 0.04 * ramp(f, s.from, s.to - s.from)}} time="morning" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.05} grow={0.9} glow={0.7 * glow} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={1.15} grow={grow} sway={Math.sin(f / 45) * 2} />
      <Trav id="t29" pose={breathe(f, {...POSES.stand, headTilt: -14})} feet={[myX, hillY(myX) + 3]} scale={2.1} light="hillMorning" />
    </Hill>
  );
}});
// 30 · "Because life isn't only about reaching…" — his imagined self walks beside him, then becomes him.
const ROAD3 = cut(112);
add({id: '30 together', from: ROAD3, xIn: 24, bed: 'wind', render: (f) => {
  const x = 7000 + walked(ROAD3, f, () => roadV);
  const merge = ramp(f, word(113, 'become') - 10, 50, ease.inOutSine);
  const selfX = x + 150 * (1 - merge);
  const warm = Math.min(ramp(f, word(113, 'become') + 30, 15), 1 - ramp(f, word(113, 'become') + 50, 40));
  return (
    <RoadSide f={f} cam={roadCam(x, 1.08, 760)} time="dawn">
      <GlowFigure id="self30" f={f} pose={walkPose(x / (STRIDE * ROAD_SCALE) + 0.03, 2)} feet={[selfX, ROAD_FEET_Y - 3]} scale={ROAD_SCALE} opacity={(1 - merge * merge) * 0.8 * ramp(f, ROAD3, 20)} />
      <Trav id="t30" pose={walkPose(x / (STRIDE * ROAD_SCALE))} feet={[x, ROAD_FEET_Y]} scale={ROAD_SCALE} light="roadDawn" keyMul={1 + warm * 0.6} />
    </RoadSide>
  );
}});
// 31 · "And wherever you are right now…" — he walks his own path toward the sunrise.
const C115 = cut(115);
add({id: '31 unfolding', from: C115, xIn: 24, bed: 'wind', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from, ease.inOutSine);
  const u = pathU(2, 1180 - 0.1 * (f - C115));
  const [x, y, sc] = pathAt(2, u);
  return (
    <Plain f={f} cam={plainCam(1.45 - 0.4 * D, 1300)} time="dawn">
      <Trav id="t31" pose={frontWalkPose((f - C115) / 36)} feet={[x, y]} scale={sc} light="plainDawn" />
    </Plain>
  );
}});
// 32 · "This is Deeply Rooted…" — the tree, the roots, the end card.
add({id: '32 outro', from: cut(119), xIn: 30, bed: 'wind', render: (f, s) => {
  const D = ramp(f, s.from, s.to - s.from, ease.inOutSine);
  const myX = 1280;
  return (
    <Hill f={f} cam={{ax: 1420, ay: 860, z: 1.22 - 0.16 * D}} time="morning" under={<Roots x={TREE_X} y={hillY(TREE_X) + 8} size={1.05} grow={0.95} glow={0.7} />}>
      <Tree x={TREE_X} y={hillY(TREE_X) + 2} size={1.15} grow={0.92} sway={Math.sin(f / 45) * 2} />
      <Trav id="t32" pose={breathe(f, {...POSES.sitRock, headTilt: -8}, 0.6)} feet={[myX, hillY(myX) + 3]} scale={2.1} light="hillMorning" />
    </Hill>
  );
}});
for (let i = 0; i < S.length; i++) S[i].to = i + 1 < S.length ? S[i + 1].from : EP_FRAMES;
export const SHOTS = S;

// ------------------------------------------------------------------ title / end cards
const TitleCard: React.FC<{f: number; a: number; b: number}> = ({f, a, b}) => {
  const o = Math.min(ramp(f, a, 24), 1 - ramp(f, b - 20, 20));
  if (o <= 0) return null;
  const rise = (1 - ease.outCubic(clamp((f - a) / 60))) * 10;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: o, transform: `translateY(${rise - 40}px)`}}>
      <div style={{fontFamily: TITLE_FONT, fontWeight: 600, fontSize: 82, color: '#F4EFE6', letterSpacing: 0.5, textShadow: '0 2px 18px rgba(0,0,0,0.5)'}}>When Life Doesn't Go as Planned</div>
      <div lang="ar" dir="rtl" style={{fontFamily: '"DR Arabic", "IBM Plex Sans Arabic", sans-serif', fontWeight: 500, fontSize: 52, color: '#F4EFE6', marginTop: 10, textShadow: '0 2px 14px rgba(0,0,0,0.5)'}}>حين لا تسير الحياة كما خطّطنا</div>
      <div style={{fontFamily: TITLE_FONT, fontWeight: 600, fontSize: 26, color: '#E6D7BD', letterSpacing: 8, marginTop: 34, opacity: Math.min(1, ramp(f, ps(1) - 6, 20) * 1)}}>DEEPLY ROOTED · EPISODE 01</div>
      <div lang="ar" dir="rtl" style={{fontFamily: '"DR Arabic", "IBM Plex Sans Arabic", sans-serif', fontWeight: 500, fontSize: 26, color: '#E6D7BD', marginTop: 8, opacity: ramp(f, ps(2) - 6, 20)}}>الحلقة الأولى</div>
    </AbsoluteFill>
  );
};
const EndCard: React.FC<{f: number}> = ({f}) => {
  const a = pe(124) + 20;
  const o = ramp(f, a, 40);
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', opacity: o}}>
      <div style={{fontFamily: TITLE_FONT, fontWeight: 600, fontSize: 96, color: '#F7F1E6', letterSpacing: 2, textShadow: '0 2px 22px rgba(0,0,0,0.45)', transform: 'translateY(-150px)'}}>Deeply Rooted</div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ sound
const BEDS: Record<Exclude<Shot['bed'], 'none'>, {src: string; vol: number}> = {
  lake: {src: 'audio/pilot01/amb_lake_night.wav', vol: 0.21},
  rain: {src: 'audio/ep01/amb_rain.wav', vol: 0.17},
  wind: {src: 'audio/ep01/amb_wind.wav', vol: 0.24},
  dawn: {src: 'audio/ep01/amb_dawn_lake.wav', vol: 0.26},
};
const bedRuns = () => {
  const runs: {bed: Exclude<Shot['bed'], 'none'>; from: number; to: number}[] = [];
  for (const s of S) {
    if (s.bed === 'none') continue;
    const last = runs[runs.length - 1];
    if (last && last.bed === s.bed && last.to === s.from) last.to = s.to;
    else runs.push({bed: s.bed, from: s.from, to: s.to});
  }
  return runs;
};
const Soundtrack: React.FC = () => {
  const XF = 30;
  return (
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
      {bedRuns().map((r, i) => {
        const from = Math.max(0, r.from - XF / 2);
        const dur = Math.min(EP_FRAMES, r.to + XF / 2) - from;
        const B = BEDS[r.bed];
        return (
          <Sequence key={`bed${i}`} from={from} durationInFrames={dur} name={`Ambience · ${r.bed}`} layout="none">
            <Audio
              src={staticFile(B.src)}
              loop
              volume={(fr_) => {
                const g = from + fr_;
                const edge = clamp(fr_ / XF) * clamp((dur - fr_) / XF);
                return B.vol * edge * (speaking(g) ? 0.75 : 1) * (g < 20 ? g / 20 : 1) * clamp((EP_FRAMES - g) / 60);
              }}
            />
          </Sequence>
        );
      })}
    </>
  );
};

// ------------------------------------------------------------------ the film
export const Episode01: React.FC = () => {
  const f = useCurrentFrame();
  const i = S.findIndex((s) => f >= s.from && f < s.to);
  const cur = S[i];
  const layers: React.ReactNode[] = [<AbsoluteFill key={cur.id}>{cur.render(f, cur)}</AbsoluteFill>];
  if (cur.xIn && i > 0 && f < cur.from + cur.xIn) {
    // cross-dissolve: the previous shot continues underneath while this one fades in
    const prev = S[i - 1];
    layers.unshift(<AbsoluteFill key={prev.id}>{prev.render(f, prev)}</AbsoluteFill>);
    layers[1] = <AbsoluteFill key={cur.id} style={{opacity: ease.inOutSine(clamp((f - cur.from) / cur.xIn))}}>{cur.render(f, cur)}</AbsoluteFill>;
  }
  const fadeIn = 1 - ramp(f, 0, 20);
  const fadeOut = ramp(f, EP_FRAMES - 45, 45);
  return (
    <AbsoluteFill style={{background: '#06090F'}}>
      {layers}
      <EndCard f={f} />
      <AbsoluteFill style={{background: '#06090F', opacity: Math.max(fadeIn, fadeOut)}} />
      <Soundtrack />
    </AbsoluteFill>
  );
};

/** Studio preview with the burned-in bilingual subtitles (the render pipeline burns them in post instead). */
const cues = (timed.cues as (BilingualCue & {burn?: boolean})[]).filter((c) => c.burn !== false);
export const Episode01Preview: React.FC<{showSafeZone?: boolean}> = ({showSafeZone = false}) => (
  <AbsoluteFill>
    <Episode01 />
    <BilingualSubtitles cues={cues} showSafeZone={showSafeZone} />
  </AbsoluteFill>
);
/** One subtitle cue at full opacity on a transparent frame (used by the subtitle burner). */
export const BilingualCueStill: React.FC<{en: string; ar: string; scrim?: boolean}> = ({en, ar, scrim}) => (
  <BilingualSubtitles cues={[{from: -1000, to: 100000, en, ar, scrim}]} />
);
