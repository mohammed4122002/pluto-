import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {lighting} from './config/production';
import {Lit} from './character/Lighting';
import {Walker34, WALKER34_BOUNDS} from './character/Walker34';
import {scene2Pose} from './scenes/performance';

/** Look-development still: the upgraded Walker at close-up and medium scale, present-day light. */
export const LookDev: React.FC = () => {
  const f = 610 + useCurrentFrame();
  const p = scene2Pose(f);
  const L = lighting.present;
  const light = {rim: L.rim, rimStrength: 0.5, rimWidth: 0.35, rimDir: 1 as const, fill: L.fill, fillStrength: 0.28, haze: L.groundFar, hazeAmount: 0, texture: 0.12};
  return (
    <AbsoluteFill style={{background: 'linear-gradient(#8A9398, #BFC3C0)'}}>
      <svg width={1920} height={1080}>
        <g transform="translate(1150 3500) scale(19.6 -19.6)">
          <Lit id="ldcu" light={light} bounds={WALKER34_BOUNDS} render={(m) => <Walker34 mode={m} p={p} uid="ldcu" />} />
        </g>
        <g transform="translate(300 1060) scale(5.4 -5.4)">
          <Lit id="ldm" light={light} bounds={WALKER34_BOUNDS} render={(m) => <Walker34 mode={m} p={p} uid="ldm" />} />
        </g>
      </svg>
    </AbsoluteFill>
  );
};
