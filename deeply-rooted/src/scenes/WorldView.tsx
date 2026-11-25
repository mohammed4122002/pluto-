import React from 'react';
import {H} from '../config/production';
import {Cam, blurAt, groundDepthAtY, project} from '../engine/camera';
import {Drawable, DepthStack} from '../engine/DepthStack';
import {fogDrawable} from '../environment/Fog';
import {GrassColors, Tuft, tuftDrawable} from '../environment/Grass';
import {GroundLayer, Patch} from '../environment/Ground';
import {OliveTree, TreeLook} from '../environment/OliveTree';
import {ridgeDrawable} from '../environment/Ridge';
import {Sky} from '../environment/Sky';
import {FogDef, Light, PathDef, RidgeDef} from '../environment/types';
import {Lit} from '../character/Lighting';
import {Pose34, Walker34, WALKER34_BOUNDS} from '../character/Walker34';
import {W} from '../config/production';

export interface World {
  id: string;
  light: Light;
  paths: PathDef[];
  patches: Patch[];
  ridges: RidgeDef[];
  fog: FogDef[];
  tufts: Tuft[];
  grass: GrassColors;
  haze: (d: number) => number;
  tree: {x: number; y: number; z: number};
  treeLook: Omit<TreeLook, 'haze' | 'hazeColor' | 'detail'>;
}

/** Renders one world from one camera: sky → ground → depth-sorted layers with depth of field. */
export const WorldView: React.FC<{
  world: World;
  cam: Cam;
  frame: number;
  extras?: Drawable[];
  fogMul?: number;
  glowBoost?: number;
  maxBlur?: number;
}> = ({world, cam, frame, extras = [], fogMul = 1, glowBoost = 1, maxBlur}) => {
  const L = world.light;
  const items: Drawable[] = [];
  world.ridges.forEach((r, i) => {
    const d = ridgeDrawable(cam, r, L, world.haze, `${world.id}-r${i}`);
    if (d) items.push(d);
  });
  world.fog.forEach((f, i) => {
    const d = fogDrawable(cam, frame, f, L.haze, fogMul, `${world.id}-f${i}`);
    if (d) items.push(d);
  });
  world.tufts.forEach((t, i) => {
    const d = tuftDrawable(cam, frame, t, world.grass, world.haze, `${world.id}-t${i}`);
    if (d) items.push(d);
  });
  const tp = project(cam, world.tree.x, world.tree.y, world.tree.z);
  if (tp) {
    items.push({
      key: `${world.id}-tree`,
      depth: tp.d,
      node: (
        <OliveTree
          x={tp.x}
          y={tp.y}
          s={tp.s}
          frame={frame}
          look={{...world.treeLook, hazeColor: L.groundFar, haze: Math.min(0.95, world.haze(tp.d) * 1.05), detail: tp.s}}
        />
      ),
    });
  }
  items.push(...extras);
  const gd = Math.max(2, groundDepthAtY(cam, (cam.horizon + H) / 2));
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <Sky cam={cam} light={L} frame={frame} id={`${world.id}-sky`} glowBoost={glowBoost} />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, filter: `blur(${Math.min(maxBlur ?? 22, blurAt(cam, gd)).toFixed(1)}px)`}}>
        <GroundLayer cam={cam} light={L} paths={world.paths} patches={world.patches} haze={world.haze} id={`${world.id}-gr`} />
      </svg>
      <DepthStack cam={cam} items={items} maxBlur={maxBlur} />
    </div>
  );
};

/** The Walker standing in a world at (x, z), lit by that world's light. */
export const walkerDrawable = (
  cam: Cam,
  world: World,
  pose: Pose34,
  pos: {x: number; z: number},
  id: string,
  extraHaze = 0,
): Drawable | null => {
  const p = project(cam, pos.x, 0, pos.z);
  if (!p) return null;
  const k = p.s / 100; // px per cm
  const L = world.light;
  return {
    key: id,
    depth: p.d,
    node: (
      <g transform={`translate(${p.x} ${p.y}) scale(${k} ${-k})`}>
        <Lit
          id={id}
          bounds={WALKER34_BOUNDS}
          light={{
            rim: L.rim,
            rimStrength: L.rimStrength * (k > 4 ? 0.8 : 1),
            rimWidth: Math.max(0.5, 1.6 / k),
            rimDir: 1,
            fill: L.fill,
            fillStrength: 0.28,
            haze: L.groundFar,
            hazeAmount: Math.min(0.9, world.haze(p.d) * 0.55 + extraHaze),
            texture: 0.22,
          }}
          render={(m) => <Walker34 mode={m} p={{...pose, detail: k > 2.2 ? 1 : 0}} uid={id} />}
        />
      </g>
    ),
  };
};
