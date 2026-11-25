import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, scenes, TOTAL_FRAMES, W} from './config/production';
import {Timeline} from './Timeline';
import {CharacterSheet, SHEET_H, SHEET_W} from './character/CharacterSheet';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Phase01" component={Timeline} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0, length: TOTAL_FRAMES}} />
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
