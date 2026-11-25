import React from 'react';
import {staticFile} from 'remotion';
import {FPS, W, fog as fogCfg} from '../config/production';
import {Cam, project} from '../engine/camera';
import {Drawable} from '../engine/DepthStack';
import {FogDef} from './types';

/** A drifting, horizontally tiling fog plane at a fixed depth (true parallax). */
export const fogDrawable = (cam: Cam, frame: number, def: FogDef, color: string, opacityMul: number, id: string): Drawable | null => {
  const d = def.z - cam.z;
  if (d < 0.6) return null;
  const pb = project(cam, cam.x, def.y0, def.z)!;
  const pt = project(cam, cam.x, def.y0 + def.height, def.z)!;
  const s = pb.s;
  const tileW = def.tileWidth;
  const off = ((((frame / FPS) * def.speed * fogCfg.driftSpeed + (def.x0 ?? 0)) % tileW) + tileW) % tileW;
  const xMin = cam.x - W / 2 / s - tileW, xMax = cam.x + W / 2 / s + tileW;
  const k0 = Math.floor((xMin - off) / tileW), k1 = Math.ceil((xMax - off) / tileW);
  const op = def.opacity * fogCfg.density * opacityMul;
  if (op <= 0.003) return null;
  const tiles: React.ReactNode[] = [];
  for (let k = k0; k <= k1; k++) {
    const X = k * tileW + off;
    const sx = W / 2 + (X - cam.x) * s;
    tiles.push(
      <image key={k} href={staticFile(`textures/${def.tex}.png`)} x={sx} y={pt.y} width={tileW * s + 1} height={pb.y - pt.y} preserveAspectRatio="none" />,
    );
  }
  return {
    key: id,
    depth: d,
    node: (
      <g>
        <defs>
          <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x={-W} y={-4000} width={W * 3} height={9000}>
            {tiles}
          </mask>
        </defs>
        <rect x={-W} y={pt.y} width={W * 3} height={pb.y - pt.y} fill={color} opacity={Math.min(1, op)} mask={`url(#${id}-m)`} />
      </g>
    ),
  };
};
