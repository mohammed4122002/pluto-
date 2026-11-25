import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, scenes, TOTAL_FRAMES, W} from './config/production';
import {CaptionsOverlay, Timeline} from './Timeline';
import {CharacterSheet, SHEET_H, SHEET_W} from './character/CharacterSheet';
import {LookDev} from './LookDev';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Phase01" component={Timeline} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0, length: TOTAL_FRAMES}} />
    <Composition id="Phase01Clean" component={Timeline} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0, length: TOTAL_FRAMES, burnCaptions: false}} />
    <Composition id="CaptionsOverlay" component={CaptionsOverlay} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0}} />
    <Composition id="LookDev" component={LookDev} durationInFrames={60} fps={FPS} width={W} height={H} />
    <Composition id="CharacterSheet" component={CharacterSheet} durationInFrames={1} fps={FPS} width={SHEET_W} height={SHEET_H} />
    {Object.values(scenes).map((s) => (
      <Composition
        key={s.id}
        id={s.id}
        component={Timeline}
        durationInFrames={s.duration}
        fps={FPS}
        width={W}
        height={H}
        defaultProps={{offset: s.start, length: s.duration}}
      />
    ))}
  </>
);
