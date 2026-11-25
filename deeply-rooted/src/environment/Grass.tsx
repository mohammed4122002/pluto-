import React from 'react';
import {FPS, W, wind} from '../config/production';
import {Cam, project} from '../engine/camera';
import {mix} from '../engine/color';
import {Drawable} from '../engine/DepthStack';
import {noise1, rng} from '../engine/noise';
import {distToPaths} from './geometry';
import {PathDef} from './types';

interface Blade {
  dx: number;
  dz: number;
  h: number;
  lean: number;
  w: number;
  dry: boolean;
  phase: number;
}
export type PlantKind = 'grass' | 'seed' | 'flower' | 'shrub' | 'stone';
export interface Tuft {
  x: number;
  z: number;
  blades: Blade[];
  h: number;
  kind?: PlantKind;
  seed?: number;
}

export const makeTufts = (
  seed: number,
  n: number,
  area: {x0: number; x1: number; z0: number; z1: number},
  paths: PathDef[],
  opt: {minH: number; maxH: number; dry: number; avoid: number; tallChance?: number; mix?: Partial<Record<PlantKind, number>>},
): Tuft[] => {
  const weights = {grass: 1, seed: 0, flower: 0, shrub: 0, stone: 0, ...(opt.mix ?? {})};
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const pickKind = (u: number): PlantKind => {
    let acc = 0;
    for (const [k, w] of Object.entries(weights)) {
      acc += w / total;
      if (u <= acc) return k as PlantKind;
    }
    return 'grass';
  };
  const r = rng(seed);
  const out: Tuft[] = [];
  let guard = 0;
  // tufts grow in natural clumps: pick a clump centre, scatter a few tufts around it
  let cx = 0, cz = 0, left = 0;
  while (out.length < n && guard++ < n * 10) {
    if (left <= 0) {
      cz = area.z0 + (area.z1 - area.z0) * Math.pow(r(), 1.7);
      cx = area.x0 + (area.x1 - area.x0) * r();
      left = 2 + Math.floor(r() * 6);
    }
    left--;
    const spread = 0.35 + cz * 0.02;
    const z = cz + (r() - 0.5) * spread * 1.6;
    const x = cx + (r() - 0.5) * spread * 2.4;
    if (distToPaths(x, z, paths) < opt.avoid) continue;
    const tall = r() < (opt.tallChance ?? 0.08);
    const h = (opt.minH + (opt.maxH - opt.minH) * r()) * (tall ? 1.9 : 1);
    const nb = 7 + Math.floor(r() * 9);
    const blades: Blade[] = Array.from({length: nb}, () => ({
      dx: (r() - 0.5) * h * 0.55,
      dz: (r() - 0.5) * 0.2,
      h: h * (0.55 + r() * 0.5),
      lean: (r() - 0.5) * 0.7,
      w: 0.012 + r() * 0.016,
      dry: r() < opt.dry || (tall && r() < 0.7),
      phase: r() * 10,
    }));
    let kind = pickKind(r());
    if (kind === 'shrub' && z - area.z0 < 10) kind = 'grass';
    out.push({x, z, blades, h: kind === 'stone' ? h * 0.35 : kind === 'shrub' ? h * 1.1 : h, kind, seed: Math.floor(r() * 1e6)});
  }
  return out;
};

export interface GrassColors {
  dark: string;
  mid: string;
  dry: string;
  tip: string;
  haze: string;
}

/** One tuft of wind-blown grass as a depth-sorted billboard. */
export const tuftDrawable = (
  cam: Cam,
  frame: number,
  t: Tuft,
  col: GrassColors,
  haze: (d: number) => number,
  id: string,
  windMul = 1,
): Drawable | null => {
  const p = project(cam, t.x, 0, t.z);
  if (!p) return null;
  const hp = t.h * 1.4 * p.s;
  if (hp < 2.5 || p.x < -hp - 40 || p.x > W + hp + 40 || p.y - hp > 1200) return null;
  const time = (frame / FPS) * wind.speed;
  const gust = 0.5 + 0.5 * noise1(time * 0.25 + t.x * 0.02, 41);
  const hz = haze(p.d);
  const dark: string[] = [], dry: string[] = [];
  for (const b of t.blades) {
    const sway = -(0.1 + 0.22 * gust) * wind.strength * windMul + 0.07 * noise1(time * 1.3 + b.phase + t.x * 0.3, 5) * wind.strength;
    const a = b.lean + sway * (b.h / t.h);
    const bx = p.x + b.dx * p.s;
    const by = p.y;
    const tipX = bx + Math.sin(a) * b.h * p.s;
    const tipY = by - Math.cos(a) * b.h * p.s;
    const cx = bx + Math.sin(a * 0.45) * b.h * 0.55 * p.s;
    const cy = by - b.h * 0.58 * p.s;
    const w = Math.max(0.5, b.w * p.s);
    const d = `M${(bx - w).toFixed(1)} ${by.toFixed(1)}Q${(cx - w * 0.4).toFixed(1)} ${cy.toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}Q${(cx + w * 0.4).toFixed(1)} ${cy.toFixed(1)} ${(bx + w).toFixed(1)} ${by.toFixed(1)}Z`;
    (b.dry ? dry : dark).push(d);
  }
  const top = p.y - t.h * 1.2 * p.s;
  const kind = t.kind ?? 'grass';
  const sd = t.seed ?? 1;
  const extras: React.ReactNode[] = [];
  if (kind === 'stone') {
    const w = t.h * 2.2 * p.s, hh = t.h * 1.0 * p.s;
    return {
      key: id,
      depth: p.d,
      node: (
        <g>
          <ellipse cx={p.x} cy={p.y - hh * 0.1} rx={w * 0.62} ry={hh * 0.2} fill="#000" opacity={0.18} />
          <path d={`M${p.x - w * 0.5} ${p.y} C${p.x - w * 0.5} ${p.y - hh} ${p.x + w * 0.4} ${p.y - hh * 1.1} ${p.x + w * 0.5} ${p.y} Z`} fill={mix('#7D7A70', col.haze, hz)} />
          <path d={`M${p.x - w * 0.3} ${p.y - hh * 0.55} C${p.x - w * 0.1} ${p.y - hh * 0.95} ${p.x + w * 0.25} ${p.y - hh * 0.95} ${p.x + w * 0.38} ${p.y - hh * 0.5}`} stroke={mix('#B9B2A2', col.haze, hz)} strokeWidth={Math.max(0.6, hh * 0.12)} fill="none" opacity={0.7} />
        </g>
      ),
    };
  }
  if (kind === 'shrub') {
    // a low domed clump: many small leafy masses, darker at the base, catching light on top
    const blobs: React.ReactNode[] = [];
    const n = 16;
    const Wd = t.h * 1.5 * p.s, Ht = t.h * 0.9 * p.s;
    for (let k = 0; k < n; k++) {
      const u = (Math.sin(sd * 0.01 + k * 12.9898) * 43758.5453) % 1;
      const v = (Math.sin(sd * 0.02 + k * 78.233) * 12345.6789) % 1;
      const fx = Math.abs(u) - 0.5, fy = Math.abs(v);
      const hgt = Math.sqrt(Math.max(0, 1 - (fx * 2) ** 2)) * fy;
      const rr = (0.16 + 0.1 * (1 - hgt)) * Wd * 0.5;
      const sway2 = 0.03 * wind.strength * windMul * Ht * hgt * Math.sin(time * 1.2 + k + t.x);
      const cx = p.x + fx * Wd + sway2;
      const cy = p.y - hgt * Ht - rr * 0.3;
      const c = hgt > 0.55 ? col.mid : col.dark;
      blobs.push(<ellipse key={k} cx={cx} cy={cy} rx={rr} ry={rr * 0.78} fill={mix(c, col.haze, hz)} />);
      if (hgt > 0.6 && k % 2 === 0) blobs.push(<ellipse key={`l${k}`} cx={cx + rr * 0.3} cy={cy - rr * 0.35} rx={rr * 0.45} ry={rr * 0.3} fill={mix(col.tip, col.haze, hz)} opacity={0.3} />);
    }
    return {key: id, depth: p.d, node: <g>{blobs}</g>};
  }
  if (kind === 'seed' || kind === 'flower') {
    t.blades.forEach((b, k) => {
      if (k % 2) return;
      const sway = -(0.1 + 0.22 * gust) * wind.strength * windMul + 0.07 * noise1(time * 1.3 + b.phase + t.x * 0.3, 5) * wind.strength;
      const a = b.lean + sway * (b.h / t.h) * 1.25;
      const hh = b.h * 1.25;
      const tipX = p.x + b.dx * p.s + Math.sin(a) * hh * p.s;
      const tipY = p.y - Math.cos(a) * hh * p.s;
      const baseX = p.x + b.dx * p.s;
      extras.push(
        <path key={`s${k}`} d={`M${baseX.toFixed(1)} ${p.y.toFixed(1)}Q${(baseX + Math.sin(a * 0.5) * hh * 0.5 * p.s).toFixed(1)} ${(p.y - hh * 0.55 * p.s).toFixed(1)} ${tipX.toFixed(1)} ${tipY.toFixed(1)}`} stroke={mix(col.dry, col.haze, hz)} strokeWidth={Math.max(0.5, 0.006 * p.s)} fill="none" />,
      );
      if (kind === 'seed') {
        const L = 0.09 * p.s, Wd = 0.022 * p.s;
        extras.push(
          <ellipse key={`h${k}`} cx={tipX} cy={tipY} rx={Math.max(0.6, Wd)} ry={Math.max(1, L)} transform={`rotate(${(a * 180) / Math.PI + 12} ${tipX} ${tipY})`} fill={mix(col.tip, col.haze, hz)} />,
        );
      } else {
        const fr = Math.max(0.7, 0.018 * p.s);
        extras.push(<circle key={`f${k}`} cx={tipX} cy={tipY} r={fr} fill={mix(k % 4 === 0 ? '#E9D9A6' : '#F0E8D4', col.haze, hz)} />);
      }
    });
  }
  return {
    key: id,
    depth: p.d,
    node: (
      <g>
        <defs>
          <linearGradient id={`${id}-a`} x1={0} y1={p.y} x2={0} y2={top} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={mix(col.dark, col.haze, hz)} />
            <stop offset={1} stopColor={mix(col.mid, col.haze, hz)} />
          </linearGradient>
          <linearGradient id={`${id}-b`} x1={0} y1={p.y} x2={0} y2={top} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={mix(col.mid, col.haze, hz)} />
            <stop offset={0.7} stopColor={mix(col.dry, col.haze, hz)} />
            <stop offset={1} stopColor={mix(col.tip, col.haze, hz)} />
          </linearGradient>
        </defs>
        {dark.length > 0 && <path d={dark.join('')} fill={`url(#${id}-a)`} />}
        {dry.length > 0 && <path d={dry.join('')} fill={`url(#${id}-b)`} />}
        {extras}
      </g>
    ),
  };
};
