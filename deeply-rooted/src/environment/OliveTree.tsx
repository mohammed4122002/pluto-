import React from 'react';
import {FPS, wind} from '../config/production';
import {mix} from '../engine/color';
import {hash, noise1} from '../engine/noise';
import {tones} from '../config/palette';

/**
 * THE OLIVE TREE — the film's recurring anchor.
 * One asset, used in the present-day mist (distant), the imagined future (flourishing),
 * and as the destination glyph on the paper map. Drawn in metres, y-up, origin at trunk base.
 * Olive trees regrow from their roots after being cut — the visual promise of "beginning again".
 */

// [x, y, rx, ry] canopy clusters (metres)
const CLUSTERS: [number, number, number, number][] = [
  [-3.1, 3.05, 0.95, 0.62],
  [3.3, 3.15, 0.95, 0.62],
  [-2.4, 3.65, 1.3, 0.88],
  [2.7, 3.75, 1.2, 0.85],
  [-0.6, 3.65, 1.2, 0.72],
  [1.0, 3.75, 1.2, 0.74],
  [-2.95, 4.45, 0.85, 0.56],
  [-1.2, 4.45, 1.5, 0.98],
  [1.6, 4.55, 1.5, 0.95],
  [2.6, 4.95, 0.85, 0.52],
  [0.2, 4.95, 1.6, 1.0],
  [-1.9, 5.15, 1.0, 0.64],
  [1.2, 5.45, 1.1, 0.64],
  [-0.3, 5.75, 0.95, 0.56],
];

const TRUNK =
  'M-0.78 0 C-0.52 0.16 -0.44 0.5 -0.38 0.9 C-0.32 1.3 -0.6 1.62 -0.95 2.2 C-1.2 2.66 -1.55 3.0 -1.85 3.32 L-1.58 3.42 ' +
  'C-1.2 2.98 -0.8 2.55 -0.47 2.18 C-0.3 2.6 -0.14 3.25 -0.1 3.95 L0.17 3.97 C0.2 3.3 0.26 2.66 0.42 2.22 ' +
  'C0.74 2.62 1.08 3.12 1.32 3.6 L1.56 3.5 C1.28 2.9 0.94 2.32 0.58 1.78 C0.4 1.42 0.45 0.92 0.52 0.56 C0.58 0.26 0.74 0.1 0.96 0 Z';

const BARK_LINES = [
  'M-0.45 0.1 C-0.32 0.6 -0.38 1.1 -0.6 1.7',
  'M0.1 0.05 C0.2 0.5 0.0 1.0 0.05 1.6',
  'M0.42 0.2 C0.36 0.7 0.48 1.2 0.6 1.8',
  'M-0.75 2.4 C-1.0 2.7 -1.25 2.95 -1.5 3.2',
  'M0.7 2.5 C0.9 2.8 1.1 3.1 1.3 3.4',
];

const blob = (cx: number, cy: number, rx: number, ry: number, seed: number, t: number) => {
  const N = 40;
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r =
      1 +
      0.16 * noise1(Math.cos(a) * 1.7 + seed * 3.1 + t * 0.15, seed) +
      0.08 * Math.abs(Math.sin(a * 6.5 + seed)) +
      0.06 * noise1(a * 7 + t * 1.1, seed + 9);
    pts.push(`${(cx + Math.cos(a) * rx * r).toFixed(3)} ${(cy + Math.sin(a) * ry * r).toFixed(3)}`);
  }
  return `M${pts.join('L')}Z`;
};

export interface TreeLook {
  lush: number; // canopy fullness (0.85 present ... 1.08 imagined)
  hazeColor: string;
  haze: number; // 0..1 atmospheric mix
  lightColor: string; // colour of the light catching the leaves
  lightAmount: number; // 0..1
  lightDir: number; // -1 light from left, +1 from right
  shadow?: boolean;
  detail: number; // pixels per metre (chooses leaf detail)
}

export const OliveTree: React.FC<{x: number; y: number; s: number; frame: number; look: TreeLook; seed?: number}> = ({
  x,
  y,
  s,
  frame,
  look,
  seed = 7,
}) => {
  const t = (frame / FPS) * wind.speed;
  const H = (c: string) => mix(c, look.hazeColor, look.haze);
  const lit = mix(tones.leafSilver, look.lightColor, look.lightAmount * 0.55);
  const fine = look.detail > 25;
  const veryFine = look.detail > 55;
  const sway = wind.strength * 0.05;
  return (
    <g transform={`translate(${x} ${y}) scale(${s} ${-s})`}>
      {look.shadow && <ellipse cx={-1.6} cy={-0.05} rx={4.6} ry={0.5} fill={mix(tones.leafDark, look.hazeColor, look.haze * 0.6)} opacity={0.35} />}
      <path d={TRUNK} fill={H(tones.bark)} />
      <path d={TRUNK} fill={H(tones.barkLight)} opacity={0.5 * look.lightAmount} transform={`translate(${0.07 * look.lightDir} 0)`} style={{mixBlendMode: 'screen'}} />
      {fine &&
        BARK_LINES.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={H('#3E3832')} strokeWidth={0.045} strokeLinecap="round" opacity={0.6} />
        ))}
      {fine && <ellipse cx={0.05} cy={1.15} rx={0.13} ry={0.22} fill={H('#2F2B27')} opacity={0.7} />}
      {CLUSTERS.map(([cx0, cy0, rx0, ry0], i) => {
        const dx = sway * noise1(t * 0.7 + i * 1.7, 11) + sway * 0.6 * (cy0 / 5);
        const dy = sway * 0.4 * noise1(t * 0.9 + i, 12);
        const cx = cx0 * (0.92 + 0.08 * look.lush) + dx;
        const cy = cy0 + dy;
        const rx = rx0 * look.lush;
        const ry = ry0 * look.lush;
        const leaves: React.ReactNode[] = [];
        if (fine) {
          const n = veryFine ? 26 : 12;
          for (let k = 0; k < n; k++) {
            const a = hash(k, i * 13 + seed) * Math.PI * 2;
            const rr = Math.sqrt(hash(k, i * 7 + seed + 1));
            const lx = cx + Math.cos(a) * rx * rr * 0.95;
            const ly = cy + Math.sin(a) * ry * rr * 0.95;
            const side = (lx - cx) * look.lightDir + (ly - cy) * 0.8;
            const flick = 0.5 + 0.5 * noise1(t * 2.2 + k * 0.9 + i, 31);
            leaves.push(
              <ellipse
                key={k}
                cx={lx}
                cy={ly}
                rx={0.11}
                ry={0.035}
                transform={`rotate(${(hash(k, i + 99) - 0.5) * 120 + flick * 20} ${lx} ${ly})`}
                fill={side > 0 ? H(lit) : H(tones.leafDark)}
                opacity={side > 0 ? 0.55 + 0.35 * flick : 0.6}
              />,
            );
          }
        }
        return (
          <g key={i}>
            <path d={blob(cx, cy, rx, ry, i + seed, t)} fill={H(tones.leafDark)} />
            <path
              d={blob(cx + 0.16 * look.lightDir * rx, cy + 0.14 * ry, rx * 0.78, ry * 0.72, i + seed + 40, t)}
              fill={H(tones.leaf)}
              opacity={0.9}
            />
            <path
              d={blob(cx + 0.3 * look.lightDir * rx, cy + 0.3 * ry, rx * 0.5, ry * 0.42, i + seed + 80, t)}
              fill={H(lit)}
              opacity={0.35 + 0.45 * look.lightAmount}
            />
            {leaves}
          </g>
        );
      })}
    </g>
  );
};

/** Height of the tree's canopy top (m) — used for framing. */
export const TREE_HEIGHT = 6.4;
