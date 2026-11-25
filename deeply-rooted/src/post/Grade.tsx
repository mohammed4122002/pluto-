import React from 'react';
import {staticFile} from 'remotion';
import {grade, H, W} from '../config/production';
import {hash} from '../engine/noise';
import {rgba} from '../engine/color';

/**
 * One consistent film finish over every shot: gentle desaturation and contrast,
 * a temperature wash, lifted blacks, vignette and animated film grain.
 * `warmth`: -1 cool misty present … +1 warm imagined light.
 */
export const Graded: React.FC<{frame: number; warmth: number; children: React.ReactNode}> = ({frame, warmth, children}) => {
  const k = frame % 6;
  const gx = Math.floor(hash(frame, 1) * 1024), gy = Math.floor(hash(frame, 2) * 1024);
  const tint = warmth >= 0 ? rgba('#D9B77D', 0.16 * warmth) : rgba('#7F8C96', 0.18 * -warmth);
  return (
    <div style={{position: 'absolute', inset: 0, width: W, height: H, overflow: 'hidden', background: '#303238'}}>
      <div style={{position: 'absolute', inset: 0, filter: `saturate(${grade.saturation}) contrast(${grade.contrast})`}}>{children}</div>
      <div style={{position: 'absolute', inset: 0, background: tint, mixBlendMode: 'soft-light'}} />
      <div style={{position: 'absolute', inset: 0, background: rgba('#303238', grade.lift), mixBlendMode: 'screen'}} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 75% 70% at 50% 46%, rgba(0,0,0,0) 55%, ${rgba('#1E1F23', grade.vignette)} 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${staticFile(`textures/grain_${k}.png`)})`,
          backgroundSize: '1024px 1024px',
          backgroundPosition: `${gx}px ${gy}px`,
          mixBlendMode: 'overlay',
          opacity: grade.grain,
        }}
      />
    </div>
  );
};

/** Screen-space mist that rolls across the lens (used to hide the Scene 01 → 02 cut). */
export const MistPass: React.FC<{frame: number; amount: number; color: string; dir?: 1 | -1}> = ({frame, amount, color, dir = -1}) => {
  if (amount <= 0.002) return null;
  const x = (dir * frame * 9) % 2400;
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
      <defs>
        <mask id={`mist-${frame}`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
          <rect width={W} height={H} fill="#fff" opacity={0.55} />
          {[-1, 0, 1].map((k) => (
            <image key={k} href={staticFile('textures/fog_bank_1.png')} x={x + k * 2400} y={-120} width={2400} height={1400} preserveAspectRatio="none" />
          ))}
          {[-1, 0, 1].map((k) => (
            <image key={`b${k}`} href={staticFile('textures/fog_wisp_0.png')} x={-x * 0.6 + k * 2600} y={200} width={2600} height={900} preserveAspectRatio="none" />
          ))}
        </mask>
      </defs>
      <rect width={W} height={H} fill={color} opacity={amount} mask={`url(#mist-${frame})`} />
      <rect width={W} height={H} fill={color} opacity={amount * 0.55} />
    </svg>
  );
};
