import React from 'react';
import {tones} from '../config/palette';
import {Mode, paint} from './spec';

/**
 * Hand assets (cm, y-up, wrist at origin, fingers pointing down −y in the neutral pose).
 * Shared by every view and by the POV insert of the map, so his hands are always the same hands.
 */
export type HandPose = 'relaxed' | 'holdPacket' | 'grip' | 'gripBack' | 'gripThumb';

const KNUCKLES = 'M-1.6 -8.4 C-0.6 -8.9 0.6 -8.9 1.6 -8.4';

export const Hand: React.FC<{mode: Mode; pose: HandPose; mirror?: boolean; detail?: boolean}> = ({mode, pose, mirror, detail = true}) => {
  const skin = paint(mode, tones.skin);
  const sh = tones.skinShadow;
  const g = (children: React.ReactNode) => <g transform={mirror ? 'scale(-1 1)' : undefined}>{children}</g>;
  if (pose === 'grip' || pose === 'gripBack' || pose === 'gripThumb') {
    // back of the hand, fingers curled under the paper edge, thumb lying on top of the sheet.
    // 'gripBack' / 'gripThumb' split it so the paper can sit between the hand and the thumb.
    const body = pose !== 'gripThumb', thumb = pose !== 'gripBack';
    return g(
      <>
        {body && <path
          d="M-2.5 0.8 C-2.9 -2.2 -3.3 -4.6 -3.4 -6.6 C-3.4 -7.4 -3.0 -7.9 -2.3 -8.0 C-1.5 -8.5 -0.6 -8.4 0.0 -8.2 C0.7 -8.6 1.6 -8.5 2.1 -8.0 C2.8 -8.0 3.3 -7.4 3.3 -6.6 C3.3 -4.4 3.0 -1.8 2.6 0.8 Z"
          fill={skin}
        />}
        {body && mode === 'color' && detail && (
          <>
            <path d="M-3.3 -6.4 C-3.4 -4.2 -3.0 -2.0 -2.5 0.6 L-1.6 0.6 C-2.1 -1.8 -2.4 -4.2 -2.4 -6.6 Z" fill={sh} opacity={0.4} />
            <path d="M-1.9 -7.7 C-1.1 -7.0 -0.3 -7.0 0.0 -7.9 M0.1 -7.8 C0.8 -7.1 1.5 -7.1 2.0 -7.7" fill="none" stroke={sh} strokeWidth={0.28} strokeLinecap="round" opacity={0.7} />
            <path d="M-1.2 -1.0 L-1.6 -6.2 M0.4 -0.8 L0.4 -6.4 M1.7 -1.0 L2.0 -6.0" stroke={tones.skinLight} strokeWidth={0.32} strokeLinecap="round" opacity={0.35} />
          </>
        )}
        {thumb && <path d="M2.3 -0.6 C3.8 -1.6 5.1 -3.4 5.9 -5.6 C6.2 -6.5 5.9 -7.2 5.3 -7.3 C4.7 -7.4 4.3 -6.9 4.1 -6.2 C3.6 -4.8 2.8 -3.7 1.7 -3.0 Z" fill={skin} />}
        {thumb && mode === 'color' && detail && (
          <>
            <path d="M4.5 -6.6 C4.8 -7.1 5.5 -7.1 5.7 -6.5 C5.4 -6.2 4.9 -6.1 4.5 -6.6 Z" fill={tones.skinLight} opacity={0.75} />
            <path d="M2.0 -3.1 C2.9 -3.8 3.6 -4.6 4.1 -5.6" fill="none" stroke={sh} strokeWidth={0.3} opacity={0.55} />
          </>
        )}
      </>,
    );
  }
  return g(
    <>
      <path
        d="M-2.5 0.6 C-3.1 -2.6 -3.3 -6.2 -2.9 -9.4 C-2.6 -12.6 -1.8 -15.8 -0.4 -17.2 C0.8 -18.1 2.0 -17.2 2.3 -15.0 C2.6 -12.2 3.0 -9.0 3.1 -6.6 C3.2 -4.4 3.0 -1.8 2.5 0.6 Z"
        fill={skin}
      />
      <path d="M2.4 -2.0 C3.9 -3.6 4.3 -6.8 3.8 -9.0 C3.5 -9.9 2.6 -9.8 2.4 -8.8 C2.2 -7.0 1.9 -5.2 1.3 -3.8 Z" fill={skin} />
      {mode === 'color' && detail && (
        <>
          <path d={KNUCKLES} fill="none" stroke={sh} strokeWidth={0.35} opacity={0.55} />
          <path d="M-0.4 -9.6 L-0.6 -15.8 M1.1 -9.4 L1.2 -15.6" stroke={sh} strokeWidth={0.22} opacity={0.45} />
          <path d="M-2.9 -5 C-3.2 -8.4 -2.6 -12.8 -1.2 -16.4 L-0.6 -15.8 C-1.8 -12.2 -2.2 -8.6 -2.1 -5.2 Z" fill={sh} opacity={0.4} />
        </>
      )}
    </>,
  );
};

/** The folded map packet (back cover visible), held between thumb and fingers. */
export const FoldedPacket: React.FC<{mode: Mode}> = ({mode}) => (
  <g>
    <path d="M-6.4 0 L6.6 0.6 L6.2 -19.0 L-6.8 -19.4 Z" fill={paint(mode, tones.paperBack)} />
    {mode === 'color' && (
      <>
        <path d="M-6.6 -9.6 L6.4 -9.2" stroke="#B9AD98" strokeWidth={0.35} />
        <path d="M-6.4 0 L6.6 0.6 L6.5 -1.4 L-6.5 -1.9 Z" fill="#C8BCA6" opacity={0.7} />
        <path d="M5.4 0.4 L6.6 0.6 L6.2 -19 L5.0 -19.1 Z" fill="#BFB29C" opacity={0.6} />
      </>
    )}
  </g>
);
