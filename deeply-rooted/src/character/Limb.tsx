import React from 'react';
import {Mode, paint} from './spec';
import {Mat} from './Materials';

export type V = [number, number];

/** Two-bone IK: returns the elbow position for shoulder S reaching wrist T. */
export const ik = (S: V, T: V, l1: number, l2: number, bendSign: 1 | -1): {elbow: V; wrist: V} => {
  const dx = T[0] - S[0], dy = T[1] - S[1];
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.05, minD = Math.abs(l1 - l2) + 0.5;
  const dd = Math.min(maxD, Math.max(minD, d));
  const base = Math.atan2(dy, dx);
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd))));
  const ang = base + bendSign * a;
  const elbow: V = [S[0] + Math.cos(ang) * l1, S[1] + Math.sin(ang) * l1];
  const fa = Math.atan2(T[1] - elbow[1], T[0] - elbow[0]);
  const wrist: V = d > maxD ? [elbow[0] + Math.cos(fa) * l2, elbow[1] + Math.sin(fa) * l2] : T;
  d = 0;
  return {elbow, wrist};
};

/** Tapered capsule path between A (half-width wa) and B (half-width wb), with a soft belly. */
export const capsule = (A: V, B: V, wa: number, wb: number, belly = 0.15) => {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
  const m: V = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  const wm = (wa + wb) / 2 + belly * (wa + wb) * 0.5;
  const p = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  return (
    `M${p(A[0] + nx * wa, A[1] + ny * wa)}` +
    `Q${p(m[0] + nx * wm * 1.02, m[1] + ny * wm * 1.02)} ${p(B[0] + nx * wb, B[1] + ny * wb)}` +
    `A${wb} ${wb} 0 0 0 ${p(B[0] - nx * wb, B[1] - ny * wb)}` +
    `Q${p(m[0] - nx * wm, m[1] - ny * wm)} ${p(A[0] - nx * wa, A[1] - ny * wa)}` +
    `A${wa} ${wa} 0 0 0 ${p(A[0] + nx * wa, A[1] + ny * wa)}Z`
  );
};

export const angleOf = (A: V, B: V) => (Math.atan2(B[1] - A[1], B[0] - A[0]) * 180) / Math.PI;

/** A coat sleeve from shoulder → elbow → wrist, with cuff and a hint of sweater cuff. */
export const Sleeve: React.FC<{
  mode: Mode;
  S: V;
  E: V;
  Wr: V;
  coat: string;
  coatShadow: string;
  coatLight: string;
  sweater: string;
  wUpper?: [number, number];
  wFore?: [number, number];
  lightSide?: 1 | -1;
  uid?: string;
  part?: 'all' | 'fore';
}> = ({mode, S, E: E0, Wr, coat, coatShadow, coatLight, sweater, wUpper = [5.8, 5.0], wFore = [5.0, 4.5], lightSide = 1, uid, part = 'all'}) => {
  let E = E0;
  const upper = part === 'all';
  // drawn alone in front of the body, the forearm starts just past the elbow so no round cap shows
  if (!upper) E = [E[0] + (Wr[0] - E[0]) * 0.22, E[1] + (Wr[1] - E[1]) * 0.22];
  const fa = Math.atan2(Wr[1] - E[1], Wr[0] - E[0]);
  const ux = Math.cos(fa), uy = Math.sin(fa);
  const cuffIn: V = [Wr[0] - ux * 3.2, Wr[1] - uy * 3.2];
  const swEnd: V = [Wr[0] + ux * 0.9, Wr[1] + uy * 0.9];
  return (
    <g>
      <path d={capsule(Wr, swEnd, 3.7, 3.5, 0)} fill={paint(mode, sweater)} />
      {upper && <path d={capsule(S, E, wUpper[0], wUpper[1])} fill={paint(mode, coat)} />}
      <path d={capsule(E, Wr, wFore[0], wFore[1])} fill={paint(mode, coat)} />
      {mode === 'color' && (
        <>
          {uid && <Mat uid={uid} d={(upper ? capsule(S, E, wUpper[0], wUpper[1]) : '') + capsule(E, Wr, wFore[0], wFore[1])} kind="wool" />}
          <path d={capsule(cuffIn, Wr, wFore[1] + 0.15, wFore[1] + 0.1, 0)} fill={coatShadow} opacity={0.55} />
          {upper && <path
            d={capsule(
              [S[0] + lightSide * 1.6, S[1] - 2],
              [E[0] + lightSide * 1.4, E[1]],
              wUpper[0] * 0.35,
              wUpper[1] * 0.3,
            )}
            fill={coatLight}
            opacity={0.35}
          />}
          <path d={capsule([E[0] - lightSide * 1.5, E[1] + 1.5], [E[0] + ux * 6 - lightSide, E[1] + uy * 6], 1.2, 0.6, 0)} fill={coatShadow} opacity={0.5} />
        </>
      )}
    </g>
  );
};
