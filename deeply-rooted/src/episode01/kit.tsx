/**
 * DEEPLY ROOTED — reusable episode kit (built on the approved Pilot 01 techniques).
 * 2.5D plate camera, the scene-lit Traveller, walk cycles, and the small set of story effects.
 */
import React from 'react';
import {Img, staticFile} from 'remotion';
import {clamp, ease, ramp} from '../engine/anim';
import {hash, noise1} from '../engine/noise';
import {blendPose, POSES, Stickman, StickLook, StickPose} from '../stickman/Stickman';

export const K = 0.75; // plate (2560×1440) → frame (1920×1080)
export const PW = 2560;
export const PH = 1440;
export const plate = (n: string) => staticFile(`plates/${n}`);

// ------------------------------------------------------------------ camera
/** Camera: zoom about an anchor (plate px) plus a pan (plate px). Layers move with their depth factor k
 *  (0 = sky at infinity, 1 = the plane the Traveller stands on, >1 = foreground). */
export interface Cam {
  ax: number;
  ay: number;
  z: number;
  px?: number;
  py?: number;
}
export const camTransform = (c: Cam, k: number) => {
  const zl = 1 + (c.z - 1) * k;
  const ox = -(c.px ?? 0) * K * k;
  const oy = -(c.py ?? 0) * K * k;
  return {zl, tx: c.ax * K + ox, ty: c.ay * K + oy};
};
export const camCss = (c: Cam, k: number) => {
  const {zl, tx, ty} = camTransform(c, k);
  return `translate(${tx}px, ${ty}px) scale(${K * zl}) translate(${-c.ax}px, ${-c.ay}px)`;
};
export const camSvg = (c: Cam, k: number) => {
  const {zl, tx, ty} = camTransform(c, k);
  return `translate(${tx} ${ty}) scale(${K * zl}) translate(${-c.ax} ${-c.ay})`;
};
/** Screen position of a plate point seen on depth plane k (for staging checks / overlays). */
export const toScreen = (c: Cam, k: number, x: number, y: number) => {
  const {zl, tx, ty} = camTransform(c, k);
  return [tx + (x - c.ax) * K * zl, ty + (y - c.ay) * K * zl];
};

export const Plate: React.FC<{
  src: string;
  cam: Cam;
  k: number;
  blur?: number;
  opacity?: number;
  add?: boolean;
  filter?: string;
  dx?: number; // extra drift in plate px (mist)
  dy?: number;
  mirrorTile?: boolean; // mirrored copy on the right (drifting layers never show an edge)
  tileWidth?: number; // seamless strip: repeat it horizontally (road / grass strips)
}> = ({src, cam, k, blur = 0, opacity = 1, add = false, filter, dx = 0, dy = 0, mirrorTile = false, tileWidth}) => {
  const base = camCss(cam, k) + ` translate(${dx}px, ${dy}px)`;
  const st = (extra: string, w: number): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: w,
    height: PH,
    transformOrigin: '0 0',
    transform: base + extra,
    filter: [blur ? `blur(${blur}px)` : '', filter ?? ''].join(' ').trim() || undefined,
    opacity,
    mixBlendMode: add ? 'screen' : undefined,
  });
  if (tileWidth) {
    // which copies are on screen: plate x of the screen's left/right edges on this plane
    const {zl, tx} = camTransform(cam, k);
    const x0 = cam.ax + (0 - tx) / (K * zl) - dx;
    const x1 = cam.ax + (1920 - tx) / (K * zl) - dx;
    const n0 = Math.floor(x0 / tileWidth) - 1;
    const n1 = Math.ceil(x1 / tileWidth) + 1;
    const copies = [];
    // copies overlap by 1.5 px so sub-pixel placement never opens a hairline seam
    for (let n = n0; n <= n1; n++) copies.push(<Img key={n} src={src} style={st(` translate(${n * tileWidth - 0.75}px, 0px)`, tileWidth + 1.5)} />);
    return <>{copies}</>;
  }
  return (
    <>
      <Img src={src} style={st('', PW)} />
      {mirrorTile && <Img src={src} style={st(` translate(${2 * PW - 1.5}px, 0px) scale(-1, 1)`, PW)} />}
      {mirrorTile && <Img src={src} style={st(` translate(1.5px, 0px) scale(-1, 1)`, PW)} />}
    </>
  );
};

/** SVG layer drawn in plate space on depth plane k. */
export const PlaneSvg: React.FC<{cam: Cam; k?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({cam, k = 1, children, style}) => (
  <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, overflow: 'visible', ...style}}>
    <g transform={camSvg(cam, k)}>{children}</g>
  </svg>
);

/** Full-frame colour grade layer (multiply/soft-light/screen tint). */
export const Tint: React.FC<{color: string; opacity: number; mode?: React.CSSProperties['mixBlendMode']; gradient?: string}> = ({color, opacity, mode = 'multiply', gradient}) => (
  <div style={{position: 'absolute', inset: 0, background: gradient ?? color, opacity, mixBlendMode: mode}} />
);

// ------------------------------------------------------------------ the Traveller, lit by the scene
export interface Light {
  pos: [number, number]; // key light position (plate px) — lamp, low sun, sky glow
  r: number; // falloff radius (plate px); large = sun
  dir: [number, number]; // unit vector from him toward the light
  key: number; // warm key strength 0–1
  keyOff: number; // terminator distance from the lit edge (plate px)
  rim: number; // rim width (plate px)
  rimOpacity?: number;
  amb: [number, number, number]; // ambient multipliers (r, g, b)
  warm?: string; // key colour matrix (defaults to lamp-warm)
  rimColor?: string;
}
export const LAMP_WARM = '0.98 0 0 0 0.02  0 0.8 0 0 0.01  0 0 0.57 0 0  0 0 0 1 0';
export const SUN_WARM = '1.0 0 0 0 0.03  0 0.9 0 0 0.02  0 0 0.72 0 0.01  0 0 0 1 0';

export const LitFigure: React.FC<{
  id: string;
  pose: StickPose;
  feet: [number, number];
  scale: number;
  light: Light;
  shadow?: string; // cast-shadow matrix (plate space, relative to the feet)
  shadowOpacity?: number;
  contact?: [number, number];
  soft?: number;
  facing?: 1 | -1;
  shadeSide?: 1 | -1;
  opacity?: number;
}> = ({id, pose, feet, scale, light: L, shadow, shadowOpacity = 0.5, contact, soft = 0.6, facing = 1, shadeSide = 1, opacity = 1}) => {
  const fig = <Stickman pose={pose} scale={scale} facing={facing} shadeSide={shadeSide} />;
  const at = `translate(${feet[0]} ${feet[1]})`;
  const ci = 'sRGB';
  return (
    <g opacity={opacity}>
      <defs>
        <filter id={`${id}-amb`} colorInterpolationFilters={ci}>
          <feColorMatrix type="matrix" values={`${L.amb[0]} 0 0 0 0.015  0 ${L.amb[1]} 0 0 0.02  0 0 ${L.amb[2]} 0 0.04  0 0 0 1 0`} />
        </filter>
        <filter id={`${id}-warm`} colorInterpolationFilters={ci} x="-40%" y="-20%" width="180%" height="140%">
          <feOffset in="SourceAlpha" dx={-L.dir[0] * L.keyOff} dy={-L.dir[1] * L.keyOff} result="off" />
          <feComposite in="SourceGraphic" in2="off" operator="out" result="lit" />
          <feGaussianBlur in="lit" stdDeviation={L.keyOff * 0.18} result="litb" />
          <feComposite in="litb" in2="SourceAlpha" operator="in" result="litc" />
          <feColorMatrix in="litc" type="matrix" values={L.warm ?? LAMP_WARM} />
        </filter>
        <filter id={`${id}-rim`} colorInterpolationFilters={ci} x="-40%" y="-20%" width="180%" height="140%">
          <feOffset in="SourceAlpha" dx={-L.dir[0] * L.rim} dy={-L.dir[1] * L.rim} result="off" />
          <feComposite in="SourceAlpha" in2="off" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation={L.rim * 0.22} result="eb" />
          <feFlood floodColor={L.rimColor ?? '#FFD9A2'} />
          <feComposite in2="eb" operator="in" />
        </filter>
        <filter id={`${id}-sh`} colorInterpolationFilters={ci} x="-60%" y="-60%" width="220%" height="220%">
          <feColorMatrix type="matrix" values="0 0 0 0 0.02  0 0 0 0 0.025  0 0 0 0 0.04  0 0 0 1 0" />
          <feGaussianBlur stdDeviation={Math.max(0.6, L.rim * 0.7)} />
        </filter>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={soft} />
        </filter>
        {contact && (
          <filter id={`${id}-cs`} x="-50%" y="-200%" width="200%" height="500%">
            <feGaussianBlur stdDeviation={contact[1] * 0.7} />
          </filter>
        )}
        <radialGradient id={`${id}-lg`} cx={L.pos[0]} cy={L.pos[1]} r={L.r} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#fff" stopOpacity={1} />
          <stop offset={0.5} stopColor="#fff" stopOpacity={0.5} />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id={`${id}-lm`} maskUnits="userSpaceOnUse" x={-6000} y={-6000} width={14000} height={14000}>
          <rect x={-6000} y={-6000} width={14000} height={14000} fill={`url(#${id}-lg)`} />
        </mask>
      </defs>
      {shadow && (
        <g transform={`${at} ${shadow}`} filter={`url(#${id}-sh)`} opacity={shadowOpacity}>
          {fig}
        </g>
      )}
      {contact && <ellipse cx={feet[0]} cy={feet[1] + contact[1] * 0.3} rx={contact[0]} ry={contact[1]} fill="#04060A" opacity={0.6} filter={`url(#${id}-cs)`} />}
      <g filter={`url(#${id}-soft)`}>
        <g transform={at} filter={`url(#${id}-amb)`}>
          {fig}
        </g>
        {L.key > 0.001 && (
          <g mask={`url(#${id}-lm)`} opacity={L.key}>
            <g transform={at} filter={`url(#${id}-warm)`}>
              {fig}
            </g>
          </g>
        )}
        {(L.rimOpacity ?? 0.9) > 0.001 && (
          <g transform={at} filter={`url(#${id}-rim)`} opacity={L.rimOpacity ?? 0.9}>
            {fig}
          </g>
        )}
      </g>
    </g>
  );
};

/** The luminous imagined self (or a faint memory figure): self-lit, soft, can dissolve into rising motes. */
export const GlowFigure: React.FC<{
  id: string;
  pose: StickPose;
  feet: [number, number];
  scale: number;
  look?: StickLook;
  opacity: number;
  dissolve?: number; // 0 → 1: fades while motes rise from the body
  f: number;
  facing?: 1 | -1;
  tint?: 'gold' | 'ghost';
}> = ({id, pose, feet, scale, look = 'imagined', opacity, dissolve = 0, f, facing = 1, tint = 'gold'}) => {
  const motes = [];
  if (dissolve > 0) {
    for (let i = 0; i < 26; i++) {
      const h = hash(i, 5);
      const life = clamp((dissolve - h * 0.5) / 0.5);
      if (life <= 0 || life >= 1) continue;
      const x = feet[0] + (hash(i, 6) - 0.5) * 30 * scale + life * (hash(i, 7) - 0.3) * 60 * scale;
      const y = feet[1] - hash(i, 8) * 150 * scale - life * 120 * scale;
      motes.push(<circle key={i} cx={x} cy={y} r={1.6 * scale} fill="#FFE2A8" opacity={(1 - life) * 0.9} />);
    }
  }
  const body = (1 - dissolve) * opacity;
  return (
    <g>
      <defs>
        <filter id={`${id}-gb`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={tint === 'ghost' ? 1.4 : 0.6} />
        </filter>
      </defs>
      <g transform={`translate(${feet[0]} ${feet[1]})`} opacity={body} filter={`url(#${id}-gb)`} style={tint === 'ghost' ? {filter: 'saturate(0.3) brightness(0.9)'} : undefined}>
        <Stickman pose={pose} scale={scale} look={tint === 'ghost' ? 'ivory' : look} glow={tint === 'gold' ? 0.8 : 0} facing={facing} />
      </g>
      <g style={{filter: 'blur(1px)'}}>{motes}</g>
      {tint === 'gold' && body > 0 && (
        <ellipse cx={feet[0]} cy={feet[1] - 70 * scale} rx={60 * scale} ry={95 * scale} fill="#FFD98E" opacity={0.12 * body} style={{filter: `blur(${18 * scale}px)`}} />
      )}
    </g>
  );
};

// ------------------------------------------------------------------ motion
export const breathe = (f: number, p: StickPose, amt = 1): StickPose => {
  const b = Math.sin((f / 30) * ((2 * Math.PI) / 4.4));
  return {...p, shoulderDrop: p.shoulderDrop - b * 0.6 * amt, headDrop: p.headDrop - b * 0.25 * amt, lean: p.lean + 0.9 * noise1(f / 70, 3) * amt};
};
const mirror = (p: StickPose): StickPose => ({...p, armL: p.armR, armR: p.armL, legL: p.legR, legR: p.legL});
/** Side-view walk cycle. phase in cycles (1 = two steps). Stride per cycle ≈ 116 units × scale. */
export const STRIDE = 116;
export const walkPose = (phase: number, lean = 4): StickPose => {
  const p = ((phase % 1) + 1) % 1;
  const A = POSES.walkA, B = POSES.walkB, C = POSES.walkC, Bm = mirror(POSES.walkB);
  const seg = Math.floor(p * 4), t = ease.inOutSine((p * 4) % 1);
  const pose = seg === 0 ? blendPose(A, B, t) : seg === 1 ? blendPose(B, C, t) : seg === 2 ? blendPose(C, Bm, t) : blendPose(Bm, A, t);
  return {...pose, lean};
};
/** Front view (walking toward / away from the camera): symmetric legs alternate, small bob and sway. */
export const frontWalkPose = (phase: number): StickPose => {
  const s = Math.sin(phase * 2 * Math.PI);
  return {
    ...POSES.stand,
    lean: 1.5 * s,
    armL: [-9 - 5 * s, 6],
    armR: [9 - 5 * s, 6],
    legL: [-5 + 3 * Math.max(0, s), 14 * Math.max(0, s)],
    legR: [5 - 3 * Math.max(0, -s), 14 * Math.max(0, -s)],
    hipDrop: 1.5 * Math.abs(s),
  };
};
export const STAND_BACK: StickPose = {...POSES.stand, armL: [-11, -5], armR: [11, 5], legL: [-6, 0], legR: [6, 0]};
export const STAND_FRONT = STAND_BACK;

// ------------------------------------------------------------------ effects
/** Rain: two depth layers of fine streaks, deterministic per frame. */
export const Rain: React.FC<{f: number; amount: number}> = ({f, amount}) => {
  if (amount <= 0.01) return null;
  const lines = [];
  const n = Math.round(220 * amount);
  for (let i = 0; i < n; i++) {
    const near = i % 3 === 0;
    const vy = near ? 52 : 34;
    const len = near ? 34 : 20;
    const x = (hash(i, 1) * 2100 + f * (near ? 6 : 4)) % 2000 - 40;
    const y = (hash(i, 2) * 1200 + f * vy) % 1180 - 60;
    lines.push(<line key={i} x1={x} y1={y} x2={x - len * 0.16} y2={y + len} stroke={near ? 'rgba(205,214,228,0.32)' : 'rgba(190,200,216,0.2)'} strokeWidth={near ? 1.6 : 1} />);
  }
  return (
    <svg width={1920} height={1080} style={{position: 'absolute', inset: 0, opacity: Math.min(1, amount * 1.2), filter: 'blur(0.4px)'}}>
      {lines}
    </svg>
  );
};

/** A small warm light that leaves his hands and drifts away over the water (a loss). */
export const DriftLight: React.FC<{f: number; start: number; from: [number, number]; to: [number, number]; size: number; dur?: number}> = ({f, start, from, to, size, dur = 150}) => {
  const t = (f - start) / dur;
  if (t < 0 || t > 1) return null;
  const e = ease.outCubic(t);
  const x = from[0] + (to[0] - from[0]) * e + Math.sin(t * 6 + start) * 10;
  const y = from[1] + (to[1] - from[1]) * e - Math.sin(t * Math.PI) * 60;
  const o = Math.min(ramp(f, start, 12), 1 - ramp(f, start + dur * 0.55, dur * 0.45));
  const s = size * (1 - 0.6 * e);
  return (
    <g opacity={o}>
      <circle cx={x} cy={y} r={s * 3.6} fill="#FFCF86" opacity={0.3} style={{filter: `blur(${s * 1.4}px)`}} />
      <circle cx={x} cy={y} r={s} fill="#FFE8BE" style={{filter: `blur(${s * 0.25}px)`}} />
    </g>
  );
};

/** Lamp glow + flicker; `on` 0–1 (goes out / relights with a stutter). */
export const lampLevel = (f: number, on: number) => (0.86 + 0.08 * noise1(f / 6, 9) + 0.04 * noise1(f / 2.3, 10)) * on;
/** Off → on (or on → off) with a few stutters, like a lamp catching. */
export const lampSwitch = (f: number, at: number, dir: 'on' | 'off', dur = 24) => {
  const t = clamp((f - at) / dur);
  const stutter = t > 0 && t < 1 ? (Math.sin(t * 37) > 0.2 ? 1 : 0.25) : 1;
  const v = dir === 'on' ? t * stutter : (1 - t) * stutter * (t < 1 ? 1 : 0);
  return dir === 'on' ? (t >= 1 ? 1 : v) : t >= 1 ? 0 : v;
};

/** A young tree, drawn by deterministic recursive branching; grow 0–1. */
export const Tree: React.FC<{x: number; y: number; size: number; grow: number; seed?: number; sway?: number}> = ({x, y, size, grow, seed = 3, sway = 0}) => {
  const branches: React.ReactNode[] = [];
  const leaves: React.ReactNode[] = [];
  const g = clamp(grow);
  const rec = (px: number, py: number, ang: number, len: number, w: number, depth: number, id: number) => {
    const appear = clamp((g - depth * 0.16) / 0.3);
    if (appear <= 0) return;
    const L = len * appear;
    const a = ang + sway * (depth + 1) * 0.6;
    const ex = px + Math.sin((a * Math.PI) / 180) * L;
    const ey = py - Math.cos((a * Math.PI) / 180) * L;
    branches.push(<line key={`b${id}`} x1={px} y1={py} x2={ex} y2={ey} stroke="#3B2E24" strokeWidth={Math.max(1, w * appear)} strokeLinecap="round" />);
    if (depth >= 3 || len < 10) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const r = (13 + hash(id * 7 + i, seed) * 10) * size * appear;
        leaves.push(
          <circle key={`l${id}-${i}`} cx={ex + (hash(id + i, seed + 1) - 0.5) * 30 * size} cy={ey + (hash(id + i, seed + 2) - 0.5) * 24 * size} r={r} fill={['#5E7248', '#6F8656', '#4F6340'][i]} opacity={0.92} />,
        );
      }
      return;
    }
    const k = 2 + (hash(id, seed) > 0.55 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const spread = (i - (k - 1) / 2) * (26 + hash(id + i, seed + 3) * 12);
      rec(ex, ey, a + spread, len * (0.68 + hash(id * 3 + i, seed + 4) * 0.12), w * 0.66, depth + 1, id * 4 + i + 1);
    }
  };
  rec(x, y, 0, 120 * size, 11 * size, 0, 1);
  return (
    <g>
      <g>{branches}</g>
      <g style={{filter: 'blur(0.6px)'}}>{leaves}</g>
    </g>
  );
};

/** Roots spreading through the soil under (x, y): drawn on with `grow`, softly glowing when `glow` > 0. */
export const Roots: React.FC<{x: number; y: number; size: number; grow: number; glow?: number; seed?: number}> = ({x, y, size, grow, glow = 0, seed = 11}) => {
  const paths: {d: string; w: number; depth: number; len: number}[] = [];
  const rec = (px: number, py: number, ang: number, len: number, w: number, depth: number, id: number) => {
    let d = `M${px.toFixed(1)} ${py.toFixed(1)}`;
    let cx = px, cy = py, a = ang;
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      a += (hash(id * 13 + i, seed) - 0.5) * 34;
      cx += Math.sin((a * Math.PI) / 180) * (len / steps);
      cy += Math.cos((a * Math.PI) / 180) * (len / steps);
      d += ` L${cx.toFixed(1)} ${cy.toFixed(1)}`;
    }
    paths.push({d, w, depth, len});
    if (depth >= 4) return;
    const k = 2 + (hash(id, seed + 2) > 0.5 ? 1 : 0);
    for (let i = 0; i < k; i++) {
      const t = 0.35 + hash(id + i, seed + 3) * 0.55;
      const bx = px + (cx - px) * t, by = py + (cy - py) * t;
      rec(bx, by, a + (i - (k - 1) / 2) * 52 + (hash(id + i, seed + 4) - 0.5) * 20, len * 0.62, w * 0.62, depth + 1, id * 5 + i + 1);
    }
  };
  for (let i = 0; i < 4; i++) rec(x + (i - 1.5) * 6 * size, y, (i - 1.5) * 34, 150 * size, 7 * size, 0, i + 1);
  const g = clamp(grow);
  const draw = (p: (typeof paths)[number], stroke: string, wMul: number, key: string) => {
    const appear = clamp((g - p.depth * 0.17) / 0.32);
    if (appear <= 0) return null;
    return <path key={key} d={p.d} stroke={stroke} strokeWidth={Math.max(0.8, p.w * wMul)} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - appear} />;
  };
  return (
    <g>
      {glow > 0 && <g opacity={glow} style={{filter: `blur(${4 * size}px)`}}>{paths.map((p, i) => draw(p, '#F2C57C', 2.4, `g${i}`))}</g>}
      <g>{paths.map((p, i) => draw(p, glow > 0 ? '#C99A5B' : '#7A5A3C', 1, `r${i}`))}</g>
    </g>
  );
};

/** The faint golden timeline across the land; listed ticks light up at their frames, then cool to grey as they
 *  fall behind (missed milestones). `drop` 0…1 lets the whole ruler fall apart, tick by tick (letting go of deadlines). */
export const TimelineRuler: React.FC<{y: number; x0: number; x1: number; spacing: number; lit: [number, number][]; f: number; opacity: number; drop?: number}> = ({y, x0, x1, spacing, lit, f, opacity, drop = 0}) => {
  const ticks = [];
  const fall = (x: number) => clamp(drop * 1.6 - 0.6 * hash(Math.round(x / spacing), 41));
  for (let x = Math.ceil(x0 / spacing) * spacing; x < x1; x += spacing) {
    const d = fall(x);
    ticks.push(<line key={x} x1={x} y1={y - 16 + d * 90} x2={x} y2={y + 16 + d * 90} stroke="#F4D49A" strokeWidth={3} opacity={0.75 * (1 - d)} />);
  }
  return (
    <g opacity={opacity}>
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="#F4D49A" strokeWidth={2.6} opacity={0.8 * (1 - clamp(drop * 1.4))} />
      <line x1={x0} y1={y} x2={x1} y2={y} stroke="#FFE2A8" strokeWidth={10} opacity={0.12 * (1 - clamp(drop * 1.4))} style={{filter: 'blur(4px)'}} />
      {ticks}
      {lit.map(([x, at]) => {
        const g = ramp(f, at, 10) * (1 - 0.35 * ramp(f, at + 30, 40)) * (1 - fall(x));
        const missed = ramp(f, at + 45, 50); // the moment passes: warm → cold grey
        return g > 0 ? (
          <g key={`l${x}`}>
            <line x1={x} y1={y - 30} x2={x} y2={y + 30} stroke={missed > 0.5 ? '#AEB8C6' : '#FFF0CC'} strokeWidth={4.5} opacity={g * (1 - 0.3 * missed)} />
            <circle cx={x} cy={y} r={28} fill="#FFE1A6" opacity={0.6 * g * (1 - missed)} style={{filter: 'blur(10px)'}} />
          </g>
        ) : null;
      })}
    </g>
  );
};

/** "You had plans": a golden route drawn on through the air (draw 0…1), its stars kindling (dreams 0…1),
 *  then the light gathering at its far end (gather 0…1) where the imagined self forms. */
export const PlanLine: React.FC<{pts: [number, number][]; draw: number; dreams: number; gather: number; f: number}> = ({pts, draw, dreams, gather, f}) => {
  if (draw <= 0) return null;
  // the route drawn on: the polyline truncated at `draw` of its length
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = seg.reduce((x, y) => x + y, 0);
  let left = clamp(draw) * total;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < seg.length && left > 0; i++) {
    const t = Math.min(1, left / seg[i]);
    d += ` L${pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t} ${pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t}`;
    left -= seg[i];
  }
  const end = pts[pts.length - 1];
  const stars = [];
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const u = i / (n + 1);
    const a = u * (pts.length - 1);
    const j = Math.min(pts.length - 2, Math.floor(a)), t = a - j;
    let x = pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t;
    let y = pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t;
    const on = clamp((draw - u) * 6) * (0.35 + 0.65 * clamp(dreams * 1.5 - u * 0.5));
    const g = ease.inOutSine(clamp(gather * 1.4 - (1 - u) * 0.4)); // stars flow to the far end
    x += (end[0] - x) * g;
    y += (end[1] - y) * g;
    const tw = 0.75 + 0.25 * Math.sin(f / 7 + i * 1.9);
    const r = (3 + 4 * dreams) * tw;
    stars.push(
      <g key={i} opacity={on * (1 - clamp((gather - 0.75) * 4))}>
        <circle cx={x} cy={y} r={r * 3.2} fill="#FFD58E" opacity={0.28} style={{filter: 'blur(6px)'}} />
        <circle cx={x} cy={y} r={r} fill="#FFF1CF" />
      </g>,
    );
  }
  return (
    <g>
      <path d={d} stroke="#F4D49A" strokeWidth={3.2} fill="none" strokeDasharray="3 15" strokeLinecap="round" opacity={0.85 * (1 - clamp(gather * 1.3))} />
      <path d={d} stroke="#FFE2A8" strokeWidth={10} fill="none" opacity={0.1 * (1 - clamp(gather * 1.3))} style={{filter: 'blur(5px)'}} />
      {stars}
    </g>
  );
};

/** A person's own small light (reads at a distance, and on a phone): each life at its own pace. */
export const Lantern: React.FC<{x: number; y: number; sc: number; o?: number; warm?: boolean}> = ({x, y, sc, o = 1, warm = true}) => (
  <g opacity={o}>
    <circle cx={x} cy={y} r={26 * sc} fill={warm ? '#FFD596' : '#DDE6F2'} opacity={0.35} style={{filter: `blur(${9 * sc}px)`}} />
    <circle cx={x} cy={y} r={5 * sc} fill="#FFF3D6" opacity={0.85} style={{filter: `blur(${1.2 * sc}px)`}} />
  </g>
);
