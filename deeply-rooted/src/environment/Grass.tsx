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
export interface Tuft {
  x: number;
  z: number;
  blades: Blade[];
  h: number;
}

export const makeTufts = (
  seed: number,
  n: number,
  area: {x0: number; x1: number; z0: number; z1: number},
  paths: PathDef[],
  opt: {minH: number; maxH: number; dry: number; avoid: number; tallChance?: number},
): Tuft[] => {
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
    out.push({x, z, blades, h});
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
      </g>
    ),
  };
};
