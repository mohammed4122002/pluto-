import React from 'react';

/**
 * DEEPLY ROOTED — the stick-figure protagonist ("the Traveller").
 * One rig for every shot: circular head, minimal body, clean consistent line weight, warm ivory.
 * Units: head diameter = 24u; total height 156u (6.5 heads). y-up, origin on the ground between the feet.
 * Emotion is carried by posture: torso lean, head tilt/drop, shoulder drop, arm and leg angles.
 */
export const STICK = {
  headR: 12,
  shoulderY: 124,
  hipY: 76,
  upperArm: 29,
  foreArm: 27,
  thigh: 38,
  shin: 36,
  limbW: 5,
  torsoW: 6.5,
  ivory: '#F2EDE3',
  shade: '#D6CAB6',
  edge: '#2C2F36',
} as const;

export interface StickPose {
  lean: number; // torso lean (deg, + forward/right)
  headTilt: number; // deg
  headDrop: number; // u — head sinks toward chest (sadness, head bowed)
  shoulderDrop: number; // u
  // arm angles measured from straight down (deg, + forward/right); elbow bend (deg)
  armL: [number, number];
  armR: [number, number];
  // leg angles from straight down (deg, + forward/right); knee bend (deg, + folds back)
  legL: [number, number];
  legR: [number, number];
  hipDrop: number; // u — crouch / sit
  handOpen?: boolean; // open-palm (letting go, reaching)
  eyes?: 'none' | 'front' | 'threequarter' | 'side'; // only in close-ups, only when needed
}

export const POSES: Record<string, StickPose> = {
  stand: {lean: 0, headTilt: 0, headDrop: 0, shoulderDrop: 0, armL: [-8, 4], armR: [8, 4], legL: [-5, 0], legR: [5, 0], hipDrop: 0},
  standSide: {lean: 2, headTilt: 0, headDrop: 0, shoulderDrop: 0, armL: [4, 8], armR: [-6, 6], legL: [3, 0], legR: [-3, 0], hipDrop: 0},
  walkA: {lean: 4, headTilt: 0, headDrop: 0, shoulderDrop: 0, armL: [24, 14], armR: [-26, 6], legL: [-22, 4], legR: [24, 8], hipDrop: 2.5},
  walkB: {lean: 4, headTilt: 0, headDrop: 0, shoulderDrop: 0, armL: [2, 10], armR: [-4, 10], legL: [6, 30], legR: [-2, 2], hipDrop: 0},
  walkC: {lean: 4, headTilt: 0, headDrop: 0, shoulderDrop: 0, armL: [-26, 6], armR: [24, 14], legL: [24, 8], legR: [-22, 4], hipDrop: 2.5},
  headDown: {lean: 6, headTilt: 0, headDrop: 6, shoulderDrop: 4, armL: [-4, 6], armR: [4, 6], legL: [-4, 0], legR: [4, 0], hipDrop: 0},
  hesitate: {lean: -6, headTilt: -6, headDrop: 0, shoulderDrop: 1, armL: [30, 110], armR: [-10, 12], legL: [-14, 4], legR: [10, 0], hipDrop: 1},
  lookBack: {lean: -2, headTilt: -14, headDrop: 0, shoulderDrop: 0, armL: [-6, 8], armR: [14, 18], legL: [8, 0], legR: [-8, 4], hipDrop: 0},
  reach: {lean: 8, headTilt: 6, headDrop: 0, shoulderDrop: 0, armL: [-8, 6], armR: [118, 8], legL: [-10, 2], legR: [12, 6], hipDrop: 1, handOpen: true},
  letGo: {lean: 2, headTilt: 8, headDrop: 0, shoulderDrop: 0, armL: [-6, 6], armR: [82, 6], legL: [-5, 0], legR: [5, 0], hipDrop: 0, handOpen: true},
  sitRock: {lean: 10, headTilt: 4, headDrop: 2, shoulderDrop: 2, armL: [30, 70], armR: [26, 66], legL: [86, 92], legR: [80, 86], hipDrop: 40},
  hugKnees: {lean: 26, headTilt: 10, headDrop: 5, shoulderDrop: 3, armL: [52, 96], armR: [46, 92], legL: [112, 150], legR: [108, 146], hipDrop: 64},
  kneelPlant: {lean: 34, headTilt: 14, headDrop: 2, shoulderDrop: 0, armL: [62, 20], armR: [52, 30], legL: [72, 140], legR: [-8, 82], hipDrop: 30},
  breathe: {lean: -3, headTilt: -10, headDrop: -1, shoulderDrop: -1.5, armL: [-14, 4], armR: [14, 4], legL: [-5, 0], legR: [5, 0], hipDrop: 0},
};

/** Blend two poses (for animation between keys). */
export const blendPose = (a: StickPose, b: StickPose, t: number): StickPose => {
  const l = (x: number, y: number) => x + (y - x) * t;
  const l2 = (x: [number, number], y: [number, number]): [number, number] => [l(x[0], y[0]), l(x[1], y[1])];
  return {
    lean: l(a.lean, b.lean),
    headTilt: l(a.headTilt, b.headTilt),
    headDrop: l(a.headDrop, b.headDrop),
    shoulderDrop: l(a.shoulderDrop, b.shoulderDrop),
    armL: l2(a.armL, b.armL),
    armR: l2(a.armR, b.armR),
    legL: l2(a.legL, b.legL),
    legR: l2(a.legR, b.legR),
    hipDrop: l(a.hipDrop, b.hipDrop),
    handOpen: t < 0.5 ? a.handOpen : b.handOpen,
    eyes: t < 0.5 ? a.eyes : b.eyes,
  };
};

type P = [number, number];
const rad = (d: number) => (d * Math.PI) / 180;
/** Point at distance L from origin O, at angle `deg` measured from straight down (+ toward +x). */
const from = (o: P, deg: number, L: number): P => [o[0] + Math.sin(rad(deg)) * L, o[1] - Math.cos(rad(deg)) * L];

export type StickLook = 'ivory' | 'imagined' | 'younger';

/**
 * Draws the Traveller. `facing` +1 = toward screen right, -1 = left (mirrors the pose).
 * `look`: 'ivory' (him), 'imagined' (the luminous version of himself he imagined), 'younger' (his younger self).
 */
export const Stickman: React.FC<{pose: StickPose; facing?: 1 | -1; look?: StickLook; scale?: number; glow?: number; shadeSide?: 1 | -1}> = ({
  pose,
  facing = 1,
  look = 'ivory',
  scale = 1,
  glow = 0,
  shadeSide = 1, // which side of the head carries the form shadow (-1 when the key light is on his facing side)
}) => {
  const S = STICK;
  const young = look === 'younger';
  const k = young ? 0.72 : 1; // younger self: shorter limbs, same head → reads as younger
  const hip: P = [0, S.hipY * k - pose.hipDrop];
  const shoulderBase: P = from(hip, 180 - pose.lean, (S.shoulderY - S.hipY) * k);
  const shoulder: P = [shoulderBase[0], shoulderBase[1] - pose.shoulderDrop];
  const neckTop: P = from(shoulder, 180 - pose.lean - pose.headTilt * 0.3, 7 * k);
  const head: P = from(neckTop, 180 - pose.lean - pose.headTilt, S.headR + 1 - pose.headDrop);
  const limb = (o: P, a: [number, number], l1: number, l2: number, sign: 1 | -1): [P, P] => {
    const e = from(o, a[0], l1 * k);
    const w = from(e, a[0] + a[1] * sign, l2 * k);
    return [e, w];
  };
  const [eL, wL] = limb(shoulder, pose.armL, S.upperArm, S.foreArm, 1);
  const [eR, wR] = limb(shoulder, pose.armR, S.upperArm, S.foreArm, 1);
  const [kL, aL] = limb(hip, pose.legL, S.thigh, S.shin, -1);
  const [kR, aR] = limb(hip, pose.legR, S.thigh, S.shin, -1);
  const line = (pts: P[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${(-p[1]).toFixed(2)}`).join('');
  const body = look === 'imagined' ? '#F7D79A' : S.ivory;
  const far = look === 'imagined' ? '#E6BE78' : S.shade;
  const opacity = look === 'imagined' ? 0.85 : 1;
  const foot = (a: P, legAng: number) => {
    const dir = Math.abs(legAng) > 60 ? 0 : 1;
    return line([a, [a[0] + 6.5 * dir * k, a[1] + 0.5]]);
  };
  const stroke = (w: number, c: string, d: string, key: string) => (
    <g key={key}>
      <path d={d} stroke={S.edge} strokeOpacity={0.45} strokeWidth={w + 1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d={d} stroke={c} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </g>
  );
  return (
    <g transform={`scale(${facing * scale} ${scale})`} opacity={opacity}>
      {(glow > 0 || look === 'imagined') && (
        <g opacity={look === 'imagined' ? 0.6 : glow} style={{filter: 'blur(6px)'}}>
          <path d={line([wL, eL, shoulder, eR, wR])} stroke="#FFD98E" strokeWidth={14} strokeLinecap="round" fill="none" />
          <path d={line([aL, kL, hip, kR, aR])} stroke="#FFD98E" strokeWidth={14} strokeLinecap="round" fill="none" />
          <circle cx={head[0]} cy={-head[1]} r={S.headR + 6} fill="#FFD98E" />
        </g>
      )}
      {/* far limbs first, a half-tone darker for depth */}
      {stroke(S.limbW * k, far, line([hip, kL, aL]) + foot(aL, pose.legL[0]), 'legL')}
      {stroke(S.limbW * k, far, line([shoulder, eL, wL]), 'armL')}
      {stroke(S.torsoW * k, body, line([hip, shoulder, neckTop]), 'torso')}
      {stroke(S.limbW * k, body, line([hip, kR, aR]) + foot(aR, pose.legR[0]), 'legR')}
      {stroke(S.limbW * k, body, line([shoulder, eR, wR]), 'armR')}
      {pose.handOpen ? (
        <g>
          <path d={line([wR, from(wR, pose.armR[0] + pose.armR[1] + 28, 6), from(wR, pose.armR[0] + pose.armR[1] - 18, 6.5)])} stroke={body} strokeWidth={2.6} strokeLinecap="round" fill="none" />
        </g>
      ) : null}
      <circle cx={head[0]} cy={-head[1]} r={S.headR * (young ? 1.02 : 1)} fill={body} stroke={S.edge} strokeOpacity={0.45} strokeWidth={1.6} />
      <path
        d={`M${head[0] + S.headR * 0.15 * shadeSide} ${-head[1] - S.headR * 0.95} A${S.headR} ${S.headR} 0 0 ${shadeSide > 0 ? 1 : 0} ${head[0] + S.headR * 0.15 * shadeSide} ${-head[1] + S.headR * 0.95}`}
        stroke={far}
        strokeWidth={S.headR * 0.5}
        fill="none"
        opacity={0.35}
      />
      {pose.eyes && pose.eyes !== 'none' && (
        <g fill={S.edge} opacity={0.8}>
          {pose.eyes === 'front' && (
            <>
              <circle cx={head[0] - 3.8} cy={-head[1] - 1} r={1.25} />
              <circle cx={head[0] + 3.8} cy={-head[1] - 1} r={1.25} />
            </>
          )}
          {pose.eyes === 'threequarter' && (
            <>
              <circle cx={head[0] + 1.8} cy={-head[1] - 1} r={1.2} />
              <circle cx={head[0] + 7.6} cy={-head[1] - 1} r={1.05} />
            </>
          )}
          {pose.eyes === 'side' && <circle cx={head[0] + 7.8} cy={-head[1] - 1} r={1.15} />}
        </g>
      )}
    </g>
  );
};
