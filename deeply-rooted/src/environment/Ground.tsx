import React from 'react';
import {H, W} from '../config/production';
import {Cam, groundY, project} from '../engine/camera';
import {mix} from '../engine/color';
import {rng} from '../engine/noise';
import {groundPolyToSvg, ribbon} from './geometry';
import {Light, PathDef} from './types';

export interface Patch {
  x: number;
  z: number;
  rx: number;
  rz: number;
  color: string;
  opacity: number;
}

export const makePatches = (seed: number, n: number, x0: number, x1: number, z0: number, z1: number, colors: string[]): Patch[] => {
  const r = rng(seed);
  return Array.from({length: n}, () => {
    const z = z0 + (z1 - z0) * Math.pow(r(), 1.5);
    const size = 1.5 + r() * 6 + z * 0.06;
    return {
      x: x0 + (x1 - x0) * r(),
      z,
      rx: size * (1.2 + r()),
      rz: size * (0.5 + r() * 0.6),
      color: colors[Math.floor(r() * colors.length)],
      opacity: 0.18 + r() * 0.3,
    };
  });
};

const DEPTHS = [3, 5, 8, 12, 18, 26, 38, 55, 80, 120, 180, 300, 600, 1500];

/** The ground plane: depth-graded base, painted patches and the projected paths. */
export const GroundLayer: React.FC<{
  cam: Cam;
  light: Light;
  paths: PathDef[];
  patches: Patch[];
  haze: (d: number) => number;
  id: string;
  pathOpacity?: number;
}> = ({cam, light, paths, patches, haze, id, pathOpacity = 1}) => {
  const hz = cam.horizon;
  const stops = DEPTHS.map((d) => ({o: Math.min(1, Math.max(0, (groundY(cam, d) - hz) / (H - hz))), d})).sort((a, b) => a.o - b.o);
  const stopsFor = (near: string) =>
    stops.map((s, i) => <stop key={i} offset={s.o} stopColor={mix(near, light.groundFar, haze(s.d))} />);

  return (
    <g>
      <defs>
        <linearGradient id={`${id}-g`} x1={0} y1={hz} x2={0} y2={H} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={light.groundFar} />
          {stopsFor(light.ground)}
        </linearGradient>
        <linearGradient id={`${id}-p`} x1={0} y1={hz} x2={0} y2={H} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={light.groundFar} />
          {stopsFor(light.path)}
        </linearGradient>
        <filter id={`${id}-pb`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="14 6" />
        </filter>
        <linearGradient id={`${id}-ps`} x1={0} y1={hz} x2={0} y2={H} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={light.groundFar} />
          {stopsFor(mix(light.path, light.ground, 0.55))}
        </linearGradient>
      </defs>
      <rect x={-50} y={hz - 2} width={W + 100} height={H - hz + 60} fill={`url(#${id}-g)`} />
      <g filter={`url(#${id}-pb)`}>
      {patches.map((p, i) => {
        const c = project(cam, p.x, 0, p.z);
        if (!c || c.d < 1.5) return null;
        const rx = p.rx * c.s;
        const ry = (p.rz * cam.y * cam.f) / (c.d * c.d);
        if (c.x + rx < -50 || c.x - rx > W + 50 || ry < 0.3) return null;
        return <ellipse key={i} cx={c.x} cy={c.y} rx={rx} ry={ry} fill={mix(p.color, light.groundFar, haze(c.d))} opacity={p.opacity} />;
      })}
      </g>
      <g opacity={pathOpacity}>
        {paths.map((p, i) => (
          <path key={`s${i}`} d={groundPolyToSvg(cam, ribbon(p, 1.75))} fill={`url(#${id}-ps)`} opacity={0.55} />
        ))}
        {paths.map((p, i) => (
          <path key={`m${i}`} d={groundPolyToSvg(cam, ribbon(p, 1))} fill={`url(#${id}-p)`} />
        ))}
        {paths.map((p, i) => (
          <g key={`r${i}`} opacity={0.22}>
            <path d={groundPolyToSvg(cam, ribbon({...p, width: p.width * 0.1}, 1, p.width * 0.22))} fill={light.ground} />
            <path d={groundPolyToSvg(cam, ribbon({...p, width: p.width * 0.08}, 1, -p.width * 0.2))} fill={light.ground} />
          </g>
        ))}
      </g>
    </g>
  );
};
