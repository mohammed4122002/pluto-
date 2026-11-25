import {lighting} from '../config/production';
export type Light = (typeof lighting)['present'];

export interface PathDef {
  pts: [number, number][]; // centreline on the ground (x, z) in metres
  width: number;
  seed: number;
}

export interface RidgeDef {
  z: number;
  x0: number;
  x1: number;
  base: number; // base height (m)
  amp: number; // height variation (m)
  freq: number; // features per metre
  seed: number;
  color: string;
  trees?: number; // little tree silhouettes per 100 m
  profile?: [number, number][]; // optional explicit (x, height) control points
}

export interface FogDef {
  z: number;
  y0: number; // bottom of the fog plane (m)
  height: number; // (m)
  tileWidth: number; // world width of one texture tile (m)
  tex: string;
  speed: number; // drift (m/s); negative drifts left
  opacity: number;
  x0?: number;
}
