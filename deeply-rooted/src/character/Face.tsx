import React from 'react';
import {tones} from '../config/palette';
import {lerp} from '../engine/anim';
import {hash, noise1} from '../engine/noise';
import {Mat} from './Materials';
import {Mode, paint} from './spec';
import type {Pose34} from './Walker34';

/**
 * THE WALKER — head, three-quarter front facing screen-left (quality upgrade).
 * Same silhouette, features and proportions as the locked design (spec.ts), now painted:
 * soft modelled planes, layered eyes, hair-stroke brows, sculpted lips, stubble stipple,
 * anatomical ear and a strand-built haircut. Centimetres, y-up.
 */
const T = tones;

export const FACE_D =
  'M-6.6 175.0 C-7.9 173.4 -8.4 171.0 -8.35 169.2 C-8.3 168.4 -8.0 167.9 -8.05 166.6 C-8.1 165.6 -8.3 165.0 -8.3 164.2 ' +
  'C-8.55 163.8 -8.9 163.2 -9.15 162.55 C-9.2 162.1 -8.9 161.9 -8.35 161.75 ' +
  'C-8.05 161.4 -8.25 160.8 -8.25 160.4 C-8.15 160.1 -8.0 159.95 -8.0 159.9 C-8.15 159.5 -8.05 159.0 -7.8 158.7 ' +
  'C-7.45 158.35 -7.45 158.1 -7.45 158.05 C-7.7 157.6 -7.75 157.0 -7.65 156.6 C-7.5 155.8 -7.1 155.3 -6.6 155.0 ' +
  'C-5.4 154.4 -3.2 154.7 -1.0 155.2 C1.0 155.8 2.6 156.8 3.7 158.0 C4.3 158.7 4.5 159.6 4.6 160.4 ' +
  'C5.6 162.6 8.6 164.6 9.4 167.4 C10.0 170.4 9.6 175.2 6.2 177.9 C3.8 179.6 -1.6 179.8 -4.2 178.6 C-5.4 177.9 -6.2 176.6 -6.6 175.0 Z';

const HAIR_D = (w: number) =>
  `M-6.9 174.6 C-8.0 175.4 ${-8.9 + w} 176.9 ${-8.4 + w} 178.2 C-7.6 179.6 -5.6 180.6 -3.4 180.9 ` +
  `C-1.2 ${181.6 + w * 0.2} 1.6 181.3 3.8 180.6 C6.6 179.8 8.9 178.0 9.9 175.4 C10.7 173.0 10.6 170.0 10.0 167.6 ` +
  'C9.6 165.6 8.9 164.0 7.8 162.7 C7.2 162.2 6.8 162.6 6.9 163.4 L7.2 165.4 C6.6 167.6 5.2 168.2 4.3 167.6 ' +
  'C3.9 166.4 3.7 164.6 3.5 163.4 L2.8 163.6 C2.6 166.2 2.2 168.6 1.6 170.6 C0.2 172.4 -2.6 173.0 -4.6 173.6 C-5.6 173.9 -6.4 174.2 -6.9 174.6 Z';

const LOCKS_D = (w: number) =>
  `M-5.8 180.2 C${-5.0 + w} 182.0 -2.6 182.4 -1.6 181.6 C-2.8 181.6 -4.0 181.2 -4.6 180.4 Z M0.8 181.4 C1.8 182.8 4.2 182.6 5.0 181.4 C3.8 181.7 2.4 181.6 1.6 180.9 Z M-8.2 177.6 C${-9.6 + w} 177.2 -9.8 175.8 -9.2 174.9 C-9.0 175.9 -8.6 176.6 -7.8 176.8 Z`;

const EAR_D = 'M4.3 166.9 C5.1 168.5 7.5 168.3 7.7 165.7 C7.9 163.7 7.0 161.9 5.9 161.1 C5.1 160.6 4.5 161.1 4.4 162.0 Z';

// Hair strands: crown → swept forward to the fringe (toward his right = screen left), plus short sides.
const STRANDS = (() => {
  const out: {d: string; light: boolean; w: number}[] = [];
  for (let i = 0; i < 46; i++) {
    const t = i / 45;
    const sx = lerp(8.6, 1.0, t) + (hash(i, 3) - 0.5) * 1.2;
    const sy = lerp(171.5, 180.4, Math.sin(t * Math.PI * 0.5)) + (hash(i, 4) - 0.5) * 0.8;
    const ex = lerp(-3.0, -8.6, t) + (hash(i, 5) - 0.5) * 1.4;
    const ey = lerp(180.4, 176.0, t) + (hash(i, 6) - 0.5) * 0.9;
    const cx = (sx + ex) / 2 + (hash(i, 7) - 0.5) * 1.2;
    const cy = Math.max(sy, ey) + 1.4 + hash(i, 8) * 0.8;
    out.push({d: `M${sx.toFixed(2)} ${sy.toFixed(2)} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`, light: hash(i, 9) > 0.55 && sy > 175, w: 0.12 + hash(i, 10) * 0.2});
  }
  for (let i = 0; i < 14; i++) {
    const x = lerp(2.2, 9.6, i / 13);
    const top = 173 - (i / 13) * 3;
    out.push({d: `M${x.toFixed(2)} ${top.toFixed(2)} Q${(x + 0.4).toFixed(2)} ${(top - 3).toFixed(2)} ${(x + 0.2 + (hash(i, 11) - 0.5)).toFixed(2)} ${(top - 6.5).toFixed(2)}`, light: false, w: 0.14});
  }
  return out;
})();

const brow = (inner: [number, number], peak: [number, number], outer: [number, number], worry: number, n: number, seed: number) => {
  const strokes: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    const lift = (1 - t) * worry * 0.55;
    const x = a * inner[0] + b * peak[0] + c * outer[0] + (hash(i, seed) - 0.5) * 0.12;
    const y = a * inner[1] + b * peak[1] + c * outer[1] + lift + (hash(i, seed + 1) - 0.5) * 0.18;
    const ang = lerp(70, 6, Math.pow(t, 0.7)) * (Math.PI / 180) * Math.sign(outer[0] - inner[0] || 1);
    const L = 0.55 + hash(i, seed + 2) * 0.25;
    const dx = Math.cos(ang) * L * Math.sign(outer[0] - inner[0]), dy = Math.sin(Math.abs(ang)) * L * 0.55;
    strokes.push(`M${x.toFixed(2)} ${(y - dy * 0.4).toFixed(2)} l${dx.toFixed(2)} ${dy.toFixed(2)}`);
  }
  return strokes.join('');
};

const Eye: React.FC<{cx: number; cy: number; w: number; h: number; p: Pose34; far?: boolean; uid: string}> = ({cx, cy, w, h, p, far, uid}) => {
  const lid = Math.min(1, Math.max(p.blink, p.lidLower * 0.42 + Math.max(0, -p.gazeY) * 0.22));
  const innerLeft = !far; // near eye: nose (inner corner) on the left; far eye: on the right
  const ix0 = innerLeft ? cx - w / 2 : cx + w / 2;
  const ox0 = innerLeft ? cx + w / 2 : cx - w / 2;
  const inner: [number, number] = [ix0, cy - 0.06];
  const outer: [number, number] = [ox0, cy + 0.14];
  const top = cy + h * 1.08;
  const peakX = lerp(inner[0], outer[0], 0.42);
  const lowX = lerp(inner[0], outer[0], 0.55);
  const lidY = lerp(top, cy - h * 0.55, lid);
  const gx = cx + p.gazeX * w * 0.2 + (far ? -0.08 : 0);
  const gy = cy + p.gazeY * h * 0.28 + 0.05;
  const ir = h * 0.68;
  const id = `${uid}-eye${far ? 'f' : 'n'}`;
  const white = `M${inner[0]} ${inner[1]}Q${peakX} ${top} ${outer[0]} ${outer[1]}Q${lowX} ${cy - h * 0.86} ${inner[0]} ${inner[1]}Z`;
  const lash = `M${inner[0]} ${inner[1]}Q${peakX} ${lerp(top, lidY, 0.92) + 0.1} ${outer[0]} ${outer[1] + 0.04}`;
  const dir = Math.sign(outer[0] - inner[0]);
  const lashes: string[] = [];
  for (let k = 0; k < 6; k++) {
    const t = 0.45 + k * 0.1;
    const x = lerp(inner[0], outer[0], t);
    const y = lerp(inner[1], outer[1], t) + (top - cy) * 0.95 * 4 * t * (1 - t) * (1 - lid * 0.85);
    lashes.push(`M${x.toFixed(3)} ${y.toFixed(3)} l${(dir * (0.12 + t * 0.22)).toFixed(3)} ${(0.26 - t * 0.12).toFixed(3)}`);
  }
  return (
    <g>
      <defs>
        <clipPath id={id}>
          <path d={white} />
        </clipPath>
        <radialGradient id={`${id}-iris`} cx={gx} cy={gy} r={ir} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#140E0C" />
          <stop offset={0.34} stopColor="#1A120F" />
          <stop offset={0.4} stopColor="#5C3E2B" />
          <stop offset={0.78} stopColor="#3E2A1F" />
          <stop offset={1} stopColor="#20160F" />
        </radialGradient>
        <linearGradient id={`${id}-scl`} x1={0} y1={top} x2={0} y2={cy - h} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#6B5448" stopOpacity={0.55} />
          <stop offset={0.45} stopColor="#6B5448" stopOpacity={0.08} />
          <stop offset={1} stopColor="#6B5448" stopOpacity={0.2} />
        </linearGradient>
      </defs>
      {/* socket depth around the eye */}
      <ellipse cx={cx} cy={cy + 0.25} rx={w * 0.78} ry={h * 1.55} fill={T.skinShadow} opacity={0.18} />
      <path d={white} fill={T.eyeWhite} />
      <g clipPath={`url(#${id})`}>
        <path d={white} fill={`url(#${id}-scl)`} />
        <circle cx={gx} cy={gy} r={ir} fill={`url(#${id}-iris)`} />
        <circle cx={gx + ir * 0.38} cy={gy + ir * 0.4} r={ir * 0.2} fill="#F6EFE4" opacity={0.85 * (1 - lid)} />
        <circle cx={gx - ir * 0.32} cy={gy - ir * 0.36} r={ir * 0.08} fill="#F6EFE4" opacity={0.5 * (1 - lid)} />
        {/* the upper lid itself, lowering for blinks / looking down */}
        <path d={`M${cx - w} ${top + 2}L${cx + w} ${top + 2}L${cx + w} ${lidY}Q${cx} ${lidY + (top - cy) * 0.25} ${cx - w} ${lidY}Z`} fill={T.skin} />
        <path d={`M${cx - w} ${lidY + 0.25}L${cx + w} ${lidY + 0.25}L${cx + w} ${lidY - 0.12}L${cx - w} ${lidY - 0.12}Z`} fill={T.skinShadow} opacity={0.6} />
      </g>
      {/* tear duct */}
      <ellipse cx={inner[0] + dir * 0.18} cy={inner[1] - 0.02} rx={0.16} ry={0.12} fill="#A9786A" opacity={0.7} />
      {/* lash line, lashes, lid crease, waterline, under-eye */}
      <path d={lash} fill="none" stroke="#21170F" strokeWidth={far ? 0.22 : 0.3} strokeLinecap="round" />
      <path d={lashes.join('')} stroke="#21170F" strokeWidth={0.06} strokeLinecap="round" opacity={0.85} />
      <path d={`M${lerp(inner[0], outer[0], 0.12)} ${top + 0.5 - lid * 0.2}Q${peakX} ${top + 1.0 - lid * 0.3} ${lerp(inner[0], outer[0], 0.96)} ${top + 0.32}`} fill="none" stroke={T.skinDeep} strokeWidth={0.14} opacity={0.6} />
      <path d={`M${lerp(inner[0], outer[0], 0.1)} ${top + 0.2}Q${peakX} ${top + 0.62} ${lerp(inner[0], outer[0], 0.95)} ${top + 0.1}`} fill="none" stroke={T.skinLight} strokeWidth={0.16} opacity={0.35} />
      <path d={`M${lerp(inner[0], outer[0], 0.15)} ${cy - h * 0.6}Q${lowX} ${cy - h * 0.86} ${lerp(inner[0], outer[0], 0.92)} ${cy - h * 0.38}`} fill="none" stroke="#C99A86" strokeWidth={0.08} opacity={0.55} />
      <path d={`M${lerp(inner[0], outer[0], 0.2)} ${cy - h * 1.15}Q${lowX} ${cy - h * 1.55} ${lerp(inner[0], outer[0], 0.9)} ${cy - h * 1.0}`} fill="none" stroke={T.skinDeep} strokeWidth={0.12} opacity={0.28} />
    </g>
  );
};

export const Head34: React.FC<{p: Pose34; mode: Mode; uid: string; frame?: number}> = ({p, mode, uid, frame = 0}) => {
  const P = (c: string) => paint(mode, c);
  const fx = p.headTurn * 1.0; // features slide across the head as it turns
  const worry = p.browWorry;
  const hairWind = p.wind * 0.6;
  const fine = p.detail > 0.5;
  const color = mode === 'color';
  const t = frame / 30;
  return (
    <g>
      {/* ear */}
      <path d={EAR_D} fill={P(T.skin)} />
      {color && fine && (
        <g>
          <path d={EAR_D} fill="#B37A66" opacity={0.25} />
          <path d="M5.1 166.6 C5.9 167.3 6.9 166.5 6.8 165.2 C6.7 164.0 6.1 163.0 5.5 162.6" fill="none" stroke={T.skinShadow} strokeWidth={0.32} strokeLinecap="round" />
          <path d="M5.6 165.8 C6.1 165.7 6.2 164.8 5.8 164.0" fill="none" stroke={T.skinDeep} strokeWidth={0.26} strokeLinecap="round" opacity={0.7} />
          <ellipse cx={5.4} cy={164.6} rx={0.45} ry={0.8} fill={T.skinDeep} opacity={0.45} filter={`url(#${uid}-soft03)`} />
          <path d="M6.6 167.7 C7.3 167.0 7.6 166.0 7.5 165.0" fill="none" stroke={T.skinLight} strokeWidth={0.22} opacity={0.6} />
        </g>
      )}
      {/* skull + face */}
      <path d={FACE_D} fill={P(T.skin)} />
      {color && (
        <defs>
          <clipPath id={`${uid}-face`}>
            <path d={FACE_D} />
          </clipPath>
          <radialGradient id={`${uid}-cheekLight`} cx={2.6} cy={163.6} r={8.5} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={T.skinLight} stopOpacity={0.55} />
            <stop offset={1} stopColor={T.skinLight} stopOpacity={0} />
          </radialGradient>
          <linearGradient id={`${uid}-faceShade`} x1={-9} y1={0} x2={1} y2={0} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={T.skinShadow} stopOpacity={0.45} />
            <stop offset={0.55} stopColor={T.skinShadow} stopOpacity={0.08} />
            <stop offset={1} stopColor={T.skinShadow} stopOpacity={0} />
          </linearGradient>
          <radialGradient id={`${uid}-stubbleMask`} cx={-3} cy={157.6} r={7.5} gradientUnits="userSpaceOnUse">
            <stop offset={0.6} stopColor="#fff" stopOpacity={1} />
            <stop offset={1} stopColor="#fff" stopOpacity={0} />
          </radialGradient>
          <mask id={`${uid}-stubM`} maskUnits="userSpaceOnUse" x={-12} y={150} width={20} height={16}>
            <path
              d="M-8.4 161.5 C-7.0 161.7 -4.8 161.5 -3.4 160.9 C-2.0 160.1 -0.6 158.5 1.2 158.7 C2.4 158.9 3.6 159.6 4.4 160.6 C3.8 158.4 2.2 156.8 -0.6 155.6 C-3.0 154.7 -5.6 154.6 -6.8 155.1 C-7.6 155.8 -7.8 157.2 -7.6 158.2 C-8.1 159.0 -8.3 160.2 -8.4 161.5 Z"
              fill={`url(#${uid}-stubbleMask)`}
              filter={`url(#${uid}-soft06)`}
            />
          </mask>
        </defs>
      )}
      {color && (
        <>
        <Mat uid={uid} d={FACE_D} kind="skin" vol={false} volV={false} />
        <path d={FACE_D} fill={`url(#${uid}-faceShade)`} />
        <path d={FACE_D} fill={`url(#${uid}-cheekLight)`} />
        <g clipPath={`url(#${uid}-face)`}>
          <g filter={`url(#${uid}-soft06)`}>
            {/* temple + forehead plane */}
            <ellipse cx={-1.6} cy={175.2} rx={3.8} ry={2.2} fill={T.skinLight} opacity={0.22} />
            <ellipse cx={1.8} cy={171.6} rx={1.6} ry={2.4} fill={T.skinShadow} opacity={0.28} />
            {/* brow ridge light, eye sockets */}
            <path d="M-7.6 168.4 C-5.2 168.9 -2.2 168.9 0.2 168.2 L0.2 167.8 C-2.2 168.4 -5.2 168.4 -7.6 168.0 Z" fill={T.skinLight} opacity={0.28} />
            {/* cheekbone */}
            <ellipse cx={-1.4} cy={163.8} rx={2.6} ry={1.15} fill={T.skinLight} opacity={0.3} />
            {/* under-cheek hollow */}
            <ellipse cx={-0.4} cy={160.6} rx={2.8} ry={1.6} fill={T.skinShadow} opacity={0.22} />
            {/* nasolabial fold */}
            <path d={`M${-6.3 + fx} 162.2 C${-5.4 + fx} 161.2 ${-4.6 + fx} 160.4 ${-3.9 + fx} 159.5`} fill="none" stroke={T.skinShadow} strokeWidth={0.45} opacity={0.42} />
            {/* chin + under-lip */}
            <ellipse cx={-6.4 + fx * 0.6} cy={156.8} rx={1.3} ry={0.8} fill={T.skinLight} opacity={0.25} />
            <ellipse cx={-5.8 + fx * 0.8} cy={158.3} rx={1.5} ry={0.35} fill={T.skinShadow} opacity={0.35} />
            {/* jaw underside / neck shadow */}
            <path d="M-6.0 154.8 C-2.6 154.9 1.2 155.8 3.8 158.0 L3.4 159.2 C1.2 157.4 -2.4 156.2 -6.2 156.0 Z" fill={T.skinDeep} opacity={0.32} />
            {/* warm blush */}
            <ellipse cx={-0.8} cy={162.6} rx={2.2} ry={1.3} fill="#B06B55" opacity={0.12} />
          </g>
          {/* stubble stipple */}
          <g mask={`url(#${uid}-stubM)`}>
            <rect x={-12} y={150} width={20} height={16} fill={T.hair} opacity={0.08} />
            <rect x={-12} y={150} width={20} height={16} fill={`url(#${uid}-tx-stubble)`} opacity={0.42} />
          </g>
          {/* nose */}
          <g transform={`translate(${fx} 0)`}>
            <path d="M-6.0 167.2 C-6.6 165.8 -7.3 164.4 -7.9 163.1" fill="none" stroke={T.skinLight} strokeWidth={0.42} strokeLinecap="round" opacity={0.42} filter={`url(#${uid}-soft03)`} />
            <path d="M-5.5 166.8 C-5.7 165.2 -5.9 163.6 -6.5 162.3" fill="none" stroke={T.skinShadow} strokeWidth={0.8} strokeLinecap="round" opacity={0.32} filter={`url(#${uid}-soft06)`} />
            <path d="M-6.4 162.75 C-6.9 162.95 -7.6 162.6 -7.8 161.95" fill="none" stroke={T.skinDeep} strokeWidth={0.22} strokeLinecap="round" opacity={0.6} />
            <path d="M-8.75 162.0 C-8.1 161.55 -7.3 161.55 -6.7 161.95 C-7.2 162.25 -7.9 162.35 -8.75 162.0 Z" fill={T.skinDeep} opacity={0.6} />
            <ellipse cx={-8.1} cy={161.95} rx={0.32} ry={0.13} fill="#3C2722" opacity={0.85} />
            <ellipse cx={-8.55} cy={162.8} rx={0.42} ry={0.28} fill={T.skinLight} opacity={0.4} />
          </g>
          {/* mouth */}
          <g transform={`translate(${fx * 0.85} 0)`}>
            <path d="M-7.7 161.35 C-7.6 161.0 -7.55 160.7 -7.5 160.45 M-6.5 161.45 C-6.35 161.1 -6.2 160.8 -6.1 160.55" fill="none" stroke={T.skinShadow} strokeWidth={0.16} opacity={0.35} />
            <path d="M-7.9 159.9 C-7.2 160.35 -6.6 160.58 -6.2 160.42 C-5.6 160.58 -4.6 160.42 -3.75 159.72 C-4.6 159.98 -6.6 160.03 -7.9 159.9 Z" fill="#6D483D" opacity={0.75} />
            <path d="M-7.6 159.75 C-6.8 159.66 -4.8 159.66 -4.0 159.6 C-4.6 159.08 -5.6 158.84 -6.3 158.9 C-6.9 158.95 -7.4 159.3 -7.6 159.75 Z" fill={T.lip} opacity={0.6} />
            <ellipse cx={-5.9} cy={159.25} rx={0.75} ry={0.17} fill={T.skinLight} opacity={0.32} />
            <path
              d={`M-7.95 ${159.88 - p.mouthSad * 0.2} C-7.0 160.02 -6.2 159.92 -5.4 159.93 C-4.8 159.9 -4.2 ${159.78 - p.mouthSad * 0.12} -3.7 ${159.6 - p.mouthSad * 0.32}`}
              fill="none"
              stroke="#3E2822"
              strokeWidth={0.2}
              strokeLinecap="round"
            />
            <circle cx={-3.7} cy={159.6 - p.mouthSad * 0.32} r={0.12} fill={T.skinDeep} opacity={0.6} />
          </g>
          {/* eyes + brows */}
          <g transform={`translate(${fx} 0)`}>
            <Eye cx={-7.05} cy={166.65} w={1.45 * (1 + p.headTurn * 0.12)} h={0.78} p={p} far uid={uid} />
            <Eye cx={-3.05} cy={166.75} w={2.85} h={1.02} p={p} uid={uid} />
            <path
              d={`M${-6.15 + worry * 0.15} ${169.25 + worry * 0.45} C-6.9 ${169.55 + worry * 0.25} -7.7 169.45 -8.35 169.0 C-7.7 169.1 -6.9 ${169.05 + worry * 0.2} ${-6.15 + worry * 0.15} ${168.85 + worry * 0.4} Z`}
              fill={T.hair}
              opacity={0.55}
            />
            <path
              d={`M${-4.75 - worry * 0.2} ${169.0 + worry * 0.55} C-3.6 ${169.95 + worry * 0.3} -1.9 169.95 -0.55 169.2 C-1.9 169.5 -3.5 ${169.45 + worry * 0.25} ${-4.75 - worry * 0.2} ${168.6 + worry * 0.5} Z`}
              fill={T.hair}
              opacity={0.55}
            />
            <path d={brow([-6.2, 169.05], [-7.1, 169.45], [-8.3, 169.05], worry, 9, 31)} stroke="#2A1F1A" strokeWidth={0.11} strokeLinecap="round" fill="none" />
            <path d={brow([-4.7, 168.9], [-2.6, 169.8], [-0.6, 169.2], worry, 15, 41)} stroke="#2A1F1A" strokeWidth={0.12} strokeLinecap="round" fill="none" />
            {worry > 0.25 && (
              <path d={`M-5.3 ${169.6 + worry * 0.3} C-5.25 ${170.3 + worry * 0.3} -5.2 170.8 -5.2 171.0`} fill="none" stroke={T.skinShadow} strokeWidth={0.14} opacity={(worry - 0.25) * 0.7} />
            )}
          </g>
        </g>
        </>
      )}
      {/* hair */}
      <path d={HAIR_D(hairWind)} fill={P(T.hair)} />
      <path d={LOCKS_D(hairWind)} fill={P(T.hair)} />
      {color && fine && (
        <g>
          <clipPath id={`${uid}-hair`}>
            <path d={HAIR_D(hairWind)} />
            <path d={LOCKS_D(hairWind)} />
          </clipPath>
          <Mat uid={uid} d={HAIR_D(hairWind)} kind="hair" vol={false} strength={0.6} />
          <g clipPath={`url(#${uid}-hair)`}>
            <ellipse cx={4.5} cy={179.4} rx={5} ry={1.8} fill={T.hairLight} opacity={0.22} filter={`url(#${uid}-soft12)`} />
            <ellipse cx={4.6} cy={166.5} rx={3.2} ry={3.5} fill="#1C1513" opacity={0.45} filter={`url(#${uid}-soft12)`} />
            {STRANDS.map((s, i) => (
              <path key={i} d={s.d} fill="none" stroke={s.light ? '#6E5747' : '#211915'} strokeWidth={s.w} strokeLinecap="round" opacity={s.light ? 0.65 : 0.5} />
            ))}
          </g>
          {/* a few flyaway strands catching the wind */}
          {[0, 1, 2].map((k) => {
            const wv = noise1(t * 1.4 + k * 3, 51) * 0.5 + hairWind * 0.8;
            return (
              <path
                key={k}
                d={`M${-6.5 + k * 1.6} ${180.6 + k * 0.4} q${-1.2 + wv} ${1.4 + k * 0.2} ${-2.2 + wv * 1.6} ${0.9 - k * 0.3}`}
                fill="none"
                stroke="#3C2E26"
                strokeWidth={0.07}
                opacity={0.7}
              />
            );
          })}
        </g>
      )}
    </g>
  );
};
