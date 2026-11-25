import React from 'react';
import {camera, character, FPS, H, lighting, scenes, transitions, W} from '../config/production';
import {tones} from '../config/palette';
import {clamp, ease, lerp, pulse, ramp, track} from '../engine/anim';
import {Cam, project} from '../engine/camera';
import {mix, rgba} from '../engine/color';
import {Drawable} from '../engine/DepthStack';
import {noise1} from '../engine/noise';
import {alongPath, distAtZ} from '../environment/geometry';
import {Hand} from '../character/Hands';
import {Lit} from '../character/Lighting';
import {capsule} from '../character/Limb';
import {WalkerBack, WALKERBACK_BOUNDS} from '../character/WalkerBack';
import {MapArt, MapPanels, MAP_H, MAP_W, OFFSET} from '../props/PaperMap';
import {MistPass} from '../post/Grade';
import {
  IMAGINED_LIGHT,
  imaginedFog,
  imaginedGrass,
  imaginedHaze,
  imaginedPatches,
  imaginedPath,
  imaginedRidges,
  imaginedTree,
  imaginedTufts,
  mapArtGeometry,
  matchCam,
} from '../worlds/imagined';
import {flutterAt, presentEndPose, windAt} from './performance';
import {PresentMedium} from './PresentShots';
import {World, WorldView} from './WorldView';

const TR = transitions;
const S3 = scenes.scene03;
const MATCH0 = TR.mapMatchStart;
const MATCH1 = TR.mapMatchStart + TR.mapMatchDuration;
const RET0 = TR.returnToPresentStart;
const RET1 = TR.returnToPresentStart + TR.returnToPresentDuration;
const geo = mapArtGeometry();

export const imaginedWorld: World = {
  id: 'imagined',
  light: IMAGINED_LIGHT,
  paths: [imaginedPath],
  patches: imaginedPatches,
  ridges: imaginedRidges,
  fog: imaginedFog,
  tufts: imaginedTufts,
  grass: imaginedGrass,
  haze: imaginedHaze,
  tree: imaginedTree,
  treeLook: {lush: 1.1, lightColor: IMAGINED_LIGHT.rim, lightAmount: 0.95, lightDir: 1, shadow: true},
};

// ---------------------------------------------------------------------------------------------
// 1. POV — the open map in his hands; the camera pushes into the drawn route.
// ---------------------------------------------------------------------------------------------
const PIVOT: [number, number] = [geo.route[Math.floor(geo.route.length * 0.45)][0] + OFFSET[0], geo.route[Math.floor(geo.route.length * 0.45)][1] + OFFSET[1]];

/** Map-local → screen transform for the push (scale s, pivot landing at A). */
const mapPush = (frame: number) => {
  const e = ramp(frame, S3.start, MATCH0 - S3.start, ease.outSine);
  const s = camera.mapPush.fromScale * Math.pow(camera.mapPush.toScale / camera.mapPush.fromScale, e);
  const A0: [number, number] = [W / 2 + 40, H / 2 + 70];
  const A1: [number, number] = [PIVOT[0] - OFFSET[0], PIVOT[1] - OFFSET[1]];
  const A: [number, number] = [lerp(A0[0], A1[0], e), lerp(A0[1], A1[1], e)];
  const breath = (1 - e) * 4 * Math.sin((frame / character.breathPeriod) * Math.PI * 2);
  const rot = (1 - e) * (-1.6 + 0.4 * noise1(frame / 40, 5));
  return {s, e, A, breath, rot, matrix: `translate(${A[0]} ${A[1] + breath}) rotate(${rot}) scale(${s}) translate(${-PIVOT[0]} ${-PIVOT[1]})`};
};

const PovGround: React.FC<{frame: number; e: number}> = ({frame, e}) => {
  const k = 1 + 0.14 * e;
  const drift = (frame - S3.start) * 0.6;
  const L = lighting.present;
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0, filter: 'blur(16px)'}}>
      <g transform={`translate(${W / 2} ${H / 2}) scale(${k}) translate(${-W / 2} ${-H / 2})`}>
        <rect width={W} height={H} fill={mix(L.ground, L.groundFar, 0.15)} />
        <path d="M2100 1200 C1500 900 1100 640 700 380 C420 200 200 60 -100 -80 L-100 300 C200 420 520 640 860 900 C1060 1050 1200 1140 1300 1200 Z" fill={mix(L.path, L.ground, 0.25)} />
        <path d="M2100 1200 C1560 940 1180 700 780 450 C520 290 260 160 -100 30" stroke={mix(L.path, L.ground, 0.55)} strokeWidth={26} fill="none" opacity={0.5} />
        {[...Array(26)].map((_, i) => {
          const x = (i * 97) % 1900, y = 120 + ((i * 211) % 900);
          return <path key={i} d={`M${x} ${y} l${-8 + (i % 5) * 4} -60 M${x + 14} ${y} l${10 - (i % 3) * 6} -70`} stroke={i % 3 ? '#4B5141' : '#8E8770'} strokeWidth={9} strokeLinecap="round" />;
        })}
        {/* his boots and trouser hems, far below the map */}
        <ellipse cx={810} cy={1080} rx={92} ry={70} fill={tones.boots} />
        <ellipse cx={1110} cy={1088} rx={92} ry={66} fill={tones.boots} />
        <path d="M700 1090 C720 1030 760 1000 810 996 C860 1000 900 1030 920 1090 Z" fill={tones.trousers} />
        <path d="M1000 1100 C1020 1040 1060 1010 1110 1006 C1160 1010 1200 1040 1220 1100 Z" fill={tones.trousers} />
        {/* coat fronts at the frame edges */}
        <path d="M-60 1120 C120 900 260 780 380 720 L520 1120 Z" fill={tones.coat} />
        <path d="M1980 1120 C1800 900 1660 780 1540 720 L1400 1120 Z" fill={tones.coat} />
      </g>
      <rect width={W} height={H} fill={L.haze} opacity={0.22 + 0.06 * Math.sin(drift / 30)} />
    </svg>
  );
};

/** His hands and sleeves holding the sheet, in map-local units (40 units = 1 cm). */
const PovHands: React.FC<{part: 'back' | 'thumb'}> = ({part}) => {
  const u = 40;
  const hand = (x: number, y: number, rot: number, mirror: boolean) => (
    <g transform={`translate(${x} ${y}) scale(${u} ${-u}) rotate(${rot})`}>
      <Hand mode="color" pose={part === 'back' ? 'gripBack' : 'gripThumb'} mirror={mirror} />
    </g>
  );
  if (part === 'thumb')
    return (
      <g>
        {hand(-150, 1040, 90, false)}
        {hand(MAP_W + 150, 1040, -90, true)}
      </g>
    );
  const sleeve = (a: [number, number], b: [number, number]) => (
    <g>
      <path d={capsule(a, [a[0] + (b[0] - a[0]) * 0.06, a[1] + (b[1] - a[1]) * 0.06], 150, 140, 0)} fill={tones.sweater} />
      <path d={capsule([a[0] + (b[0] - a[0]) * 0.05, a[1] + (b[1] - a[1]) * 0.05], b, 190, 260, 0.05)} fill={tones.coat} />
      <path d={capsule([a[0] + (b[0] - a[0]) * 0.07, a[1] + (b[1] - a[1]) * 0.07], [a[0] + (b[0] - a[0]) * 0.12, a[1] + (b[1] - a[1]) * 0.12], 200, 205, 0)} fill={tones.coatShadow} opacity={0.6} />
    </g>
  );
  return (
    <g>
      {sleeve([-190, 1080], [-1100, 2900])}
      {sleeve([MAP_W + 190, 1080], [MAP_W + 1100, 2900])}
      {hand(-150, 1040, 90, false)}
      {hand(MAP_W + 150, 1040, -90, true)}
    </g>
  );
};

const MapPOV: React.FC<{frame: number}> = ({frame}) => {
  const m = mapPush(frame);
  const flutter = flutterAt(frame) * (1 - m.e);
  const cool = 0.3 * (1 - ramp(frame, MATCH0 - 40, 60));
  return (
    <div style={{position: 'absolute', inset: 0}}>
      <PovGround frame={frame} e={m.e} />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
        <defs>
          <filter id="povShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={18} />
          </filter>
        </defs>
        <g transform={m.matrix}>
          <rect x={30} y={60} width={MAP_W} height={MAP_H} fill="#1E1F22" opacity={0.35} filter="url(#povShadow)" />
          <PovHands part="back" />
          <MapPanels mode="color" id="pov" rowOpen={1} colOpen1={1} colOpen0={1} flutter={flutter * 0.5} crease={1} />
          <rect width={MAP_W} height={MAP_H} fill="#7F8C96" opacity={cool} style={{mixBlendMode: 'multiply'}} />
          <PovHands part="thumb" />
        </g>
      </svg>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// 2. THE MATCH — the paper dissolves outward from the ink route like a watercolour wash,
//    revealing the imagined world exactly beneath the drawing.
// ---------------------------------------------------------------------------------------------
const routeD = geo.route.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('');

const MapDissolve: React.FC<{frame: number}> = ({frame}) => {
  const t = ramp(frame, MATCH0, TR.mapMatchDuration, ease.inOutCubic);
  const w = lerp(0, 3400, t);
  const treeR = lerp(0, 1700, ramp(frame, MATCH0 + 10, TR.mapMatchDuration - 10, ease.inCubic));
  const ink = 1 - ramp(frame, MATCH0 + 34, 56, ease.inOutSine);
  const crease = 1 - ramp(frame, MATCH0, 40);
  const paperGone = t >= 0.999;
  return (
    <svg width={W} height={H} style={{position: 'absolute', inset: 0}}>
      <defs>
        <filter id="wash" x="-30%" y="-30%" width="160%" height="160%" filterUnits="userSpaceOnUse">
          <feTurbulence type="fractalNoise" baseFrequency="0.006 0.009" numOctaves={3} seed={7} />
          <feDisplacementMap in="SourceGraphic" scale={170} xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation={14} />
        </filter>
        <mask id="paperMask" maskUnits="userSpaceOnUse" x={-200} y={-200} width={W + 400} height={H + 400}>
          <rect x={-200} y={-200} width={W + 400} height={H + 400} fill="#fff" />
          <g filter="url(#wash)">
            <path d={routeD} stroke="#000" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx={geo.tree.x} cy={geo.tree.y - 3 * geo.tree.s} r={treeR} fill="#000" />
          </g>
        </mask>
      </defs>
      {!paperGone && (
        <g mask="url(#paperMask)">
          <g transform={`translate(${-OFFSET[0]} ${-OFFSET[1]})`}>
            <MapPanels mode="color" id="dis" rowOpen={1} colOpen1={1} colOpen0={1} crease={crease} ink={0} />
          </g>
          {/* pigment gathering at the wet edge */}
          <g filter="url(#wash)" opacity={0.55 * (1 - t * 0.5)}>
            <path d={routeD} stroke={palette_gold()} strokeWidth={w + 140} strokeLinecap="round" fill="none" opacity={0.5} />
          </g>
        </g>
      )}
      <g transform={`translate(${-OFFSET[0]} ${-OFFSET[1]})`} opacity={ink}>
        <MapArt mode="color" paper={0} ink={1} />
      </g>
    </svg>
  );
};
const palette_gold = () => '#C9AF78';

// ---------------------------------------------------------------------------------------------
// 3. THE IMAGINED FUTURE — warm light, a clear path, the same man walking with certainty.
// ---------------------------------------------------------------------------------------------
const STRIDE = 1.45; // metres per full stride cycle

export const imaginedWalker = (cam: Cam, frame: number, id: string): Drawable | null => {
  const d0 = distAtZ(imaginedPath, character.s3.walkStartZ);
  const dist = d0 + (character.s3.walkSpeed * (frame - MATCH0)) / FPS;
  const pos = alongPath(imaginedPath, dist);
  const p = project(cam, pos.x, 0, pos.z);
  if (!p) return null;
  const k = p.s / 100;
  const L = IMAGINED_LIGHT;
  return {
    key: id,
    depth: p.d,
    node: (
      <g transform={`translate(${p.x} ${p.y}) scale(${k} ${-k})`}>
        <ellipse cx={-6} cy={-1} rx={34} ry={5} fill="#5C5237" opacity={0.3} transform="scale(1 -1)" />
        <Lit
          id={id}
          bounds={WALKERBACK_BOUNDS}
          light={{
            rim: L.rim,
            rimStrength: 0.85,
            rimWidth: Math.max(0.6, 2.2 / k),
            rimDir: 1,
            fill: '#8C7A5E',
            fillStrength: 0.32,
            haze: L.groundFar,
            hazeAmount: imaginedHaze(p.d) * 0.6,
            texture: 0.2,
          }}
          render={(m) => <WalkerBack mode={m} phase={dist / STRIDE} walk={1} wind={windAt(frame)} detail={k > 2.2 ? 1 : 0} />}
        />
      </g>
    ),
  };
};

const imaginedCam = (frame: number): Cam => {
  const t = ramp(frame, TR.imaginedCameraStart, RET1 - TR.imaginedCameraStart, ease.inOutSine) * camera.speed;
  const a = camera.imagined.from, b = camera.imagined.to;
  return {...matchCam, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), focus: 14};
};

const ImaginedShot: React.FC<{frame: number}> = ({frame}) => {
  const cam = imaginedCam(frame);
  const walker = imaginedWalker(cam, frame, 'walkerBack');
  const sun = track(frame, [
    [MATCH0, 0.35],
    [MATCH0 + 200, 1.25, ease.inOutSine],
    [RET0, 1.35],
    [RET1, 0.6, ease.inOutSine],
  ]);
  const fogMul = 1 + 3.2 * ramp(frame, RET0, TR.returnToPresentDuration * 0.6, ease.inOutSine);
  return (
    <div style={{position: 'absolute', inset: 0}}>
      <WorldView world={imaginedWorld} cam={cam} frame={frame} extras={walker ? [walker] : []} glowBoost={sun} fogMul={fogMul} />
      {/* low sun haze behind the tree */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 38% 34% at 72% 30%, ${rgba('#F6E2B4', 0.42 * clamp(sun - 0.3))} 0%, rgba(246,226,180,0) 100%)`,
          mixBlendMode: 'screen',
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
// Scene 03 assembly
// ---------------------------------------------------------------------------------------------
export const Scene03: React.FC<{frame: number}> = ({frame}) => {
  const showPOV = frame < MATCH0 + 2;
  const showImagined = frame >= MATCH0 && frame < RET1 + 2;
  const showPresent = frame >= RET0 + 10;
  const imaginedOpacity = 1 - ramp(frame, RET0 + 24, 40, ease.inOutSine);
  const mist = pulse(frame, RET0, 34, RET1 + 30, 44, ease.inOutSine);
  const mistColor = mix(lighting.imagined.haze, lighting.present.haze, ramp(frame, RET0 + 10, 50));
  return (
    <div style={{position: 'absolute', inset: 0}}>
      {showPresent && (
        <PresentMedium
          frame={frame}
          start={RET0}
          end={S3.start + S3.duration}
          tRange={[0.92, 1]}
          pose={presentEndPose(frame)}
          focusKeys={[[RET0, -1]]}
          glowBoost={1.5}
        />
      )}
      {showImagined && (
        <div style={{position: 'absolute', inset: 0, opacity: imaginedOpacity}}>
          <ImaginedShot frame={frame} />
        </div>
      )}
      {frame >= MATCH0 && frame < MATCH1 + 2 && <MapDissolve frame={frame} />}
      {showPOV && <MapPOV frame={frame} />}
      <MistPass frame={frame} amount={mist * 0.9} color={mistColor} dir={-1} />
    </div>
  );
};
