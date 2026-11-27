/**
 * Episode 01 sets: four painted environments, each a reusable component with a camera, a time of day
 * and the figures/effects of the shot. The night lake set is exactly the approved Pilot 01 world.
 */
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {clamp} from '../engine/anim';
import {noise1} from '../engine/noise';
import {StickPose} from '../stickman/Stickman';
import hillData from '../data/episode01/hill_surface.json';
import plainData from '../data/episode01/plain_paths.json';
import {Cam, K, Light, LitFigure, PlaneSvg, Plate, plate, Rain, SUN_WARM} from './kit';

// ------------------------------------------------------------------ lighting presets (scaled to the figure)
type Preset = Omit<Light, 'keyOff' | 'rim'> & {shadow: string; shadowOpacity: number};
export const LIGHTS: Record<string, Preset> = {
  lampNight: {pos: [1948, 365], r: 1150, dir: [0.55, -0.84], key: 0.95, amb: [0.35, 0.37, 0.44], shadow: 'matrix(1 0 0.8 -0.3 0 0)', shadowOpacity: 0.55},
  moon: {pos: [0, 0], r: 1, dir: [-0.45, -0.89], key: 0, amb: [0.3, 0.33, 0.42], rimOpacity: 0.45, rimColor: '#C4D2E6', shadow: 'matrix(1 0 -0.35 -0.25 0 0)', shadowOpacity: 0.3},
  lampWide: {pos: [1298, 506], r: 200, dir: [0.38, -0.92], key: 0.6, amb: [0.28, 0.27, 0.28], rimOpacity: 0.6, shadow: 'matrix(1 0 0.12 -0.5 0 0)', shadowOpacity: 0.6},
  dawnLake: {pos: [2050, 628], r: 5000, dir: [0.86, -0.51], key: 0.7, amb: [0.6, 0.57, 0.62], warm: SUN_WARM, shadow: 'matrix(1 0 1.3 -0.16 0 0)', shadowOpacity: 0.45},
  dawnWide: {pos: [1900, 420], r: 5000, dir: [0.3, -0.95], key: 0.3, amb: [0.46, 0.44, 0.5], warm: SUN_WARM, rimOpacity: 0.85, shadow: 'matrix(1 0 -0.15 -0.45 0 0)', shadowOpacity: 0.5},
  roadDusk: {pos: [6000, 700], r: 20000, dir: [0.9, -0.43], key: 0.5, amb: [0.4, 0.38, 0.48], rimColor: '#F6B98C', shadow: 'matrix(1 0 -1.4 -0.14 0 0)', shadowOpacity: 0.4},
  roadDawn: {pos: [-6000, 700], r: 20000, dir: [-0.85, -0.5], key: 0.45, amb: [0.62, 0.6, 0.64], warm: SUN_WARM, shadow: 'matrix(1 0 1.3 -0.15 0 0)', shadowOpacity: 0.4},
  plainDusk: {pos: [1500, 0], r: 20000, dir: [0.25, -0.97], key: 0.35, amb: [0.58, 0.55, 0.62], rimColor: '#F2B08A', shadow: 'matrix(1 0 -0.2 -0.35 0 0)', shadowOpacity: 0.35},
  plainDawn: {pos: [1100, 0], r: 20000, dir: [-0.15, -0.99], key: 0.45, amb: [0.7, 0.68, 0.7], warm: SUN_WARM, shadow: 'matrix(1 0 0.15 -0.35 0 0)', shadowOpacity: 0.35},
  hillPre: {pos: [6000, 820], r: 20000, dir: [0.95, -0.3], key: 0.25, amb: [0.34, 0.36, 0.46], rimColor: '#D9AE9A', shadow: 'matrix(1 0 -1.2 -0.15 0 0)', shadowOpacity: 0.3},
  hillDawn: {pos: [6000, 800], r: 20000, dir: [0.95, -0.3], key: 0.65, amb: [0.58, 0.56, 0.62], warm: SUN_WARM, shadow: 'matrix(1 0 -1.3 -0.15 0 0)', shadowOpacity: 0.4},
  hillMorning: {pos: [6000, -2000], r: 30000, dir: [0.7, -0.71], key: 0.55, amb: [0.72, 0.72, 0.72], warm: SUN_WARM, shadow: 'matrix(1 0 -0.9 -0.3 0 0)', shadowOpacity: 0.4},
};

/** The Traveller in a set: lighting widths scale with his size, like the pilot's tuned values. */
export const Trav: React.FC<{
  id: string;
  pose: StickPose;
  feet: [number, number];
  scale: number;
  light: keyof typeof LIGHTS | Preset;
  facing?: 1 | -1;
  shadeSide?: 1 | -1;
  keyMul?: number;
  opacity?: number;
}> = ({id, pose, feet, scale, light, facing = 1, shadeSide, keyMul = 1, opacity = 1}) => {
  const P = typeof light === 'string' ? LIGHTS[light] : light;
  const L: Light = {...P, key: P.key * keyMul, keyOff: 5.9 * scale, rim: Math.max(0.6, 0.73 * scale)};
  return (
    <LitFigure
      id={id}
      pose={pose}
      feet={feet}
      scale={scale}
      light={L}
      shadow={P.shadow}
      shadowOpacity={P.shadowOpacity}
      contact={[13 * scale, Math.max(1.5, 2.3 * scale)]}
      soft={Math.max(0.35, 0.25 * scale)}
      facing={facing}
      shadeSide={shadeSide ?? (P.dir[0] * facing > 0 ? -1 : 1)}
      opacity={opacity}
    />
  );
};

const Vignette: React.FC<{a?: number}> = ({a = 0.45}) => (
  <AbsoluteFill style={{background: `radial-gradient(ellipse 80% 75% at 50% 48%, rgba(0,0,0,0) 58%, rgba(6,9,15,${a}) 100%)`}} />
);

// ------------------------------------------------------------------ LAKE · medium (pilot shot 1 view)
export const LakeMedium: React.FC<{
  f: number;
  cam: Cam;
  time: 'night' | 'dawn';
  lamp: number; // 0 off … 1 on (already includes flicker)
  rain?: number;
  skyOnly?: boolean;
  children?: React.ReactNode; // figures etc., in pier-plane coordinates
  over?: React.ReactNode; // above the foreground (title cards etc.)
}> = ({f, cam, time, lamp, rain = 0, skyOnly = false, children, over}) => {
  const night = time === 'night';
  const pierFilter = night ? undefined : 'brightness(1.45) saturate(0.85) sepia(0.18)';
  const mistX = -f * 0.6;
  return (
    <AbsoluteFill style={{background: '#0B1018'}}>
      <Plate src={plate(night ? 'pilot01/s1_far.png' : 'ep01/lake1_dawn_far.png')} cam={cam} k={0.29} />
      <Plate src={plate(night ? 'pilot01/s1_mist.png' : 'ep01/lake1_dawn_mist.png')} cam={cam} k={0.5} dx={mistX % 2560} opacity={0.9} mirrorTile />
      {!skyOnly && (
        <>
          <Plate src={plate('pilot01/s1_pier.png')} cam={cam} k={1} filter={pierFilter} />
          <Plate src={plate('pilot01/s1_glow.png')} cam={cam} k={1} opacity={lamp * (night ? 1 : 0.55)} add />
          <PlaneSvg cam={cam}>
            {lamp < 0.98 && (
              <g opacity={(1 - lamp) * (night ? 1 : 0.6)}>
                <rect x={1929} y={338} width={38} height={54} fill="#1A1D23" />
                <ellipse cx={1840} cy={1165} rx={460} ry={110} fill="#0C1018" opacity={0.55} style={{filter: 'blur(30px)'}} />
                <rect x={1850} y={1290} width={140} height={150} fill="#0A0E16" opacity={0.6} style={{filter: 'blur(12px)'}} />
              </g>
            )}
            {children}
            {night && lamp > 0.3 &&
              [...Array(10)].map((_, i) => {
                const t = f / 30;
                const x = 1948 + 60 * Math.sin(t * (1.3 + i * 0.17) + i * 2.1) + 25 * noise1(t * 2 + i, 70);
                const y = 400 + 70 * Math.sin(t * (0.9 + i * 0.11) + i) + 20 * noise1(t * 2.5 + i, 71);
                return <circle key={i} cx={x} cy={y} r={2.2} fill="#FFE7B8" opacity={(0.35 + 0.4 * clamp(noise1(t * 4 + i, 72))) * lamp} />;
              })}
          </PlaneSvg>
          <Plate src={plate('pilot01/s1_fg.png')} cam={cam} k={1.43} blur={7} filter={pierFilter} />
        </>
      )}
      {!night && <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(255,214,170,0.10), rgba(255,200,150,0.04) 55%, rgba(0,0,0,0) 100%)', mixBlendMode: 'screen'}} />}
      <Rain f={f} amount={rain} />
      {rain > 0 && <AbsoluteFill style={{background: '#1B2433', opacity: 0.18 * rain, mixBlendMode: 'multiply'}} />}
      <Vignette a={night ? 0.45 : 0.3} />
      {over}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ LAKE · wide (pilot shot 2 view)
export const LakeWide: React.FC<{
  f: number;
  R: number; // crane-up/pull-back progress (pilot shot 2): 0 close … 1 full wide
  time: 'night' | 'dawn';
  lamp: number;
  rain?: number;
  children?: React.ReactNode;
}> = ({f, R, time, lamp, rain = 0, children}) => {
  const night = time === 'night';
  const ax = 1280, ay = 600;
  const cam = (g: number, py = 0): Cam => ({ax, ay, z: 1 + (1 - R) * g, py});
  // the pilot's per-layer vertical offsets (screen px) for the crane move, expressed as plate-space pans
  const mistX = -f * 0.73;
  const pierFilter = night ? undefined : 'brightness(1.35) saturate(0.85) sepia(0.15)';
  return (
    <AbsoluteFill style={{background: '#0B1018'}}>
      <Plate src={plate(night ? 'pilot01/s2_far.png' : 'ep01/lake2_dawn_far.png')} cam={cam(0.05, (8 * R) / K)} k={1} />
      <Plate src={plate(night ? 'pilot01/s2_mist.png' : 'ep01/lake2_dawn_mist.png')} cam={cam(0.08, (4 * R) / K)} k={1} dx={mistX % 2560} opacity={0.95} mirrorTile />
      <Plate src={plate('pilot01/s2_pier.png')} cam={cam(0.16, (-6 * R) / K)} k={1} filter={pierFilter} />
      <Plate src={plate('pilot01/s2_glow.png')} cam={cam(0.16, (-6 * R) / K)} k={1} opacity={lamp * (night ? 1 : 0.6)} add />
      <PlaneSvg cam={cam(0.16, (-6 * R) / K)}>
        {lamp < 0.98 && <rect x={1293} y={498} width={10} height={14} fill="#1A1D23" opacity={1 - lamp} />}
        {children}
      </PlaneSvg>
      <Plate src={plate('pilot01/s2_fg.png')} cam={cam(0.32, (-130 * R) / K)} k={1} blur={6} filter={night ? undefined : 'brightness(1.2) sepia(0.15)'} />
      {!night && <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(255,214,170,0.10), rgba(0,0,0,0) 60%)', mixBlendMode: 'screen'}} />}
      <Rain f={f} amount={rain} />
      {rain > 0 && <AbsoluteFill style={{background: '#1B2433', opacity: 0.18 * rain, mixBlendMode: 'multiply'}} />}
      <Vignette a={night ? 0.45 : 0.3} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ ROAD · side view (tracking walks)
export const ROAD_FEET_Y = 1158;
const ROAD_TILE = 2240;
const ROAD_GRADE: Record<string, {land: string; tint?: string; tintMode?: React.CSSProperties['mixBlendMode']; tintA?: number}> = {
  dusk: {land: 'brightness(0.6) saturate(0.8) hue-rotate(-10deg)', tint: 'linear-gradient(180deg, rgba(60,50,90,0) 40%, rgba(60,50,90,0.35) 100%)', tintMode: 'multiply', tintA: 1},
  dawn: {land: 'brightness(1.02) saturate(0.85) sepia(0.14)', tint: 'linear-gradient(180deg, rgba(255,215,170,0.12), rgba(0,0,0,0) 70%)', tintMode: 'screen', tintA: 1},
};
export const RoadSide: React.FC<{
  f: number;
  cam: Cam; // ay ≈ ROAD_FEET_Y keeps his feet fixed on screen
  time: 'dusk' | 'dawn';
  fog?: number; // 0…1: the road ahead (right) dissolves into fog
  children?: React.ReactNode; // ground-plane figures
  midChildren?: React.ReactNode; // drawn on the meadow plane (timeline)
}> = ({f, cam, time, fog = 0, children, midChildren}) => {
  const g = ROAD_GRADE[time];
  return (
    <AbsoluteFill style={{background: '#0B1018'}}>
      <Plate src={plate(`ep01/road_sky_${time}.png`)} cam={cam} k={0.05} mirrorTile />
      <Plate src={plate('ep01/road_mid.png')} cam={cam} k={0.45} tileWidth={ROAD_TILE} filter={g.land} />
      {midChildren && <PlaneSvg cam={cam} k={0.45}>{midChildren}</PlaneSvg>}
      <Plate src={plate('ep01/road_ground.png')} cam={cam} k={1} tileWidth={ROAD_TILE} filter={g.land} />
      <PlaneSvg cam={cam}>{children}</PlaneSvg>
      <Plate src={plate('ep01/road_fg.png')} cam={cam} k={1.6} tileWidth={ROAD_TILE} blur={6} filter={g.land + ' brightness(0.7)'} />
      {g.tint && <AbsoluteFill style={{background: g.tint, mixBlendMode: g.tintMode}} />}
      {fog > 0 && <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(240,226,206,0) 30%, rgba(240,226,206,0.85) 78%, rgba(244,232,214,0.97) 100%)', opacity: fog}} />}
      <Vignette a={time === 'dusk' ? 0.4 : 0.25} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ PLAIN · high wide (many paths)
export const Plain: React.FC<{f: number; cam: Cam; time: 'dusk' | 'dawn'; children?: React.ReactNode}> = ({cam, time, children}) => {
  const land = time === 'dusk' ? 'brightness(0.62) saturate(0.8) hue-rotate(-10deg)' : 'brightness(1.0) saturate(0.85) sepia(0.12)';
  return (
    <AbsoluteFill style={{background: '#0B1018'}}>
      <Plate src={plate(`ep01/plain_sky_${time}.png`)} cam={cam} k={0.15} mirrorTile />
      <Plate src={plate('ep01/plain_ground.png')} cam={cam} k={1} filter={land} />
      <PlaneSvg cam={cam}>{children}</PlaneSvg>
      <Plate src={plate('ep01/plain_fg.png')} cam={cam} k={1.8} blur={7} filter={land + ' brightness(0.7)'} />
      <AbsoluteFill
        style={{
          background: time === 'dusk' ? 'linear-gradient(180deg, rgba(60,50,90,0) 35%, rgba(60,50,90,0.35) 100%)' : 'linear-gradient(180deg, rgba(255,215,170,0.14), rgba(0,0,0,0) 60%)',
          mixBlendMode: time === 'dusk' ? 'multiply' : 'screen',
        }}
      />
      <Vignette a={0.32} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ HILL · side view with the underground cut
export const Hill: React.FC<{f: number; cam: Cam; time: 'predawn' | 'dawn' | 'morning'; children?: React.ReactNode; under?: React.ReactNode}> = ({cam, time, children, under}) => {
  const soil = time === 'predawn' ? 'brightness(0.62) saturate(0.8)' : time === 'dawn' ? 'brightness(0.92) sepia(0.1)' : 'brightness(1.0)';
  return (
    <AbsoluteFill style={{background: '#0B1018'}}>
      <Plate src={plate(`ep01/hill_sky_${time}.png`)} cam={cam} k={0.12} mirrorTile />
      <Plate src={plate('ep01/hill_ground.png')} cam={cam} k={1} filter={soil} />
      <PlaneSvg cam={cam}>
        {under}
        {children}
      </PlaneSvg>
      {time === 'predawn' && <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(40,40,80,0) 30%, rgba(30,30,60,0.3) 100%)', mixBlendMode: 'multiply'}} />}
      {time !== 'predawn' && <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(255,220,180,0.10), rgba(0,0,0,0) 60%)', mixBlendMode: 'screen'}} />}
      <Vignette a={0.3} />
    </AbsoluteFill>
  );
};

/** Surface height of the hill at plate x (from the painted plate's own data). */
export const hillY = (x: number) => {
  const s = hillData.surface, step = hillData.step;
  const i = clamp(x / step, 0, s.length - 1.001);
  const a = Math.floor(i);
  return s[a] + (s[a + 1] - s[a]) * (i - a);
};

/** Paths across the plain (from the painted plate's own data): position + walker scale at progress u (0 near … 1 horizon). */
export const pathAt = (p: number, u: number): [number, number, number] => {
  const pts = plainData.paths[p];
  const i = clamp(u, 0, 1) * (pts.length - 1.001);
  const a = Math.floor(i), t = i - a;
  const A = pts[a], B = pts[a + 1];
  const w = A[2] + (B[2] - A[2]) * t;
  return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, (w * 2.6) / 156]; // figures a little larger than life so they read
};
/** Progress u on path p where it crosses plate height y. */
export const pathU = (p: number, y: number) => {
  const pts = plainData.paths[p];
  for (let i = 0; i < pts.length - 1; i++) if (pts[i][1] >= y && pts[i + 1][1] < y) return (i + (pts[i][1] - y) / (pts[i][1] - pts[i + 1][1])) / (pts.length - 1.001);
  return 0;
};

/** Plain camera: zoom z, frame bottom on the plate bottom (shows the most sky), centred on plate x `cx`. */
export const plainCam = (z: number, cx = 1280): Cam => {
  const ay = 1000;
  const y0 = 1440 - 1440 / z; // top visible plate row when the frame bottom sits on the plate bottom
  const c = clamp(cx, 1280 / z, 2560 - 1280 / z); // never show past the plate's edges
  return {ax: c, ay, z, px: c - 1280, py: ay - (ay - y0) * z};
};
/** A camera that puts plate point (x, y) at screen (sx, sy) at zoom z. */
export const aimCam = (x: number, y: number, z: number, sx = 960, sy = 620): Cam => ({ax: x, ay: y, z, px: x - sx / K, py: y - sy / K});
