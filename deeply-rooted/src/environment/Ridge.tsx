import React from 'react';
import {staticFile} from 'remotion';
import {Cam, project} from '../engine/camera';
import {mix} from '../engine/color';
import {Drawable} from '../engine/DepthStack';
import {fbm1, hash} from '../engine/noise';
import {Light, RidgeDef} from './types';

/** Height (m) of a ridge at world x. */
export const ridgeHeight = (def: RidgeDef, x: number) => {
  if (def.profile) {
    const pr = def.profile;
    let h = pr[0][1];
    for (let i = 0; i < pr.length - 1; i++) {
      if (x >= pr[i][0] && x <= pr[i + 1][0]) {
        const t = (x - pr[i][0]) / (pr[i + 1][0] - pr[i][0]);
        const u = t * t * (3 - 2 * t);
        h = pr[i][1] + (pr[i + 1][1] - pr[i][1]) * u;
      }
    }
    if (x > pr[pr.length - 1][0]) h = pr[pr.length - 1][1];
    return h + def.amp * 0.25 * fbm1(x * def.freq * 3, def.seed, 3);
  }
  return def.base + def.amp * (0.5 + 0.62 * fbm1(x * def.freq, def.seed, 5) + 0.18 * fbm1(x * def.freq * 4.3, def.seed + 9, 3));
};

/** A painted ridgeline / hill band standing at depth `z`. */
export const ridgeDrawable = (cam: Cam, def: RidgeDef, light: Light, haze: (d: number) => number, id: string): Drawable | null => {
  const d = def.z - cam.z;
  if (d < 1) return null;
  const N = 140;
  const top: string[] = [];
  let minY = Infinity;
  const heightAt = (x: number) => ridgeHeight(def, x);
  for (let i = 0; i <= N; i++) {
    const x = def.x0 + ((def.x1 - def.x0) * i) / N;
    const p = project(cam, x, Math.max(0, heightAt(x)), def.z)!;
    top.push(`${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    minY = Math.min(minY, p.y);
  }
  const bl = project(cam, def.x0, 0, def.z)!;
  const br = project(cam, def.x1, 0, def.z)!;
  const baseY = bl.y + 6;
  const path = `${top.join('')}L${br.x.toFixed(1)} ${baseY.toFixed(1)}L${bl.x.toFixed(1)} ${baseY.toFixed(1)}Z`;
  const h = haze(d);
  const cTop = mix(def.color, light.groundFar, h);
  // near hills (with an explicit profile) melt into the ground at their foot; far ridges into the haze
  const cBase = def.profile ? mix(light.ground, light.groundFar, h) : mix(def.color, light.haze, Math.min(1, h + 0.25));
  const anchor = project(cam, 0, 0, def.z)!;

  const trees: React.ReactNode[] = [];
  if (def.trees) {
    const count = Math.round(((def.x1 - def.x0) / 100) * def.trees);
    for (let i = 0; i < count; i++) {
      const x = def.x0 + (def.x1 - def.x0) * hash(i, def.seed + 3);
      const drop = hash(i, def.seed + 5) * 0.55;
      const y = Math.max(0, heightAt(x)) * (1 - drop);
      const p = project(cam, x, y, def.z)!;
      const r = (1.1 + hash(i, def.seed + 7) * 1.3) * p.s;
      if (r < 0.6) continue;
      trees.push(<ellipse key={i} cx={p.x} cy={p.y - r * 0.55} rx={r} ry={r * 0.72} fill={mix(def.color, light.ground, 0.35)} opacity={0.42} />);
    }
  }
  const tex = 900 * Math.min(4, Math.max(0.6, anchor.s / 3));
  return {
    key: id,
    depth: d,
    node: (
      <g>
        <defs>
          <linearGradient id={`${id}-f`} x1={0} y1={minY} x2={0} y2={baseY} gradientUnits="userSpaceOnUse">
            <stop offset={0} stopColor={cTop} />
            <stop offset={1} stopColor={cBase} />
          </linearGradient>
          <pattern id={`${id}-t`} patternUnits="userSpaceOnUse" width={tex} height={tex * 0.625} x={anchor.x} y={minY}>
            <image href={staticFile('textures/brush.png')} width={tex} height={tex * 0.625} preserveAspectRatio="none" />
          </pattern>
        </defs>
        <path d={path} fill={`url(#${id}-f)`} />
        <g opacity={Math.max(0, 0.6 - h * 0.5)}>{trees}</g>
        <path d={path} fill={`url(#${id}-t)`} opacity={0.16 * (1 - h * 0.6)} style={{mixBlendMode: 'soft-light'}} />
      </g>
    ),
  };
};
