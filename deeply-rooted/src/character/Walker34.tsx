import React from 'react';
import {tones} from '../config/palette';
import {lerp, smoothstep} from '../engine/anim';
import {MapPanels, MAP_H, MAP_W} from '../props/PaperMap';
import {FoldedPacket, Hand} from './Hands';
import {angleOf, Sleeve, V} from './Limb';
import {Head34} from './Face';
import {Mat, MaterialDefs} from './Materials';
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
  sway: number; // cm — slow weight shift between the feet (upper body drifts, boots stay planted)
  hemLag: number; // cm — coat hem follow-through behind the body's movement
  time: number; // seconds (drives small secondary motion: flyaway hair, fabric)
  mapLower: number; // cm — the map sinks a little when his attention leaves it
  thumbAdj: number; // 0..1 — small re-grip of the thumbs on the paper
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
  sway: 0,
  hemLag: 0,
  time: 0,
  mapLower: 0,
  thumbAdj: 0,
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

// ------------------------------------------------------------------- body
export const Walker34: React.FC<{p: Pose34; mode: Mode; uid?: string}> = ({p, mode, uid = 'w34'}) => {
  const P = (c: string) => paint(mode, c);
  const color = mode === 'color';
  const fine = p.detail > 0.5;
  const lift = p.breath * 0.45 - p.shoulderDrop;
  const hem = p.wind + p.hemLag;
  const sw = p.sway;
  const U = (node: React.ReactNode) => <g transform={`translate(${sw} 0)`}>{node}</g>;
  const legSkew = (sw * 0.9) / 57;

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
  const nearW: V = [lerp(15.0, 9.4, b) + p.thumbAdj * 0.5 * b, lerp(87.4, 105.2, b) + arc - p.mapLower * b];
  const farE: V = [lerp(-14.4, -16.2, b), lerp(113.0, 116.2, b) + lift + arc * 0.4];
  const farW0: V = [lerp(-14.2, -19.0, b), lerp(87.0, 99.0, b) + arc];
  const farW: V = [lerp(farW0[0], leftEdge[0] - 0.6, p.farGrip), lerp(farW0[1], leftEdge[1] - 0.4 - p.mapLower, p.farGrip)];
  const near = {elbow: nearE, wrist: nearW};
  const far = {elbow: farE, wrist: farW};
  const farFront = smoothstep(0.25, 0.6, p.armBlend);

  const hand = (S: V, E: V, Wr: V, pose: 'relaxed' | 'grip', mirror: boolean, gripRot = 0) => (
    <g transform={`translate(${Wr[0]} ${Wr[1]}) rotate(${pose === 'grip' ? gripRot : angleOf(E, Wr) + 90})`}>
      <Hand mode={mode} pose={pose} mirror={mirror} detail={fine} uid={color ? uid : undefined} />
    </g>
  );

  // ---- map
  const unfolding = p.armBlend > 0.02;
  const mapMatrix = `translate(0 ${-p.mapLower}) matrix(${MAP_EX[0]} ${MAP_EX[1]} ${MAP_EY[0]} ${MAP_EY[1]} ${MAP_TR[0] - MAP_W * MAP_EX[0]} ${MAP_TR[1] - MAP_W * MAP_EX[1]})`;
  // folded packet rides in the near hand until the map is in front
  const packetAtHand = (
    <g transform={`translate(${near.wrist[0]} ${near.wrist[1]}) rotate(${angleOf(near.elbow, near.wrist) + 90}) translate(-1.2 -6.5) rotate(-8)`}>
      <FoldedPacket mode={mode} />
    </g>
  );
  const showPanels = p.rowOpen > 0.01 || p.colOpen1 > 0.01;
  const packetBlend = smoothstep(0.55, 1, p.armBlend);

  const farArm = (
    <Sleeve mode={mode} uid={uid} S={fS} E={far.elbow} Wr={far.wrist} coat={T.coat} coatShadow={T.coatShadow} coatLight={T.coatLight} sweater={T.sweater} lightSide={1} />
  );
  const farHand = hand(fS, far.elbow, far.wrist, p.farGrip > 0.5 ? 'grip' : 'relaxed', p.farGrip > 0.5 ? false : true, 78);

  const BAG_D = 'M-26.2 104.0 C-27.0 96 -26.6 88 -25.4 81.6 L-14.4 80.2 L-13.8 103.0 Z';
  const coatD =
    'M-5.4 152.2 C-9.2 151.0 -12.6 149.4 -14.8 146.4 C-16.4 143.8 -16.6 138.0 -16.2 131.0 C-15.8 118 -16.0 104 -17.0 88 ' +
    `C-18.0 72 -18.8 62 ${-19.6 - hem * 1.2} ${52.6 + hem * 0.3} C-13 50.6 -4 50.2 4 50.8 C10 51.2 15 51.8 ${19.4 - hem * 0.8} ${52.8 + hem * 0.2} ` +
    'C18.6 70 18.0 88 17.8 104 C17.8 118 18.0 130 18.2 136 C18.2 141.6 17.8 145 16.4 147.2 C13.8 149.8 10.0 151.4 6.8 152.4 C2.6 153.4 -1.6 153.2 -5.4 152.2 Z';
  const OPEN_D =
    'M-4.2 150.0 C-5.6 145 -6.6 140 -7.0 134 C-7.4 122 -8.0 108 -8.6 96 C-9.2 82 -10.0 66 -10.6 52.2 L3.2 51.0 C3.4 66 3.8 82 4.2 96 C4.6 110 5.4 124 5.8 134 C5.4 141 4.4 146.4 3.8 150.2 Z';
  const LEG_FAR = 'M-10.4 57 C-10.8 40 -11.0 25 -10.8 10.4 C-8.4 11.2 -6.2 11.4 -4.2 10.6 C-3.9 25 -3.4 40 -2.8 57 Z';
  const LEG_NEAR = 'M0.6 57 C0.9 40 1.2 25 1.4 10.4 C3.8 11.4 6.6 11.4 9.0 10.6 C9.3 25 9.6 40 10.0 57 Z';
  const BOOT_FAR = 'M-11.2 12.5 C-11.4 9 -11.8 6 -13.4 4.6 C-15.6 3.6 -17.0 2.4 -17.0 1.2 L-16.8 0 L-3.8 0 C-3.6 3 -3.6 8 -3.9 12.5 Z';
  const BOOT_NEAR = 'M1.0 12.5 C0.8 9 0.0 6.2 -1.8 4.8 C-4.0 3.8 -5.4 2.6 -5.4 1.3 L-5.2 0 L9.4 0 C9.6 3 9.4 8 9.0 12.5 Z';
  const STRAP_D = 'M13.2 148.6 L16.8 146.4 L-14.6 94.4 L-18.4 96.6 Z';
  const NEAR_CAP = 'M8.4 151.0 C12.4 149.6 15.8 147.6 17.3 144.4 C18.1 142.2 18.2 138.6 17.9 134.6 C16.4 133.8 13.6 133.6 11.6 134.2 C11.0 140.2 10.2 145.4 8.4 151.0 Z';
  const FAR_CAP = 'M-5.6 152.0 C-9.4 150.8 -12.8 149.2 -14.9 146.2 C-16.3 144.0 -16.5 139.8 -16.1 134.4 L-10.8 134.2 C-10.6 140.6 -9.2 146.6 -5.6 152.0 Z';
  const NECK_D = 'M-4.9 155.6 C-4.4 153 -4.5 151 -4.9 149.2 L4.8 149.6 C4.8 152 5.0 155 5.5 158.6 Z';
  const fold = (x0: number, y0: number, x1: number, y1: number, k: number) => `M${x0} ${y0} C${x0 + (x1 - x0) * 0.3} ${y0 + (y1 - y0) * 0.35} ${x1 + hem * k * 0.6} ${y1 + (y0 - y1) * 0.3} ${x1 + hem * k} ${y1}`;

  return (
    <g>
      {color && <MaterialDefs uid={uid} />}
      {/* ---------- behind the torso: satchel bag + far arm ---------- */}
      {U(<g transform={`translate(0 ${lift * 0.3})`}>
        <path d={BAG_D} fill={P(T.satchel)} />
        {color && (
          <>
            <Mat uid={uid} d={BAG_D} kind="canvas" />
            <path d="M-26.6 104.4 L-13.6 103.6 L-14.0 94.4 C-18.4 93.6 -22.8 94.4 -26.4 95.8 Z" fill={T.satchelShadow} opacity={0.55} />
            <path d="M-21.4 95.2 L-19.6 95.0 L-19.4 91.0 L-21.2 91.2 Z" fill="#806854" opacity={0.7} />
            <path d="M-26.0 101.8 L-14.0 101.2" stroke="#8C7C62" strokeWidth={0.25} strokeDasharray="0.8 0.7" opacity={0.8} />
          </>
        )}
      </g>)}
      {U(farArm)}
      {farFront < 1 && U(<g opacity={1}>{farHand}</g>)}
      {color && <ellipse cx={-3 + sw * 0.3} cy={0.4} rx={19} ry={2.2} fill="#1E1F22" opacity={0.32} filter={`url(#${uid}-soft12)`} />}
      <g transform={`matrix(1 0 ${legSkew} 1 0 0)`}>

      {/* ---------- legs + boots ---------- */}
      <path d={BOOT_FAR} fill={P(T.boots)} />
      <path d={BOOT_NEAR} fill={P(T.boots)} />
      {color && (
        <g>
          <Mat uid={uid} d={BOOT_FAR} kind="leather" />
          <Mat uid={uid} d={BOOT_NEAR} kind="leather" />
          <path d="M-17.0 1.4 L-3.8 1.4 L-3.8 0 L-16.8 0 Z M-5.4 1.4 L9.4 1.4 L9.4 0 L-5.2 0 Z" fill={T.sole} />
          <path d="M-16.2 2.4 C-15.0 3.6 -13.6 4.4 -12.0 5.0" stroke={T.bootsLight} strokeWidth={0.6} fill="none" opacity={0.7} strokeLinecap="round" />
          <path d="M-4.6 2.6 C-3.4 3.8 -2.0 4.6 -0.4 5.4" stroke={T.bootsLight} strokeWidth={0.6} fill="none" opacity={0.7} strokeLinecap="round" />
          <path d="M5.0 12 C5.4 8 6.4 4 7.8 1.6 L9.4 1.6 C9.6 4 9.4 8 9.0 12.5 Z" fill={T.bootsShadow} opacity={0.5} />
          {fine && <path d="M-9.0 9.6 l1.6 -0.6 M-9.4 7.8 l1.6 -0.6 M3.0 9.8 l1.6 -0.6 M2.6 8.0 l1.6 -0.6" stroke={T.bootsShadow} strokeWidth={0.4} />}
        </g>
      )}
      <path d={LEG_FAR} fill={P(T.trousers)} />
      <path d={LEG_NEAR} fill={P(T.trousers)} />
      {color && (
        <g>
          <Mat uid={uid} d={LEG_FAR} kind="twill" />
          <Mat uid={uid} d={LEG_NEAR} kind="twill" />
          <path d="M1.6 34 C3.6 33.2 6.4 33.4 8.8 34.4" stroke={T.trousersShadow} strokeWidth={0.5} fill="none" opacity={0.5} />
          <path d="M-10.2 30 C-8.4 29.4 -6.2 29.4 -4.4 30.2" stroke={T.trousersShadow} strokeWidth={0.45} fill="none" opacity={0.45} />
          <path d="M-10.8 10.4 C-8.4 11.2 -6.2 11.4 -4.2 10.6 L-4.3 14 C-6.4 13.2 -8.6 13.4 -10.8 14.6 Z" fill={T.trousersShadow} opacity={0.6} />
          <path d="M1.4 10.4 C3.8 11.4 6.6 11.4 9.0 10.6 L9.1 14 C6.8 13.2 4.0 13.4 1.4 14.6 Z" fill={T.trousersShadow} opacity={0.6} />
          <path d="M-10.4 57 C-10.8 40 -11.0 25 -10.8 10.4 L-8.6 10.8 C-8.8 25 -8.6 40 -8.2 57 Z" fill={T.trousersShadow} opacity={0.5} />
          {fine && <path d="M5.6 50 C5.2 40 5.4 30 5.2 18" stroke={T.trousersShadow} strokeWidth={0.4} fill="none" opacity={0.6} />}
          {fine && <path d="M6.2 50 C5.8 40 6.0 30 5.8 18" stroke="#7A6656" strokeWidth={0.25} fill="none" opacity={0.45} />}
        </g>
      )}
      </g>

      {/* ---------- torso (breathes) ---------- */}
      <g transform={`translate(${sw} ${lift}) translate(0 104) scale(1 ${1 + p.breath * 0.004}) translate(0 -104)`}>
        {/* coat collar behind the neck */}
        <path d="M-5.6 151.4 C-5.2 154.6 -3.0 157.2 0.6 157.8 C4.2 158.4 6.6 157.6 7.8 153.4 L6.8 152.4 Z" fill={P(T.coatShadow)} />
        {/* coat body */}
        <path d={coatD} fill={P(T.coat)} />
        {color && (
          <g>
            <Mat uid={uid} d={coatD} kind="wool" />
            {/* far side in shadow, drape folds that follow the hem */}
            <path d={`M-16.2 131 C-15.8 118 -16.0 104 -17.0 88 C-18.0 72 -18.8 62 ${-19.6 - hem * 1.2} ${52.6 + hem * 0.3} L-14.4 51.4 C-13.6 70 -13.0 100 -13.0 131 Z`} fill={T.coatShadow} opacity={0.55} filter={`url(#${uid}-soft06)`} />
            <g filter={`url(#${uid}-soft03)`} fill="none" strokeLinecap="round">
              <path d={fold(12.6, 98, 15.8, 52.2, 0.8)} stroke={T.coatShadow} strokeWidth={1.1} opacity={0.55} />
              <path d={fold(13.4, 98, 16.6, 52.4, 0.8)} stroke={T.coatLight} strokeWidth={0.5} opacity={0.35} />
              <path d={fold(9.0, 92, 11.2, 51.6, 0.6)} stroke={T.coatShadow} strokeWidth={0.9} opacity={0.45} />
              <path d={fold(-13.2, 96, -15.8, 51.6, 1.1)} stroke={T.coatLight} strokeWidth={0.6} opacity={0.25} />
              <path d={fold(-10.6, 92, -12.4, 52, 1.0)} stroke={T.coatShadow} strokeWidth={0.8} opacity={0.4} />
              <path d="M17.2 128 C15.4 122 14.2 116 13.8 108" stroke={T.coatShadow} strokeWidth={0.9} opacity={0.5} />
              <path d="M8.6 150.8 C11.6 149.6 14.6 148.0 16.6 145.6" stroke={T.coatShadow} strokeWidth={0.3} opacity={0.55} />
              <path d="M7.4 93.4 L15.8 94.2" stroke={T.coatShadow} strokeWidth={0.45} opacity={0.6} />
              <path d="M7.4 93.0 L15.8 93.8" stroke={T.coatLight} strokeWidth={0.25} opacity={0.4} />
            </g>
            <path d="M17.0 137 C17.2 120 17.0 104 17.6 80 L18.4 80 C18.0 104 18.2 120 18.2 136 Z" fill={T.coatLight} opacity={0.35} />
            {/* horn buttons on the far front panel */}
            {[139, 124, 109].map((y, i) => (
              <g key={y}>
                <ellipse cx={-9.1 - i * 0.45} cy={y} rx={0.78} ry={0.72} fill="#1C1C20" />
                <ellipse cx={-8.9 - i * 0.45} cy={y + 0.2} rx={0.3} ry={0.22} fill="#5A5C63" opacity={0.6} />
              </g>
            ))}
          </g>
        )}
        {/* open front: sweater + trousers */}
        <path d={OPEN_D} fill={P(T.sweater)} />
        {color && <Mat uid={uid} d={OPEN_D} kind="knit" />}
        <path d="M-8.7 94.6 C-9.2 82 -10.0 66 -10.6 52.2 L3.2 51.0 C3.4 66 3.8 82 4.1 94.4 C0 95.2 -4.4 95.2 -8.7 94.6 Z" fill={P(T.trousers)} />
        {color && (
          <g>
            <Mat uid={uid} d="M-8.7 94.6 C-9.2 82 -10.0 66 -10.6 52.2 L3.2 51.0 C3.4 66 3.8 82 4.1 94.4 C0 95.2 -4.4 95.2 -8.7 94.6 Z" kind="twill" />
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
          <g>
            <Mat uid={uid} d="M3.8 150.2 C4.6 146 5.4 141 5.8 134 C6.0 131 6.0 128.6 5.8 127 L11.2 140.0 L9.8 142.6 L12.2 145.6 C10.6 147.8 8.0 149.6 6.6 150.8 Z" kind="wool" strength={0.8} />
            <path d="M5.8 127 L11.2 140.0 L9.8 142.6 L12.2 145.6" fill="none" stroke={T.coatShadow} strokeWidth={0.45} strokeLinejoin="round" opacity={0.8} />
            <path d="M3.9 149.8 C4.6 146 5.4 141 5.7 134" fill="none" stroke="#6A6D75" strokeWidth={0.22} opacity={0.6} />
            {/* soft shadow the lapels cast on the sweater */}
            <path d="M3.8 150.2 C4.4 146 5.2 140 5.6 132 L3.6 132 C3.4 140 3.0 146 2.6 150 Z" fill="#000" opacity={0.18} filter={`url(#${uid}-soft06)`} />
            <path d="M-4.2 150 C-5.4 145 -6.4 140 -6.8 132 L-5.0 132 C-4.8 140 -4.2 145 -3.4 150 Z" fill="#000" opacity={0.16} filter={`url(#${uid}-soft06)`} />
          </g>
        )}
        {/* crew-neck collar + neck */}
        <path d={NECK_D} fill={P(T.skin)} />
        {color && (
          <g>
            <Mat uid={uid} d={NECK_D} kind="skin" />
            <path d="M-4.9 155.6 C-4.4 153 -4.5 151 -4.9 149.2 L-2.6 149.4 C-2.6 151.6 -2.8 153.8 -3.2 155.4 Z" fill={T.skinShadow} opacity={0.45} filter={`url(#${uid}-soft03)`} />
            <path d="M4.2 158.6 C3.0 156 0.8 152.6 -1.2 150.2" fill="none" stroke={T.skinShadow} strokeWidth={0.5} opacity={0.3} filter={`url(#${uid}-soft03)`} />
            <ellipse cx={-3.9} cy={152.8} rx={0.55} ry={0.9} fill={T.skinLight} opacity={0.3} />
            <path d="M3.2 149.6 L4.8 149.6 C4.8 152 5.0 155 5.5 158.6 L3.6 157.6 C3.4 155 3.2 152 3.2 149.6 Z" fill={T.skinDeep} opacity={0.4} filter={`url(#${uid}-soft06)`} />
          </g>
        )}
        <path d="M-5.0 150.6 C-2.8 147.6 1.8 147.4 4.6 150.0 L4.6 151.8 C1.8 149.4 -2.6 149.6 -4.8 152.2 Z" fill={P(T.sweater)} />
        {color && <path d="M-5.0 150.6 C-2.8 147.6 1.8 147.4 4.6 150.0" fill="none" stroke={T.sweaterShadow} strokeWidth={0.4} />}
        {/* satchel strap across the chest (his left shoulder → right hip) */}
        <path d={STRAP_D} fill={P(T.satchel)} />
        {color && (
          <g>
            <Mat uid={uid} d={STRAP_D} kind="canvas" vol={false} />
            <path d="M16.8 146.4 L-14.6 94.4" stroke="#D8CBB0" strokeWidth={0.22} opacity={0.5} />
            <path d="M13.2 148.6 L-18.4 96.6" stroke={T.satchelShadow} strokeWidth={0.5} opacity={0.8} />
            {fine && <path d="M14.6 147.0 L-16.6 95.6" stroke="#8C7C62" strokeWidth={0.2} strokeDasharray="0.8 0.7" opacity={0.8} />}
            <path d="M16.8 146.4 L13.2 148.6 L12.6 147.2 L16.0 145.0 Z" fill={T.satchelShadow} opacity={0.6} />
          </g>
        )}
        {/* head */}
        <g transform={`rotate(${p.headPitch + p.headTilt} -0.4 153.2)`}>
          <Head34 p={p} mode={mode} uid={uid} frame={p.time * 30} />
        </g>
      </g>

      {/* ---------- far forearm comes in front of the body when he holds the map ---------- */}
      {farFront > 0 && U(<g opacity={farFront}><Sleeve mode={mode} uid={uid} part="fore" S={fS} E={far.elbow} Wr={far.wrist} coat={T.coat} coatShadow={T.coatShadow} coatLight={T.coatLight} sweater={T.sweater} lightSide={1} /></g>)}

      {/* ---------- the map ---------- */}
      {unfolding && showPanels && U(
        <g transform={mapMatrix}>
          <MapPanels mode={mode} id={`${uid}m${mode}`} inkScale={2.6} rowOpen={p.rowOpen} colOpen1={p.colOpen1} colOpen0={p.colOpen0} flutter={p.flutter} detail={p.detail} />
        </g>
      )}
      {(!showPanels || packetBlend < 1) && U(<g opacity={showPanels ? 1 - packetBlend : 1}>{packetAtHand}</g>)}
      {farFront > 0 && U(<g opacity={farFront}>{farHand}</g>)}

      {/* ---------- near arm ---------- */}
      {U(<Sleeve mode={mode} uid={uid} S={nS} E={near.elbow} Wr={near.wrist} coat={T.coat} coatShadow={T.coatShadow} coatLight={T.coatLight} sweater={T.sweater} lightSide={1} />)}
      {/* shoulder cap: the coat's shoulder covers the top of the sleeve, with the armhole seam */}
      {U(<g transform={`translate(0 ${lift})`}>
        <path d={NEAR_CAP} fill={P(T.coat)} />
        {color && (
          <>
            <Mat uid={uid} d={NEAR_CAP} kind="wool" />
            <path d="M17.6 141.0 C16.6 137.6 14.8 135.2 12.4 134.4" fill="none" stroke={T.coatShadow} strokeWidth={0.45} opacity={0.7} />
            <path d="M13.2 148.6 L16.8 146.4 L8.5 132.7 L4.9 134.9 Z" fill={T.satchel} />
            <Mat uid={uid} d="M13.2 148.6 L16.8 146.4 L8.5 132.7 L4.9 134.9 Z" kind="canvas" vol={false} />
            <path d="M16.8 146.4 L8.5 132.7" stroke="#D8CBB0" strokeWidth={0.22} opacity={0.5} />
            <path d="M13.2 148.6 L4.9 134.9" stroke={T.satchelShadow} strokeWidth={0.5} opacity={0.8} />
          </>
        )}
      </g>)}
      {U(hand(nS, near.elbow, near.wrist, p.armBlend > 0.6 && showPanels ? 'grip' : 'relaxed', true, -80 + p.thumbAdj * 6))}
    </g>
  );
};

export const WALKER34_BOUNDS: [number, number, number, number] = [-45, -5, 90, 195];
