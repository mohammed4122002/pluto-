import React from 'react';
import {tones} from '../config/palette';
import {lerp, smoothstep} from '../engine/anim';
import {MapPanels, MAP_H, MAP_W} from '../props/PaperMap';
import {FoldedPacket, Hand} from './Hands';
import {angleOf, Sleeve, V} from './Limb';
import {Mode, paint} from './spec';

/**
 * THE WALKER — hero view: three-quarter front, facing screen-left.
 * Centimetres, y-up, origin on the ground between the feet. The parent scales this into the shot.
 */
export interface Pose34 {
  breath: number; // 0..1 inhale
  headTurn: number; // -1 toward profile (looking further left) … +1 toward camera
  headPitch: number; // degrees, + looks down
  headTilt: number; // degrees roll
  gazeX: number; // -1 left … +1 right
  gazeY: number; // -1 down … +1 up
  blink: number; // 0..1
  lidLower: number; // 0..1 (tired / looking down)
  browWorry: number; // 0..1 inner brows lift and knit
  mouthSad: number; // 0..1
  shoulderDrop: number; // cm (a sigh)
  armBlend: number; // 0 arms at sides … 1 holding the map in front
  rowOpen: number; // map unfolding
  colOpen1: number;
  colOpen0: number;
  farGrip: number; // 0..1 far hand takes the map's left edge
  wind: number; // signed wind amount for coat hem / hair
  flutter: number; // map paper flutter
  detail: number; // 0..1 (drop fine marks in wide shots)
}

export const neutralPose: Pose34 = {
  breath: 0,
  headTurn: 0,
  headPitch: 0,
  headTilt: 0,
  gazeX: -0.2,
  gazeY: 0,
  blink: 0,
  lidLower: 0.15,
  browWorry: 0.2,
  mouthSad: 0.1,
  shoulderDrop: 0,
  armBlend: 0,
  rowOpen: 0,
  colOpen1: 0,
  colOpen0: 0,
  farGrip: 0,
  wind: 0,
  flutter: 0,
  detail: 1,
};

const T = tones;
const NEAR_SHOULDER: V = [13.8, 141.8];
const FAR_SHOULDER: V = [-11.2, 141.4];

// Map placement in body space (cm) when held open at the waist, foreshortened by the 3/4 view.
const MAP_TR: V = [7.2, 111.2];
const MAP_EX: V = [31.5 / MAP_W, -1.1 / MAP_W]; // local x axis (u = 2400 is the anchored right edge)
const MAP_EY: V = [-1.2 / MAP_H, -10.8 / MAP_H]; // local y axis (top → bottom)

const mapToBody = (u: number, v: number): V => [
  MAP_TR[0] + (u - MAP_W) * MAP_EX[0] + v * MAP_EY[0],
  MAP_TR[1] + (u - MAP_W) * MAP_EX[1] + v * MAP_EY[1],
];

// ------------------------------------------------------------------- face
const FACE_D =
  'M-6.6 175.0 C-7.9 173.4 -8.4 171.0 -8.35 169.2 C-8.3 168.4 -8.0 167.9 -8.05 166.6 C-8.1 165.6 -8.3 165.0 -8.3 164.2 ' +
          'C-8.55 163.8 -8.9 163.2 -9.15 162.55 C-9.2 162.1 -8.9 161.9 -8.35 161.75 ' +
          'C-8.05 161.4 -8.25 160.8 -8.25 160.4 C-8.15 160.1 -8.0 159.95 -8.0 159.9 C-8.15 159.5 -8.05 159.0 -7.8 158.7 ' +
          'C-7.45 158.35 -7.45 158.1 -7.45 158.05 C-7.7 157.6 -7.75 157.0 -7.65 156.6 C-7.5 155.8 -7.1 155.3 -6.6 155.0 ' +
          'C-5.4 154.4 -3.2 154.7 -1.0 155.2 C1.0 155.8 2.6 156.8 3.7 158.0 C4.3 158.7 4.5 159.6 4.6 160.4 ' +
          'C5.6 162.6 8.6 164.6 9.4 167.4 C10.0 170.4 9.6 175.2 6.2 177.9 C3.8 179.6 -1.6 179.8 -4.2 178.6 C-5.4 177.9 -6.2 176.6 -6.6 175.0 Z';

const Eye: React.FC<{cx: number; cy: number; w: number; h: number; p: Pose34; mode: Mode; far?: boolean; uid: string}> = ({cx, cy, w, h, p, mode, far, uid}) => {
  if (mode !== 'color') return null;
  const lid = Math.min(1, Math.max(p.blink, p.lidLower * 0.42 + Math.max(0, -p.gazeY) * 0.22));
  const lx = cx - w / 2, rx = cx + w / 2;
  const top = cy + h * 1.05;
  const lidY = lerp(top, cy - h * 0.55, lid);
  const ix = cx + p.gazeX * w * 0.2 + (far ? -0.08 : 0);
  const iy = cy + p.gazeY * h * 0.28 + 0.05;
  const ir = h * 0.66;
  const id = `${uid}-eye${far ? 'f' : 'n'}`;
  const white = `M${lx} ${cy}Q${cx - w * 0.1} ${top} ${rx} ${cy + h * 0.15}Q${cx + w * 0.05} ${cy - h * 0.85} ${lx} ${cy}Z`;
  return (
    <g>
      <clipPath id={id}>
        <path d={white} />
      </clipPath>
      <path d={white} fill={T.eyeWhite} />
      <g clipPath={`url(#${id})`}>
        <circle cx={ix} cy={iy} r={ir} fill={T.iris} />
        <circle cx={ix} cy={iy} r={ir * 0.5} fill="#1E1714" />
        <circle cx={ix + ir * 0.35} cy={iy + ir * 0.38} r={ir * 0.2} fill="#F4EDE2" opacity={0.75 * (1 - lid)} />
        <path d={`M${lx - 1} ${top + 2}L${rx + 1} ${top + 2}L${rx + 1} ${lidY}Q${cx} ${lidY + (top - cy) * 0.25} ${lx - 1} ${lidY}Z`} fill={T.skinShadow} />
        <path d={`M${lx - 1} ${cy + h * 0.9}L${rx + 1} ${cy + h * 0.9}L${rx + 1} ${cy + h * 0.55}L${lx - 1} ${cy + h * 0.55}Z`} fill="#000" opacity={0.18} />
      </g>
      <path
        d={`M${lx - 0.15} ${cy - 0.05}Q${cx - w * 0.1} ${lerp(top, lidY, 0.9) + 0.12} ${rx + 0.1} ${cy + h * 0.2}`}
        fill="none"
        stroke="#2A1F1A"
        strokeWidth={far ? 0.26 : 0.34}
        strokeLinecap="round"
      />
      <path d={`M${lx + w * 0.15} ${top + 0.55 - lid * 0.2}Q${cx} ${top + 0.95 - lid * 0.25} ${rx - w * 0.05} ${top + 0.35}`} fill="none" stroke={T.skinDeep} strokeWidth={0.16} opacity={0.55} />
      <path d={`M${lx + w * 0.2} ${cy - h * 0.62}Q${cx} ${cy - h * 0.92} ${rx - w * 0.1} ${cy - h * 0.4}`} fill="none" stroke={T.skinDeep} strokeWidth={0.12} opacity={0.35} />
    </g>
  );
};

const Head: React.FC<{p: Pose34; mode: Mode; uid: string}> = ({p, mode, uid}) => {
  const P = (c: string) => paint(mode, c);
  const fx = p.headTurn * 1.0; // features slide across the head as it turns
  const worry = p.browWorry;
  const hairWind = p.wind * 0.6;
  const fine = p.detail > 0.5;
  return (
    <g>
      {/* ear */}
      <path d="M4.3 166.9 C5.1 168.5 7.5 168.3 7.7 165.7 C7.9 163.7 7.0 161.9 5.9 161.1 C5.1 160.6 4.5 161.1 4.4 162.0 Z" fill={P(T.skin)} />
      {mode === 'color' && fine && <path d="M5.1 166.6 C5.9 167.3 6.9 166.5 6.8 165.2 C6.7 164.0 6.1 163.0 5.5 162.6" fill="none" stroke={T.skinShadow} strokeWidth={0.32} strokeLinecap="round" />}
      {/* skull + face */}
      <path
        d={FACE_D}
        fill={P(T.skin)}
      />
      {mode === 'color' && (
        <defs>
          <clipPath id={`${uid}-face`}>
            <path d={FACE_D} />
          </clipPath>
          <filter id={`${uid}-soft`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={0.45} />
          </filter>
        </defs>
      )}
      {mode === 'color' && (
        <g>
          <g clipPath={`url(#${uid}-face)`}>
          <g filter={`url(#${uid}-soft)`}>
          {/* front plane in soft shadow, warm lit cheek toward the ear */}
          <path d="M-8.3 169 C-8.2 166 -8.6 163 -8.0 160 C-7.6 157.6 -7.2 155.8 -6.0 155.0 C-6.6 158 -6.2 162 -6.0 166 C-6.0 167.6 -6.6 168.8 -8.3 169 Z" fill={T.skinShadow} opacity={0.35} />
          <path d="M0.6 165.6 C2.6 165.2 4.0 163.6 4.2 161.2 C3.6 159.0 2.0 157.6 -0.2 157.4 C0.6 160 0.8 163 0.6 165.6 Z" fill={T.skinLight} opacity={0.3} />
          <path d="M-5.0 155.0 C-2.0 155.0 1.4 156.0 3.6 158.0 C3.8 158.6 3.4 158.8 2.8 158.4 C1.0 157.2 -2.0 156.2 -5.2 156.2 Z" fill={T.skinShadow} opacity={0.4} />
          {/* stubble */}
          <path
            d="M-8.3 161.4 C-7.0 161.6 -4.8 161.4 -3.4 160.8 C-2.0 160.0 -0.6 158.4 1.2 158.6 C2.4 158.8 3.4 159.4 4.2 160.2 C3.6 158.4 2.2 156.8 -0.6 155.6 C-3.0 154.7 -5.6 154.6 -6.8 155.1 C-7.6 155.8 -7.8 157.2 -7.6 158.2 C-8.1 159.0 -8.2 160.2 -8.3 161.4 Z"
            fill={T.hair}
            opacity={0.12}
          />
          </g>
          </g>
          <g clipPath={`url(#${uid}-face)`}>
          {/* nose */}
          <g transform={`translate(${fx} 0)`}>
            <path d="M-5.7 167.4 C-6.2 165.8 -6.9 164.2 -7.5 163.1" fill="none" stroke={T.skinShadow} strokeWidth={0.3} strokeLinecap="round" opacity={0.8} />
            <path d="M-8.75 162.0 C-8.1 161.55 -7.3 161.55 -6.7 161.95 C-7.2 162.25 -7.9 162.35 -8.75 162.0 Z" fill={T.skinDeep} opacity={0.75} />
            <path d="M-7.6 163.2 C-6.8 162.8 -6.4 162.3 -6.6 161.95" fill="none" stroke={T.skinShadow} strokeWidth={0.28} opacity={0.7} />
            <ellipse cx={-6.9} cy={164.4} rx={0.35} ry={1.0} fill={T.skinLight} opacity={0.35} />
          </g>
          {/* mouth */}
          <g transform={`translate(${fx * 0.85} 0)`}>
            <path
              d={`M-7.9 ${159.85 - p.mouthSad * 0.2} C-7.0 160.05 -6.2 159.95 -5.4 159.95 C-4.8 159.92 -4.2 ${159.82 - p.mouthSad * 0.12} -3.7 ${159.62 - p.mouthSad * 0.32}`}
              fill="none"
              stroke={T.skinDeep}
              strokeWidth={0.32}
              strokeLinecap="round"
            />
            <path d="M-7.85 159.95 C-6.8 160.55 -5.0 160.6 -3.9 159.8 C-5.0 160.15 -6.8 160.15 -7.85 159.95 Z" fill={T.lip} opacity={0.55} />
            <path d="M-7.4 159.6 C-6.6 158.95 -5.0 158.95 -4.2 159.5 C-5.2 159.3 -6.4 159.3 -7.4 159.6 Z" fill={T.lip} opacity={0.4} />
            <path d="M-6.6 158.6 C-6.0 158.4 -5.4 158.4 -4.9 158.6" fill="none" stroke={T.skinShadow} strokeWidth={0.22} opacity={0.5} />
          </g>
          {/* eyes */}
          <g transform={`translate(${fx} 0)`}>
            <Eye cx={-7.05} cy={166.65} w={1.45 * (1 + p.headTurn * 0.12)} h={0.78} p={p} mode={mode} far uid={uid} />
            <Eye cx={-3.05} cy={166.75} w={2.85} h={1.02} p={p} mode={mode} uid={uid} />
            {/* brows */}
            <path
              d={`M${-6.15 + worry * 0.15} ${169.25 + worry * 0.45} C-6.9 ${169.55 + worry * 0.25} -7.7 169.45 -8.35 169.0 C-7.7 169.1 -6.9 ${169.05 + worry * 0.2} ${-6.15 + worry * 0.15} ${168.85 + worry * 0.4} Z`}
              fill={T.hair}
            />
            <path
              d={`M${-4.75 - worry * 0.2} ${169.0 + worry * 0.55} C-3.6 ${169.95 + worry * 0.3} -1.9 169.95 -0.55 169.2 C-1.9 169.5 -3.5 ${169.45 + worry * 0.25} ${-4.75 - worry * 0.2} ${168.6 + worry * 0.5} Z`}
              fill={T.hair}
            />
            {worry > 0.25 && (
              <path d={`M-5.3 ${169.6 + worry * 0.3} C-5.25 ${170.3 + worry * 0.3} -5.2 170.8 -5.2 171.0`} fill="none" stroke={T.skinShadow} strokeWidth={0.14} opacity={(worry - 0.25) * 0.7} />
            )}
          </g>
          </g>
        </g>
      )}
      {/* hair */}
      <path
        d={
          `M-6.9 174.6 C-8.0 175.4 ${-8.9 + hairWind} 176.9 ${-8.4 + hairWind} 178.2 C-7.6 179.6 -5.6 180.6 -3.4 180.9 ` +
          `C-1.2 ${181.6 + hairWind * 0.2} 1.6 181.3 3.8 180.6 C6.6 179.8 8.9 178.0 9.9 175.4 C10.7 173.0 10.6 170.0 10.0 167.6 ` +
          'C9.6 165.6 8.9 164.0 7.8 162.7 C7.2 162.2 6.8 162.6 6.9 163.4 L7.2 165.4 C6.6 167.6 5.2 168.2 4.3 167.6 ' +
          'C3.9 166.4 3.7 164.6 3.5 163.4 L2.8 163.6 C2.6 166.2 2.2 168.6 1.6 170.6 C0.2 172.4 -2.6 173.0 -4.6 173.6 C-5.6 173.9 -6.4 174.2 -6.9 174.6 Z'
        }
        fill={P(T.hair)}
      />
      {/* tousled locks */}
      <path
        d={`M-5.8 180.2 C${-5.0 + hairWind} 182.0 -2.6 182.4 -1.6 181.6 C-2.8 181.6 -4.0 181.2 -4.6 180.4 Z M0.8 181.4 C1.8 182.8 4.2 182.6 5.0 181.4 C3.8 181.7 2.4 181.6 1.6 180.9 Z M-8.2 177.6 C${-9.6 + hairWind} 177.2 -9.8 175.8 -9.2 174.9 C-9.0 175.9 -8.6 176.6 -7.8 176.8 Z`}
        fill={P(T.hair)}
      />
      {mode === 'color' && fine && (
        <g fill="none" strokeLinecap="round">
          <path d="M-4.8 179.8 C-2.0 180.6 1.6 180.8 5.2 179.8" stroke={T.hairLight} strokeWidth={0.45} opacity={0.75} />
          <path d="M-6.8 177.2 C-5.0 178.6 -2.0 179.2 0.6 179.0" stroke={T.hairLight} strokeWidth={0.32} opacity={0.6} />
          <path d="M2.4 179.2 C5.0 178.8 7.6 177.2 8.8 174.6" stroke={T.hairLight} strokeWidth={0.38} opacity={0.65} />
          <path d="M6.8 176.0 C8.0 174.0 8.6 171.4 8.4 168.6" stroke={T.hairLight} strokeWidth={0.3} opacity={0.5} />
          <path d="M-7.2 175.0 C-6.0 176.2 -4.0 176.6 -2.0 176.4" stroke="#241C19" strokeWidth={0.3} opacity={0.6} />
        </g>
      )}
    </g>
  );
};

// ------------------------------------------------------------------- body
export const Walker34: React.FC<{p: Pose34; mode: Mode; uid?: string}> = ({p, mode, uid = 'w34'}) => {
  const P = (c: string) => paint(mode, c);
  const color = mode === 'color';
  const fine = p.detail > 0.5;
  const lift = p.breath * 0.45 - p.shoulderDrop;
  const hem = p.wind;

  // ---- arms: art-directed elbow/wrist keys per pose (a 3/4 forearm pointing at the lens must
  //      foreshorten, which plain 2D IK cannot do), blended with a slight lifting arc.
  const nS: V = [NEAR_SHOULDER[0], NEAR_SHOULDER[1] + lift];
  const fS: V = [FAR_SHOULDER[0], FAR_SHOULDER[1] + lift];
  const b = p.armBlend;
  const arc = Math.sin(b * Math.PI) * 3.5;
  const mapOpen = (p.colOpen1 + p.colOpen0) / 2;
  const leftEdgeU = MAP_W * (1 - (1 + 2 * mapOpen) / 3);
  const leftEdge = mapToBody(leftEdgeU, MAP_H * 0.45);
  const nearE: V = [lerp(15.4, 16.6, b), lerp(113.2, 115.6, b) + lift + arc * 0.4];
  const nearW: V = [lerp(15.0, 9.4, b), lerp(87.4, 105.2, b) + arc];
  const farE: V = [lerp(-14.4, -16.2, b), lerp(113.0, 116.2, b) + lift + arc * 0.4];
  const farW0: V = [lerp(-14.2, -19.0, b), lerp(87.0, 99.0, b) + arc];
  const farW: V = [lerp(farW0[0], leftEdge[0] - 0.6, p.farGrip), lerp(farW0[1], leftEdge[1] - 0.4, p.farGrip)];
  const near = {elbow: nearE, wrist: nearW};
  const far = {elbow: farE, wrist: farW};
  const farFront = smoothstep(0.25, 0.6, p.armBlend);

  const hand = (S: V, E: V, Wr: V, pose: 'relaxed' | 'grip', mirror: boolean, gripRot = 0) => (
    <g transform={`translate(${Wr[0]} ${Wr[1]}) rotate(${pose === 'grip' ? gripRot : angleOf(E, Wr) + 90})`}>
      <Hand mode={mode} pose={pose} mirror={mirror} detail={fine} />
    </g>
  );

  // ---- map
  const unfolding = p.armBlend > 0.02;
  const mapMatrix = `matrix(${MAP_EX[0]} ${MAP_EX[1]} ${MAP_EY[0]} ${MAP_EY[1]} ${MAP_TR[0] - MAP_W * MAP_EX[0]} ${MAP_TR[1] - MAP_W * MAP_EX[1]})`;
  // folded packet rides in the near hand until the map is in front
  const packetAtHand = (
    <g transform={`translate(${near.wrist[0]} ${near.wrist[1]}) rotate(${angleOf(near.elbow, near.wrist) + 90}) translate(-1.2 -6.5) rotate(-8)`}>
      <FoldedPacket mode={mode} />
    </g>
  );
  const showPanels = p.rowOpen > 0.01 || p.colOpen1 > 0.01;
  const packetBlend = smoothstep(0.55, 1, p.armBlend);

  const farArm = (
    <Sleeve mode={mode} S={fS} E={far.elbow} Wr={far.wrist} coat={T.coat} coatShadow={T.coatShadow} coatLight={T.coatLight} sweater={T.sweater} lightSide={1} />
  );
  const farHand = hand(fS, far.elbow, far.wrist, p.farGrip > 0.5 ? 'grip' : 'relaxed', p.farGrip > 0.5 ? false : true, 78);

  return (
    <g>
      {/* ---------- behind the torso: satchel bag + far arm ---------- */}
      <g transform={`translate(0 ${lift * 0.3})`}>
        <path d="M-26.2 104.0 C-27.0 96 -26.6 88 -25.4 81.6 L-14.4 80.2 L-13.8 103.0 Z" fill={P(T.satchel)} />
        {color && (
          <>
            <path d="M-26.6 104.4 L-13.6 103.6 L-14.0 94.4 C-18.4 93.6 -22.8 94.4 -26.4 95.8 Z" fill={T.satchelShadow} opacity={0.55} />
            <path d="M-21.4 95.2 L-19.6 95.0 L-19.4 91.0 L-21.2 91.2 Z" fill="#806854" opacity={0.7} />
            <path d="M-26.0 101.8 L-14.0 101.2" stroke="#8C7C62" strokeWidth={0.25} strokeDasharray="0.8 0.7" opacity={0.8} />
          </>
        )}
      </g>
      {farArm}
      {farFront < 1 && <g opacity={1}>{farHand}</g>}

      {/* ---------- legs + boots ---------- */}
      <path d="M-11.2 12.5 C-11.4 9 -11.8 6 -13.4 4.6 C-15.6 3.6 -17.0 2.4 -17.0 1.2 L-16.8 0 L-3.8 0 C-3.6 3 -3.6 8 -3.9 12.5 Z" fill={P(T.boots)} />
      <path d="M1.0 12.5 C0.8 9 0.0 6.2 -1.8 4.8 C-4.0 3.8 -5.4 2.6 -5.4 1.3 L-5.2 0 L9.4 0 C9.6 3 9.4 8 9.0 12.5 Z" fill={P(T.boots)} />
      {color && (
        <g>
          <path d="M-17.0 1.4 L-3.8 1.4 L-3.8 0 L-16.8 0 Z M-5.4 1.4 L9.4 1.4 L9.4 0 L-5.2 0 Z" fill={T.sole} />
          <path d="M-16.2 2.4 C-15.0 3.6 -13.6 4.4 -12.0 5.0" stroke={T.bootsLight} strokeWidth={0.6} fill="none" opacity={0.7} strokeLinecap="round" />
          <path d="M-4.6 2.6 C-3.4 3.8 -2.0 4.6 -0.4 5.4" stroke={T.bootsLight} strokeWidth={0.6} fill="none" opacity={0.7} strokeLinecap="round" />
          <path d="M5.0 12 C5.4 8 6.4 4 7.8 1.6 L9.4 1.6 C9.6 4 9.4 8 9.0 12.5 Z" fill={T.bootsShadow} opacity={0.5} />
          {fine && <path d="M-9.0 9.6 l1.6 -0.6 M-9.4 7.8 l1.6 -0.6 M3.0 9.8 l1.6 -0.6 M2.6 8.0 l1.6 -0.6" stroke={T.bootsShadow} strokeWidth={0.4} />}
        </g>
      )}
      <path d="M-10.4 57 C-10.8 40 -11.0 25 -10.8 10.4 C-8.4 11.2 -6.2 11.4 -4.2 10.6 C-3.9 25 -3.4 40 -2.8 57 Z" fill={P(T.trousers)} />
      <path d="M0.6 57 C0.9 40 1.2 25 1.4 10.4 C3.8 11.4 6.6 11.4 9.0 10.6 C9.3 25 9.6 40 10.0 57 Z" fill={P(T.trousers)} />
      {color && (
        <g>
          <path d="M-10.8 10.4 C-8.4 11.2 -6.2 11.4 -4.2 10.6 L-4.3 14 C-6.4 13.2 -8.6 13.4 -10.8 14.6 Z" fill={T.trousersShadow} opacity={0.6} />
          <path d="M1.4 10.4 C3.8 11.4 6.6 11.4 9.0 10.6 L9.1 14 C6.8 13.2 4.0 13.4 1.4 14.6 Z" fill={T.trousersShadow} opacity={0.6} />
          <path d="M-10.4 57 C-10.8 40 -11.0 25 -10.8 10.4 L-8.6 10.8 C-8.8 25 -8.6 40 -8.2 57 Z" fill={T.trousersShadow} opacity={0.5} />
          {fine && <path d="M5.6 50 C5.2 40 5.4 30 5.2 18" stroke={T.trousersShadow} strokeWidth={0.4} fill="none" opacity={0.6} />}
        </g>
      )}

      {/* ---------- torso (breathes) ---------- */}
      <g transform={`translate(0 ${lift}) translate(0 104) scale(1 ${1 + p.breath * 0.004}) translate(0 -104)`}>
        {/* coat collar behind the neck */}
        <path d="M-5.6 151.4 C-5.2 154.6 -3.0 156.6 0.6 156.8 C4.0 156.8 6.0 155.0 6.8 152.4 Z" fill={P(T.coatShadow)} />
        {/* coat body */}
        <path
          d={
            'M-5.4 152.2 C-9.2 151.0 -12.6 149.4 -14.8 146.4 C-16.4 143.8 -16.6 138.0 -16.2 131.0 C-15.8 118 -16.0 104 -17.0 88 ' +
            `C-18.0 72 -18.8 62 ${-19.6 - hem * 1.2} ${52.6 + hem * 0.3} C-13 50.6 -4 50.2 4 50.8 C10 51.2 15 51.8 ${19.4 - hem * 0.8} ${52.8 + hem * 0.2} ` +
            'C18.6 70 18.0 88 17.8 104 C17.8 118 18.0 130 18.2 136 C18.2 141.6 17.8 145 16.4 147.2 C13.8 149.8 10.0 151.4 6.8 152.4 C2.6 153.4 -1.6 153.2 -5.4 152.2 Z'
          }
          fill={P(T.coat)}
        />
        {color && (
          <g>
            {/* far side in shadow, drape folds */}
            <path d={`M-16.2 131 C-15.8 118 -16.0 104 -17.0 88 C-18.0 72 -18.8 62 ${-19.6 - hem * 1.2} ${52.6 + hem * 0.3} L-14.4 51.4 C-13.6 70 -13.0 100 -13.0 131 Z`} fill={T.coatShadow} opacity={0.6} />
            <path d="M12.6 98 C13.4 82 14.2 66 15.8 52.2" stroke={T.coatShadow} strokeWidth={0.9} fill="none" opacity={0.55} strokeLinecap="round" />
            <path d="M9.0 92 C9.6 78 10.4 64 11.2 51.6" stroke={T.coatShadow} strokeWidth={0.7} fill="none" opacity={0.45} strokeLinecap="round" />
            <path d="M-13.2 96 C-13.8 80 -14.6 66 -15.8 51.6" stroke={T.coatLight} strokeWidth={0.6} fill="none" opacity={0.25} strokeLinecap="round" />
            <path d="M17.2 128 C15.4 122 14.2 116 13.8 108" stroke={T.coatShadow} strokeWidth={0.8} fill="none" opacity={0.5} strokeLinecap="round" />
            <path d="M17.0 137 C17.2 120 17.0 104 17.6 80 L18.4 80 C18.0 104 18.2 120 18.2 136 Z" fill={T.coatLight} opacity={0.35} />
          </g>
        )}
        {/* open front: sweater + trousers */}
        <path
          d="M-4.2 150.0 C-5.6 145 -6.6 140 -7.0 134 C-7.4 122 -8.0 108 -8.6 96 C-9.2 82 -10.0 66 -10.6 52.2 L3.2 51.0 C3.4 66 3.8 82 4.2 96 C4.6 110 5.4 124 5.8 134 C5.4 141 4.4 146.4 3.8 150.2 Z"
          fill={P(T.sweater)}
        />
        <path d="M-8.7 94.6 C-9.2 82 -10.0 66 -10.6 52.2 L3.2 51.0 C3.4 66 3.8 82 4.1 94.4 C0 95.2 -4.4 95.2 -8.7 94.6 Z" fill={P(T.trousers)} />
        {color && (
          <g>
            <path d="M-8.7 94.6 C-4.4 95.6 0 95.6 4.1 94.4 L4.2 97.6 C0 98.6 -4.4 98.6 -8.6 97.8 Z" fill={T.sweaterShadow} opacity={0.75} />
            <path d="M-4.2 150 C-5.6 145 -6.6 140 -7.0 134 C-7.4 122 -8.0 108 -8.6 97 L-5.6 97.6 C-5.0 110 -4.6 124 -4.0 134 C-3.6 140 -3.2 145 -4.2 150 Z" fill={T.sweaterShadow} opacity={0.7} />
            <path d="M3.8 150.2 C4.4 146.4 5.4 141 5.8 134 L5.0 128 C3.6 134 2.6 140 2.0 148 Z" fill={T.sweaterShadow} opacity={0.55} />
            {fine && (
              <g stroke={T.sweaterShadow} strokeWidth={0.22} opacity={0.5}>
                {[-5, -3, -1, 1, 3].map((x) => (
                  <path key={x} d={`M${x} 146 C${x - 0.3} 130 ${x - 0.5} 112 ${x - 0.8} 99`} fill="none" />
                ))}
              </g>
            )}
            <path d="M-2.4 94.8 C-2.6 82 -2.8 68 -3.2 51.6" stroke={T.trousersShadow} strokeWidth={0.6} fill="none" opacity={0.7} />
          </g>
        )}
        {/* lapels */}
        <path d="M3.8 150.2 C4.6 146 5.4 141 5.8 134 C6.0 131 6.0 128.6 5.8 127 L11.2 140.0 L9.8 142.6 L12.2 145.6 C10.6 147.8 8.0 149.6 6.6 150.8 Z" fill={P(T.coatLight)} />
        <path d="M-4.2 150.0 C-5.6 145 -6.6 140 -7.0 134 L-7.4 128.5 L-10.4 140.6 L-9.6 143.0 L-11.0 145.6 C-9.0 147.6 -6.6 149.2 -5.2 150.4 Z" fill={P(T.coatShadow)} />
        {color && (
          <path d="M5.8 127 L11.2 140.0 L9.8 142.6 L12.2 145.6" fill="none" stroke={T.coatShadow} strokeWidth={0.45} strokeLinejoin="round" opacity={0.8} />
        )}
        {/* crew-neck collar + neck */}
        <path d="M-4.9 155.6 C-4.4 153 -4.5 151 -4.9 149.2 L4.8 149.6 C4.8 152 5.0 155 5.5 158.6 Z" fill={P(T.skin)} />
        {color && <path d="M-4.9 155.6 C-4.4 153 -4.5 151 -4.9 149.2 L-2.6 149.4 C-2.6 151.6 -2.8 153.8 -3.2 155.4 Z" fill={T.skinShadow} opacity={0.45} />}
        <path d="M-5.0 150.6 C-2.8 147.6 1.8 147.4 4.6 150.0 L4.6 151.8 C1.8 149.4 -2.6 149.6 -4.8 152.2 Z" fill={P(T.sweater)} />
        {color && <path d="M-5.0 150.6 C-2.8 147.6 1.8 147.4 4.6 150.0" fill="none" stroke={T.sweaterShadow} strokeWidth={0.4} />}
        {/* satchel strap across the chest (his left shoulder → right hip) */}
        <path d="M13.2 148.6 L16.8 146.4 L-14.6 94.4 L-18.4 96.6 Z" fill={P(T.satchel)} />
        {color && (
          <g>
            <path d="M13.2 148.6 L-18.4 96.6" stroke={T.satchelShadow} strokeWidth={0.5} opacity={0.8} />
            {fine && <path d="M14.6 147.0 L-16.6 95.6" stroke="#8C7C62" strokeWidth={0.2} strokeDasharray="0.8 0.7" opacity={0.8} />}
            <path d="M16.8 146.4 L13.2 148.6 L12.6 147.2 L16.0 145.0 Z" fill={T.satchelShadow} opacity={0.6} />
          </g>
        )}
        {/* head */}
        <g transform={`rotate(${p.headPitch + p.headTilt} -0.4 153.2)`}>
          <Head p={p} mode={mode} uid={uid} />
        </g>
      </g>

      {/* ---------- far forearm comes in front of the body when he holds the map ---------- */}
      {farFront > 0 && <g opacity={farFront}>{farArm}</g>}

      {/* ---------- the map ---------- */}
      {unfolding && showPanels && (
        <g transform={mapMatrix}>
          <MapPanels mode={mode} id={`${uid}m${mode}`} inkScale={2.6} rowOpen={p.rowOpen} colOpen1={p.colOpen1} colOpen0={p.colOpen0} flutter={p.flutter} detail={p.detail} />
        </g>
      )}
      {(!showPanels || packetBlend < 1) && <g opacity={showPanels ? 1 - packetBlend : 1}>{packetAtHand}</g>}
      {farFront > 0 && <g opacity={farFront}>{farHand}</g>}

      {/* ---------- near arm ---------- */}
      <Sleeve mode={mode} S={nS} E={near.elbow} Wr={near.wrist} coat={T.coat} coatShadow={T.coatShadow} coatLight={T.coatLight} sweater={T.sweater} lightSide={1} />
      {hand(nS, near.elbow, near.wrist, p.armBlend > 0.6 && showPanels ? 'grip' : 'relaxed', true, -80)}
    </g>
  );
};

export const WALKER34_BOUNDS: [number, number, number, number] = [-45, -5, 90, 195];
