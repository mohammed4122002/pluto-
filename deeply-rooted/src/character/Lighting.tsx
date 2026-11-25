import React from 'react';
import {staticFile} from 'remotion';
import {Mode} from './spec';

export interface CharLight {
  rim: string;
  rimStrength: number;
  rimWidth: number; // cm
  rimDir: 1 | -1; // +1 = light from screen right
  fill: string; // cool shadow-side tint
  fillStrength: number;
  haze: string;
  hazeAmount: number;
  texture: number; // painterly surface strength
}

/**
 * Lights any character view consistently. The view is rendered as colour art, then reused as a
 * silhouette mask for: a rim of dawn light on the lit edge, a cool fill band on the shadow side,
 * atmospheric haze, and a painted brush-surface texture. Lighting never alters the drawing itself.
 */
export const Lit: React.FC<{id: string; light: CharLight; bounds?: [number, number, number, number]; render: (m: Mode) => React.ReactNode}> = ({
  id,
  light,
  bounds = [-80, -20, 160, 230],
  render,
}) => {
  const [bx, by, bw, bh] = bounds;
  const rw = light.rimWidth * light.rimDir;
  const fw = 7 * light.rimDir;
  return (
    <g>
      <defs>
        <mask id={`${id}-rim`} maskUnits="userSpaceOnUse" x={bx} y={by} width={bw} height={bh}>
          {render('white')}
          <g transform={`translate(${-rw} ${-Math.abs(rw) * 0.35})`}>{render('black')}</g>
        </mask>
        <mask id={`${id}-fill`} maskUnits="userSpaceOnUse" x={bx} y={by} width={bw} height={bh}>
          {render('white')}
          <g transform={`translate(${fw} 0)`}>{render('black')}</g>
        </mask>
        <mask id={`${id}-sil`} maskUnits="userSpaceOnUse" x={bx} y={by} width={bw} height={bh}>
          {render('white')}
        </mask>
        <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={Math.max(0.2, light.rimWidth * 0.35)} />
        </filter>
        <pattern id={`${id}-tex`} patternUnits="userSpaceOnUse" width={64} height={40} patternTransform="scale(1 -1)">
          <image href={staticFile('textures/brush.png')} width={64} height={40} preserveAspectRatio="none" />
        </pattern>
      </defs>
      {render('color')}
      {light.fillStrength > 0 && (
        <rect x={bx} y={by} width={bw} height={bh} fill={light.fill} opacity={light.fillStrength} mask={`url(#${id}-fill)`} style={{mixBlendMode: 'multiply'}} />
      )}
      {light.texture > 0 && (
        <rect x={bx} y={by} width={bw} height={bh} fill={`url(#${id}-tex)`} opacity={light.texture} mask={`url(#${id}-sil)`} style={{mixBlendMode: 'soft-light'}} />
      )}
      {light.rimStrength > 0 && (
        <g filter={`url(#${id}-soft)`}>
          <rect x={bx} y={by} width={bw} height={bh} fill={light.rim} opacity={light.rimStrength} mask={`url(#${id}-rim)`} />
        </g>
      )}
      {light.hazeAmount > 0.003 && <rect x={bx} y={by} width={bw} height={bh} fill={light.haze} opacity={light.hazeAmount} mask={`url(#${id}-sil)`} />}
    </g>
  );
};
