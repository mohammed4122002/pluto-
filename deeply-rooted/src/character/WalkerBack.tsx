import React from 'react';
import {tones} from '../config/palette';
import {lerp} from '../engine/anim';
import {Hand} from './Hands';
import {capsule, V} from './Limb';
import {Mode, paint} from './spec';
import {Mat, MaterialDefs} from './Materials';

/**
 * THE WALKER — back view (walking away), for the imagined future in Scene 03 and the reference sheet.
 * Same landmark table and colours as the hero view (spec.ts). Centimetres, y-up, origin between the feet.
 * `phase` advances 1.0 per full stride cycle (two steps). `walk` 0 = standing still, 1 = full walk.
 */
const T = tones;

interface LegState {
  hip: V;
  knee: V;
  ankle: V;
  heelLift: number; // 0..1 (shows the sole on toe-off)
  front: boolean; // swinging forward (away from camera) → drawn slightly smaller
}

const leg = (phase: number, side: -1 | 1, walk: number): LegState => {
  const p = ((phase % 1) + 1) % 1;
  const stanceEnd = 0.6;
  let fwd: number, lift: number, heel: number;
  if (p < stanceEnd) {
    const u = p / stanceEnd;
    fwd = lerp(0.5, -0.5, u);
    lift = 0;
    heel = Math.max(0, (u - 0.7) / 0.3);
  } else {
    const u = (p - stanceEnd) / (1 - stanceEnd);
    fwd = lerp(-0.5, 0.5, u * u * (3 - 2 * u));
    lift = Math.sin(Math.PI * u) * 9;
    heel = Math.max(0, 1 - u * 2.2);
  }
  fwd *= walk;
  lift *= walk;
  heel *= walk;
  const hx = side * 5.2;
  const ankleY = 9 + lift + fwd * 9; // further away reads as higher on screen
  const ankleX = hx + side * 0.6 - fwd * side * 0.8;
  // swing leg: the knee lifts and the shin folds back toward the lens (reads as a shorter, bent leg)
  const knee: V = [lerp(hx, ankleX, 0.5) + side * (0.8 + lift * 0.08), lerp(88, ankleY, 0.52) + lift * 0.55];
  return {hip: [hx, 90], knee, ankle: [ankleX, ankleY], heelLift: heel, front: fwd > 0.05};
};

const Boot: React.FC<{mode: Mode; at: V; heel: number; side: -1 | 1; scale: number}> = ({mode, at, heel, side, scale}) => {
  const [x, y] = at;
  const h = 11.5 * scale, w = 4.6 * scale;
  return (
    <g>
      <path
        d={`M${x - w} ${y + h * 0.2} C${x - w} ${y + h * 0.8} ${x - w * 0.8} ${y + h} ${x - w * 0.6} ${y + h} L${x + w * 0.6} ${y + h} C${x + w * 0.8} ${y + h} ${x + w} ${y + h * 0.8} ${x + w} ${y + h * 0.2} C${x + w} ${y - 9} ${x - w} ${y - 9} ${x - w} ${y + h * 0.2} Z`}
        fill={paint(mode, T.boots)}
      />
      {mode === 'color' && (
        <>
          <path d={`M${x + side * w * 0.2} ${y + h * 0.9} C${x + side * w * 0.9} ${y + h * 0.6} ${x + side * w} ${y + h * 0.1} ${x + side * w * 0.8} ${y - 2}`} stroke={T.bootsShadow} strokeWidth={0.9} fill="none" opacity={0.6} />
          <ellipse cx={x} cy={y - 1.6 - heel * 2.5} rx={w * 0.95} ry={1.6 + heel * 3.2} fill={T.sole} />
          <path d={`M${x - w * 0.6} ${y + h * 0.75} C${x - w * 0.2} ${y + h * 0.85} ${x + w * 0.2} ${y + h * 0.85} ${x + w * 0.6} ${y + h * 0.75}`} stroke={T.bootsLight} strokeWidth={0.5} fill="none" opacity={0.6} />
        </>
      )}
    </g>
  );
};

export const WalkerBack: React.FC<{mode: Mode; phase: number; walk?: number; wind?: number; detail?: number; uid?: string}> = ({
  mode,
  phase,
  walk = 1,
  wind = 0,
  detail = 1,
  uid = 'wb',
}) => {
  const P = (c: string) => paint(mode, c);
  const color = mode === 'color';
  const c2 = Math.cos(phase * Math.PI * 4);
  const s1 = Math.sin(phase * Math.PI * 2);
  const bob = (0.9 * c2 - 0.3) * walk;
  const sway = 1.3 * s1 * walk;
  const tilt = 1.6 * s1 * walk; // shoulders counter-rotate against the hips
  const L = leg(phase, -1, walk);
  const R = leg(phase + 0.5, 1, walk);
  const hemSway = -2.2 * s1 * walk + wind * 1.2;

  const legShape = (l: LegState) => (
    <g>
      <path d={capsule(l.hip, l.knee, 6.4, 5.4, 0.05)} fill={P(T.trousers)} />
      <path d={capsule(l.knee, [l.ankle[0], l.ankle[1] + 4], 5.4, 4.6, 0.02)} fill={P(T.trousers)} />
      {color && <path d={capsule([l.hip[0] + 2, l.hip[1]], [l.ankle[0] + 2.2, l.ankle[1] + 5], 1.4, 1.0, 0)} fill={T.trousersShadow} opacity={0.45} />}
    </g>
  );
  const legs = [L, R].sort((a, b) => Number(b.front) - Number(a.front)); // swinging-away leg first (behind)

  // arms swing opposite to the legs: +1 forward (away, partly hidden), −1 back (toward camera)
  const armL = -s1 * walk;
  const armR = s1 * walk;
  const arm = (side: -1 | 1, a: number) => {
    const S: V = [side * 15.6, 141 + bob - side * tilt * 0.6];
    // forward swing bends the elbow; back swing straightens the arm
    const E: V = [side * (17.6 - a * 0.6), 113 + bob + a * 3.2];
    const bend = Math.max(0, a) * 2.4;
    const Wr: V = [side * (17.2 - a * 1.6 - bend * 0.4), 88 + bob + a * 7.5 + bend];
    return (
      <g>
        <path d={capsule(Wr, [Wr[0], Wr[1] - 1], 3.6, 3.4, 0)} fill={P(T.sweater)} />
        <path d={capsule(S, E, 5.9, 5.0)} fill={P(T.coat)} />
        <path d={capsule(E, Wr, 5.0, 4.5)} fill={P(T.coat)} />
        {color && <path d={capsule([S[0] - side * 2, S[1] - 3], [E[0] - side * 2, E[1]], 1.4, 1.0, 0)} fill={T.coatShadow} opacity={0.5} />}
        <g transform={`translate(${Wr[0]} ${Wr[1]}) rotate(${side * 4})`}>
          <Hand mode={mode} pose="relaxed" mirror={side > 0} detail={detail > 0.5} />
        </g>
      </g>
    );
  };
  const armsBehind = [armL > 0.3 ? arm(-1, armL) : null, armR > 0.3 ? arm(1, armR) : null];
  const armsFront = [armL <= 0.3 ? arm(-1, armL) : null, armR <= 0.3 ? arm(1, armR) : null];

  const COAT_BACK =
    `M-7.2 152.6 C-12.4 151.6 -16.4 149.6 -18.2 146.2 C-19.2 143.6 -19.0 138 -18.4 131 C-17.6 120 -16.4 112 -16.2 104 ` +
    `C-16.6 90 ${-18.0 + hemSway * 0.4} 70 ${-19.6 + hemSway} 52.6 C-12 51.2 -4 50.8 0 50.8 C4 50.8 12 51.2 ${19.6 + hemSway} 52.6 ` +
    `C${18.0 + hemSway * 0.4} 70 16.6 90 16.2 104 C16.4 112 17.6 120 18.4 131 C19.0 138 19.2 143.6 18.2 146.2 C16.4 149.6 12.4 151.6 7.2 152.6 Z`;
  return (
    <g transform={`translate(${sway} 0)`}>
      {color && <MaterialDefs uid={uid} />}
      {armsBehind}
      {legs.map((l, i) => (
        <g key={i}>{legShape(l)}</g>
      ))}
      {legs.map((l, i) => (
        <Boot key={`b${i}`} mode={mode} at={[l.ankle[0], l.ankle[1] - 9]} heel={l.heelLift} side={l.hip[0] < 0 ? -1 : 1} scale={l.front ? 0.94 : 1} />
      ))}
      <g transform={`translate(0 ${bob}) rotate(${tilt} 0 100)`}>
        {/* satchel at his right hip (screen right in a back view) */}
        <path d="M12.6 104.6 C13.0 96 13.6 88 14.6 81.6 L25.2 82.8 C25.6 90 25.4 98 24.8 105.4 Z" fill={P(T.satchel)} />
        {color && <path d="M12.4 104.6 L25.0 105.4 L25.2 96.4 C21 95.4 16.6 95.4 12.8 96.0 Z" fill={T.satchelShadow} opacity={0.5} />}
        {/* coat back */}
        <path d={COAT_BACK} fill={P(T.coat)} />
        {color && (
          <g>
            <Mat uid={uid} d={COAT_BACK} kind="wool" />
            <path d="M0 104 L0 66" stroke={T.coatShadow} strokeWidth={0.7} />
            <path d={`M-0.4 66 L${-1.6 + hemSway * 0.3} 51.2 L${1.2 + hemSway * 0.3} 51.2 L0.4 66 Z`} fill={T.coatShadow} opacity={0.9} />
            <path d="M-15.6 106 C-10 104.6 10 104.6 15.6 106" stroke={T.coatShadow} strokeWidth={0.8} fill="none" opacity={0.6} />
            <path d={`M-16 104 C-16.6 90 ${-18 + hemSway * 0.4} 70 ${-19.6 + hemSway} 52.6 L-14 52 C-13.4 70 -12.6 90 -12.4 104 Z`} fill={T.coatShadow} opacity={0.45} />
            <path d="M-13 140 C-9 134 -6 128 -5 118" stroke={T.coatShadow} strokeWidth={0.6} fill="none" opacity={0.5} />
            <path d="M12 140 C9 134 7 128 6 118" stroke={T.coatShadow} strokeWidth={0.6} fill="none" opacity={0.5} />
          </g>
        )}
        {/* satchel strap: over his left shoulder (screen left) down to the right hip */}
        <path d="M-13.8 148.4 L-10.0 149.2 L16.8 98.4 L13.4 96.8 Z" fill={P(T.satchel)} />
        {color && <path d="M-10.0 149.2 L16.8 98.4" stroke={T.satchelShadow} strokeWidth={0.5} />}
        {/* collar, neck, head (back) */}
        <path d="M-7.4 151.6 C-7.4 155.4 -4.4 157.6 0 157.6 C4.4 157.6 7.4 155.4 7.4 151.6 Z" fill={P(T.coatShadow)} />
        <path d="M-4.6 156.8 L-4.8 160.4 L4.8 160.4 L4.6 156.8 Z" fill={P(T.skin)} />
        <g transform={`translate(0 ${bob * 0.2})`}>
          <path d="M-8.6 166.8 C-9.6 166.4 -9.8 163.6 -8.8 162.6 C-8.2 162.2 -7.8 163.4 -7.8 164.6 Z" fill={P(T.skin)} />
          <path d="M8.6 166.8 C9.6 166.4 9.8 163.6 8.8 162.6 C8.2 162.2 7.8 163.4 7.8 164.6 Z" fill={P(T.skin)} />
          <path
            d={`M-8.4 166.4 C-9.2 171 -8.6 176.6 -5.6 179.4 C-3.4 181.2 ${-0.6 + wind * 0.4} 181.8 2.4 181.4 C5.6 181.0 8.4 178.8 9.0 174.6 C9.4 171.6 9.0 168.4 8.2 165.4 C7.6 162.6 6.4 160.6 4.4 159.8 C2.0 159.2 -2.0 159.2 -4.4 159.8 C-6.6 160.6 -7.8 163.0 -8.4 166.4 Z`}
            fill={P(T.hair)}
          />
          {color && detail > 0.5 && (
            <g fill="none" strokeLinecap="round">
              <path d="M-5.2 178.4 C-2 180.2 2 180.4 5.4 178.6" stroke={T.hairLight} strokeWidth={0.45} opacity={0.6} />
              <path d="M-6.4 172 C-4 174 -1 174.6 1.4 174.2" stroke={T.hairLight} strokeWidth={0.32} opacity={0.4} />
              <path d="M2 176 C4.4 175.6 6.6 173.8 7.4 171" stroke={T.hairLight} strokeWidth={0.32} opacity={0.4} />
              <path d="M-3.6 161 C-1.2 160.4 1.2 160.4 3.6 161" stroke="#241C19" strokeWidth={0.4} opacity={0.6} />
            </g>
          )}
        </g>
      </g>
      {armsFront}
    </g>
  );
};

export const WALKERBACK_BOUNDS: [number, number, number, number] = [-40, -10, 80, 200];
