import React from 'react';
import {staticFile} from 'remotion';
import {W, H, FPS} from '../config/production';
import {Cam} from '../engine/camera';
import {Light} from './types';

/** Screen-space sky (the camera never pitches, so the sky only drifts). */
export const Sky: React.FC<{cam: Cam; light: Light; frame: number; id: string; glowBoost?: number; cloud?: number}> = ({
  cam,
  light,
  frame,
  id,
  glowBoost = 1,
  cloud = 0.22,
}) => {
  const hz = cam.horizon;
  const drift = ((frame / FPS) * 6) % 2048;
  const gx = light.glowX * W;
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
      <defs>
        <linearGradient id={`${id}-sky`} x1={0} y1={0} x2={0} y2={hz + 40} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor={light.skyTop} />
          <stop offset={0.55} stopColor={light.skyMid} />
          <stop offset={1} stopColor={light.skyHorizon} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx={gx} cy={hz + 10} r={W * 0.62} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${gx} ${hz}) scale(1 0.42) translate(${-gx} ${-hz})`}>
          <stop offset={0} stopColor={light.glow} stopOpacity={Math.min(1, light.glowStrength * glowBoost)} />
          <stop offset={0.35} stopColor={light.glow} stopOpacity={Math.min(1, light.glowStrength * glowBoost) * 0.35} />
          <stop offset={1} stopColor={light.glow} stopOpacity={0} />
        </radialGradient>
        <mask id={`${id}-cloudmask`} maskContentUnits="userSpaceOnUse">
          {[0, 1].map((k) => (
            <image key={k} href={staticFile('textures/sky_clouds.png')} x={-drift + k * 2048 * 1.4} y={hz - 640} width={2048 * 1.4} height={700} preserveAspectRatio="none" />
          ))}
        </mask>
      </defs>
      <rect width={W} height={H} fill={`url(#${id}-sky)`} />
      <rect width={W} height={H} fill={light.skyHorizon} opacity={cloud} mask={`url(#${id}-cloudmask)`} />
      <rect width={W} height={H} fill={`url(#${id}-glow)`} />
    </svg>
  );
};
