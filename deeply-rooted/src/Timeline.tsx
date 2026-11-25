import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {character, grade, lighting, scenes, TOTAL_FRAMES, transitions} from './config/production';
import {Soundtrack} from './audio/Soundtrack';
import {Captions} from './post/Captions';
import {ease, pulse, ramp, track} from './engine/anim';
import {Graded, MistPass} from './post/Grade';
import {PresentMedium, PresentWide} from './scenes/PresentShots';
import {Scene03} from './scenes/Scene03';
import {scene1Pose, scene2Pose} from './scenes/performance';

const S1 = scenes.scene01, S2 = scenes.scene02, S3 = scenes.scene03;

/** Focus pulls for the medium shot (−1 = focus on him). */
export const s2FocusKeys = (): [number, number][] => {
  const c = character.s2;
  return [
    [S2.start, -1],
    [c.rackToPaths[0], -1],
    [c.rackToPaths[0] + c.rackToPaths[1], 38],
    [c.rackBack[0], 38],
    [c.rackBack[0] + c.rackBack[1], -1],
  ];
};

/** Which shot is on screen and its colour temperature, for any global frame. */
const Picture: React.FC<{f: number}> = ({f}) => {
  if (f < S2.start) return <PresentWide frame={f} start={S1.start} end={S2.start} pose={scene1Pose(f)} />;
  if (f < S3.start) return <PresentMedium frame={f} start={S2.start} end={S3.start + 40} pose={scene2Pose(f)} focusKeys={s2FocusKeys()} />;
  return <Scene03 frame={f} />;
};

export const warmthAt = (f: number) =>
  track(f, [
    [0, -0.9],
    [transitions.mapMatchStart, -0.6],
    [transitions.mapMatchStart + transitions.mapMatchDuration, 0.55, ease.inOutSine],
    [transitions.returnToPresentStart - 30, 0.95, ease.inOutSine],
    [transitions.returnToPresentStart + transitions.returnToPresentDuration, -0.9, ease.inOutSine],
  ]);

/**
 * The master timeline. `offset` lets each Scene composition render a slice of the same film,
 * so scene previews and the combined cut are frame-identical.
 */
export const Timeline: React.FC<{offset?: number; length?: number}> = ({offset = 0, length = TOTAL_FRAMES}) => {
  const f = useCurrentFrame() + offset;
  const wipe = transitions.fogWipeS1toS2;
  const mist = pulse(f, S2.start - wipe / 2, wipe / 2, S2.start + wipe / 2, wipe / 2, ease.inOutSine);
  const fadeIn = 1 - ramp(f, 0, transitions.fadeInFromCharcoal, ease.inOutSine);
  const fadeOut = ramp(f, TOTAL_FRAMES - transitions.fadeOutToCharcoal, transitions.fadeOutToCharcoal, ease.inOutSine);
  const black = Math.max(fadeIn, fadeOut);
  return (
    <AbsoluteFill style={{background: grade.fadeColor}}>
      <Graded frame={f} warmth={warmthAt(f)}>
        <Picture f={f} />
        <MistPass frame={f} amount={mist * 0.92} color={lighting.present.haze} />
      </Graded>
      {/* the narration on screen, above the grade */}
      <Captions frame={f} />
      {black > 0.001 && <AbsoluteFill style={{background: grade.fadeColor, opacity: black}} />}
      {/* narration segments + sound effects, each an editable named track */}
      <Soundtrack offset={offset} length={length} />
    </AbsoluteFill>
  );
};
