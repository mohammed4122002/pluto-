// PRESENT DAY — the crossroads in the mist, just before sunrise (Scenes 01, 02, end of 03).
import {JUNCTION_Z, fog as fogCfg, lighting} from '../config/production';
import {makeDabs, makePatches} from '../environment/Ground';
import {makeTufts} from '../environment/Grass';
import {FogDef, PathDef, RidgeDef} from '../environment/types';

const J = JUNCTION_Z;
export const PRESENT_LIGHT = lighting.present;

export const presentPaths: PathDef[] = [
  // the road he came along (runs under the opening camera)
  {pts: [[0, J], [-0.2, J - 8], [-0.9, J - 16], [-1.6, J - 24], [-1.9, J - 32], [-1.8, J - 42], [-1.5, J - 54]], width: 1.7, seed: 1},
  // near-left, leaves frame toward the left
  {pts: [[0, J], [-3.2, J - 3.6], [-8.5, J - 6], [-16, J - 8], [-26, J - 9], [-44, J - 8]], width: 1.15, seed: 2},
  // far-left, toward the olive tree in the mist
  {pts: [[0, J], [-2.4, J + 7], [-5.4, J + 18], [-8.0, J + 32], [-9.6, J + 48], [-10.4, J + 62], [-14, J + 90], [-24, J + 130]], width: 1.25, seed: 3},
  // straight ahead into the fog
  {pts: [[0, J], [1.6, J + 10], [0.6, J + 22], [3.2, J + 38], [2.0, J + 62], [6.5, J + 100], [4, J + 170]], width: 1.3, seed: 4},
  // right, curving away
  {pts: [[0, J], [4.2, J + 3], [10.5, J + 7], [18.5, J + 13], [31, J + 22], [50, J + 38], [74, J + 60]], width: 1.2, seed: 5},
];

export const presentTree = {x: -11.6, y: 1.0, z: J + 66};

export const presentRidges: RidgeDef[] = [
  {z: 1700, x0: -1400, x1: 1400, base: 60, amp: 140, freq: 0.0021, seed: 11, color: '#6F777E'},
  {z: 760, x0: -700, x1: 700, base: 22, amp: 46, freq: 0.0052, seed: 12, color: '#636B6E'},
  {z: 300, x0: -320, x1: 320, base: 5, amp: 15, freq: 0.012, seed: 13, color: '#5C6358', trees: 5},
  {
    z: J + 70,
    x0: -90,
    x1: 40,
    base: 0,
    amp: 0.6,
    freq: 0.05,
    seed: 14,
    color: '#596050',
    profile: [[-90, 0.3], [-40, 0.7], [-20, 1.5], [-11.6, 1.9], [-3, 1.2], [8, 0.4], [40, 0.2]],
  },
];

export const presentFog: FogDef[] = [
  {z: 640, y0: 0, height: 60, tileWidth: 900, tex: 'fog_bank_2', speed: -1.2, opacity: 0.85},
  {z: 240, y0: 0, height: 26, tileWidth: 360, tex: 'fog_bank_1', speed: -0.7, opacity: 0.8},
  {z: 140, y0: 0, height: 15, tileWidth: 220, tex: 'fog_bank_0', speed: -0.55, opacity: 0.75},
  {z: J + 80, y0: 0, height: 9, tileWidth: 130, tex: 'fog_bank_1', speed: -0.48, opacity: 0.55, x0: 40},
  {z: J + 58, y0: 0, height: 6.5, tileWidth: 95, tex: 'fog_bank_2', speed: -0.42, opacity: 0.6},
  {z: J + 30, y0: 0, height: 4.2, tileWidth: 70, tex: 'fog_wisp_0', speed: -0.36, opacity: 0.5, x0: 20},
  {z: J + 12, y0: 0, height: 3.0, tileWidth: 48, tex: 'fog_bank_0', speed: -0.3, opacity: 0.42, x0: 8},
  // low ground mist around his boots
  {z: J - 1.2, y0: -0.15, height: 0.9, tileWidth: 22, tex: 'fog_bank_1', speed: -0.22, opacity: 0.38},
  {z: J - 9, y0: -0.15, height: 1.6, tileWidth: 30, tex: 'fog_bank_0', speed: -0.26, opacity: 0.32, x0: 11},
  {z: J - 20, y0: -0.2, height: 2.4, tileWidth: 40, tex: 'fog_wisp_1', speed: -0.3, opacity: 0.26, x0: 3},
  // eye-level wisps between the medium-shot camera and him (Scene 02 foreground depth)
  {z: J - 2.3, y0: 1.05, height: 1.1, tileWidth: 9, tex: 'fog_wisp_1', speed: -0.16, opacity: 0.2, x0: 2},
  {z: J - 1.1, y0: 1.25, height: 0.75, tileWidth: 5, tex: 'fog_wisp_0', speed: -0.12, opacity: 0.16, x0: 1},
];

export const presentPatches = makePatches(21, 260, -60, 60, 0, 200, ['#3F4537', '#5E644F', '#6E705C', '#4A5242', '#7C7B66']);

export const presentTufts = makeTufts(
  31,
  900,
  {x0: -34, x1: 34, z0: J - 31, z1: J + 80},
  presentPaths,
  {minH: 0.16, maxH: 0.55, dry: 0.42, avoid: 0.2, tallChance: 0.12, mix: {grass: 6, seed: 2.2, shrub: 0.9, stone: 0.6}},
).concat(
  // foreground framing: tall seed-grasses along the sides of the opening dolly (they sweep past the lens)
  makeTufts(37, 60, {x0: -7.5, x1: 3.5, z0: 17, z1: 34}, presentPaths, {minH: 0.75, maxH: 1.25, dry: 0.75, avoid: 1.6, tallChance: 0, mix: {seed: 3, grass: 1}}),
);
export const presentDabs = makeDabs(41, 900, -50, 50, J - 32, J + 120, ['#3B4133', '#57604A', '#6B6D58', '#7F7C66', '#4D5544', '#8D8A75']);
export const presentGrass = {dark: '#3C4234', mid: '#5D6450', dry: '#8D8670', tip: '#B7AC93', haze: PRESENT_LIGHT.groundFar};

export const presentHaze = (d: number) => 0.9 * (1 - Math.exp(-d * fogCfg.presentHaze * fogCfg.density));

export const WALKER_POS = {x: 0.45, z: J};
