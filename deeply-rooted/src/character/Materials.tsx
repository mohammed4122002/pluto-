import React from 'react';
import {staticFile} from 'remotion';

/**
 * Material system for the character (quality upgrade).
 * Every garment / skin surface gets: its own fabric grain, a painterly brush-stroke layer and
 * volume shading (lit side → shadow side). All in centimetres inside the character's y-up space,
 * so textures stay glued to the body as he moves (no "shower-door" screen textures).
 */
export type MatKind = 'wool' | 'knit' | 'twill' | 'canvas' | 'leather' | 'skin' | 'hair';

const TILE: Record<string, [string, number, number]> = {
  // id: [texture, tile size (cm), rotation]
  wool: ['wool.png', 9, 0],
  knit: ['knit.png', 13, 0],
  twill: ['twill.png', 7, 0],
  canvas: ['canvas_weave.png', 5, 0],
  leather: ['leather.png', 7, 0],
  skin: ['skin_pores.png', 5, 0],
  strokesV: ['paint_strokes.png', 34, 90],
  strokesH: ['paint_strokes.png', 30, 8],
  stubble: ['stubble.png', 5.5, 0],
};

export const MaterialDefs: React.FC<{uid: string}> = ({uid}) => (
  <defs>
    {Object.entries(TILE).map(([k, [file, size, rot]]) => (
      <pattern key={k} id={`${uid}-tx-${k}`} patternUnits="userSpaceOnUse" width={size} height={size} patternTransform={`rotate(${rot}) scale(1 -1)`}>
        <image href={staticFile(`textures/${file}`)} width={size} height={size} preserveAspectRatio="none" />
      </pattern>
    ))}
    {/* volume shading: shadow on the far (left) side, warm light on the near/rim (right) side */}
    <linearGradient id={`${uid}-volH`} x1={0} y1={0} x2={1} y2={0}>
      <stop offset={0} stopColor="#0E0F12" stopOpacity={0.34} />
      <stop offset={0.45} stopColor="#0E0F12" stopOpacity={0.06} />
      <stop offset={0.8} stopColor="#FFF1DC" stopOpacity={0} />
      <stop offset={1} stopColor="#FFF1DC" stopOpacity={0.12} />
    </linearGradient>
    {/* y-up space: offset 0 = bottom of the shape, 1 = top */}
    <linearGradient id={`${uid}-volV`} x1={0} y1={0} x2={0} y2={1}>
      <stop offset={0} stopColor="#0E0F12" stopOpacity={0.22} />
      <stop offset={0.5} stopColor="#0E0F12" stopOpacity={0} />
      <stop offset={1} stopColor="#FFF4E2" stopOpacity={0.08} />
    </linearGradient>
    <filter id={`${uid}-soft06`} x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation={0.6} />
    </filter>
    <filter id={`${uid}-soft03`} x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation={0.28} />
    </filter>
    <filter id={`${uid}-soft12`} x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation={1.2} />
    </filter>
  </defs>
);

const GRAIN: Record<MatKind, [string, number, string | null, number]> = {
  // kind: [texture, grain opacity, stroke layer, stroke opacity]
  wool: ['wool', 0.32, 'strokesV', 0.2],
  knit: ['knit', 0.42, 'strokesV', 0.1],
  twill: ['twill', 0.35, 'strokesV', 0.18],
  canvas: ['canvas', 0.5, 'strokesH', 0.2],
  leather: ['leather', 0.45, 'strokesH', 0.3],
  skin: ['skin', 0.22, 'strokesH', 0.1],
  hair: ['wool', 0.15, 'strokesH', 0.18],
};

/** Texture + painterly strokes + volume over a part (colour pass only). */
export const Mat: React.FC<{uid: string; d: string; kind: MatKind; vol?: boolean; volV?: boolean; strength?: number}> = ({
  uid,
  d,
  kind,
  vol = true,
  volV = true,
  strength = 1,
}) => {
  const [tx, op, st, sop] = GRAIN[kind];
  return (
    <g style={{pointerEvents: 'none'}}>
      <path d={d} fill={`url(#${uid}-tx-${tx})`} opacity={op * strength} style={{mixBlendMode: 'soft-light'}} />
      {st && <path d={d} fill={`url(#${uid}-tx-${st})`} opacity={sop * strength} style={{mixBlendMode: 'soft-light'}} />}
      {vol && <path d={d} fill={`url(#${uid}-volH)`} />}
      {volV && <path d={d} fill={`url(#${uid}-volV)`} />}
    </g>
  );
};
