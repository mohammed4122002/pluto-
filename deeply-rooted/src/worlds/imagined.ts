// THE IMAGINED FUTURE — the life he planned: a clear path to a flourishing olive tree in warm light.
import {camera, H, W, fog as fogCfg, lighting} from '../config/production';
import {Cam, project} from '../engine/camera';
import {makePatches} from '../environment/Ground';
import {makeTufts} from '../environment/Grass';
import {catmull} from '../environment/geometry';
import {ridgeHeight} from '../environment/Ridge';
import {FogDef, PathDef, RidgeDef} from '../environment/types';

export const IMAGINED_LIGHT = lighting.imagined;

export const imaginedPath: PathDef = {
  pts: [[-0.8, -4], [-0.1, 2], [0.9, 7], [1.9, 12.5], [0.8, 19.5], [-1.2, 27], [-0.8, 35.5], [1.4, 44], [3.6, 50.5], [5.4, 55], [6.1, 57.4]],
  width: 1.55,
  seed: 8,
};

export const imaginedTree = {x: 6.5, y: 1.3, z: 58.6};

export const imaginedRidges: RidgeDef[] = [
  {z: 1500, x0: -1300, x1: 1300, base: 40, amp: 110, freq: 0.0024, seed: 51, color: '#B9AE9E'},
  {z: 560, x0: -600, x1: 600, base: 12, amp: 30, freq: 0.006, seed: 52, color: '#A39B7C'},
  {z: 200, x0: -240, x1: 240, base: 3, amp: 12, freq: 0.014, seed: 53, color: '#8D8A62', trees: 7},
  {
    z: 64,
    x0: -80,
    x1: 90,
    base: 0,
    amp: 0.5,
    freq: 0.06,
    seed: 54,
    color: '#878555',
    profile: [[-80, 0.3], [-30, 0.6], [-8, 0.9], [2, 1.5], [6.5, 1.9], [12, 1.6], [26, 0.9], [90, 0.3]],
  },
];

export const imaginedFog: FogDef[] = [
  {z: 700, y0: -2, height: 50, tileWidth: 1000, tex: 'fog_bank_2', speed: -0.8, opacity: 0.38},
  {z: 260, y0: -1, height: 18, tileWidth: 420, tex: 'fog_wisp_0', speed: -0.5, opacity: 0.22},
];

export const imaginedPatches = makePatches(61, 240, -60, 60, 0, 200, ['#6E6C45', '#8B8655', '#A39A68', '#7A7A4E', '#B5A676']);

export const imaginedTufts = makeTufts(
  71,
  430,
  {x0: -22, x1: 26, z0: 1.2, z1: 62},
  [imaginedPath],
  {minH: 0.25, maxH: 0.7, dry: 0.5, avoid: 0.3, tallChance: 0.1},
);
export const imaginedGrass = {dark: '#5B5E3E', mid: '#7E7D4E', dry: '#C3AE80', tip: '#E6CF9C', haze: IMAGINED_LIGHT.groundFar};

export const imaginedHaze = (d: number) => 0.82 * (1 - Math.exp(-d * fogCfg.imaginedHaze * fogCfg.density));

/** The imagined world's camera at the instant the map dissolves into it. */
export const matchCam: Cam = {
  ...camera.imagined.from,
  f: camera.imagined.f,
  horizon: camera.imagined.horizon,
  focus: 12,
  aperture: camera.imagined.aperture,
};

/** Screen-space geometry of the imagined world as seen from matchCam — the map is drawn from this. */
export const mapArtGeometry = () => {
  const c = matchCam;
  const route = catmull(imaginedPath.pts, 14)
    .map(([x, z]) => project(c, x, 0, z))
    .filter((p): p is NonNullable<typeof p> => !!p && p.y < H + 30)
    .map((p) => [p.x, p.y] as [number, number]);
  const ridges = imaginedRidges.slice(1).map((r) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 90; i++) {
      const x = r.x0 + ((r.x1 - r.x0) * i) / 90;
      const p = project(c, x, ridgeHeight(r, x), r.z)!;
      if (p.x > -200 && p.x < W + 200) pts.push([p.x, p.y]);
    }
    return pts;
  });
  const tb = project(c, imaginedTree.x, imaginedTree.y, imaginedTree.z)!;
  return {route, ridges, tree: {x: tb.x, y: tb.y, s: tb.s}};
};
