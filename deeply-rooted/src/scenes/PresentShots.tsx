import React from 'react';
import {camera, H, W} from '../config/production';
import {ease, lerp, ramp, track} from '../engine/anim';
import {Cam} from '../engine/camera';
import {Pose34} from '../character/Walker34';
import {
  PRESENT_LIGHT,
  presentFog,
  presentGrass,
  presentHaze,
  presentPatches,
  presentPaths,
  presentRidges,
  presentTree,
  presentTufts,
  WALKER_POS,
} from '../worlds/present';
import {World, WorldView, walkerDrawable} from './WorldView';

export const presentWorld: World = {
  id: 'present',
  light: PRESENT_LIGHT,
  paths: presentPaths,
  patches: presentPatches,
  ridges: presentRidges,
  fog: presentFog,
  tufts: presentTufts,
  grass: presentGrass,
  haze: presentHaze,
  tree: presentTree,
  treeLook: {lush: 0.88, lightColor: PRESENT_LIGHT.rim, lightAmount: 0.25, lightDir: 1, shadow: false},
};

type Shot = typeof camera.wide;
/** Camera position along a shot's move; `camera.speed` scales how far the move travels. */
export const shotCam = (shot: Shot, t: number, focus: number): Cam => {
  const k = t * camera.speed;
  return {
    x: lerp(shot.from.x, shot.to.x, k),
    y: lerp(shot.from.y, shot.to.y, k),
    z: lerp(shot.from.z, shot.to.z, k),
    f: shot.f,
    horizon: shot.horizon,
    focus,
    aperture: shot.aperture,
  };
};

/** Scene 01 — the wide establishing shot with a slow push toward him. */
export const PresentWide: React.FC<{frame: number; start: number; end: number; pose: Pose34}> = ({frame, start, end, pose}) => {
  const t = ramp(frame, start, end - start, ease.inOutSine);
  const c0 = shotCam(camera.wide, t, 1);
  const cam = {...c0, focus: WALKER_POS.z - c0.z};
  const walker = walkerDrawable(cam, presentWorld, pose, WALKER_POS, 'walkerWide');
  return <WorldView world={presentWorld} cam={cam} frame={frame} extras={walker ? [walker] : []} glowBoost={1 + 0.25 * t} />;
};

/** Scene 02 (and the end of Scene 03) — the medium shot with rack focus. */
export const PresentMedium: React.FC<{
  frame: number;
  start: number;
  end: number;
  pose: Pose34;
  focusKeys: [number, number][]; // [frame, focus distance or -1 for "on him"]
  glowBoost?: number;
  tRange?: [number, number]; // portion of the medium camera move this shot covers
}> = ({frame, start, end, pose, focusKeys, glowBoost = 1.3, tRange = [0, 1]}) => {
  const t = lerp(tRange[0], tRange[1], ramp(frame, start, end - start, ease.inOutSine));
  const c0 = shotCam(camera.medium, t, 1);
  const dSubject = WALKER_POS.z - c0.z - 0.25;
  const focus = focusKeys.length === 1 ? (focusKeys[0][1] < 0 ? dSubject : focusKeys[0][1]) : track(
    frame,
    focusKeys.map(([f, v]) => [f, v < 0 ? dSubject : v, ease.inOutCubic] as [number, number, typeof ease.inOutCubic]),
  );
  const cam = {...c0, focus};
  const walker = walkerDrawable(cam, presentWorld, pose, WALKER_POS, 'walkerMed');
  return (
    <div style={{position: 'absolute', inset: 0, width: W, height: H}}>
      <WorldView world={presentWorld} cam={cam} frame={frame} extras={walker ? [walker] : []} glowBoost={glowBoost} />
    </div>
  );
};
