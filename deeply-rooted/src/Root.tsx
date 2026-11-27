import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, scenes, TOTAL_FRAMES, W} from './config/production';
import {CaptionsOverlay, Timeline} from './Timeline';
import {CharacterSheet, SHEET_H, SHEET_W} from './character/CharacterSheet';
import {LookDev} from './LookDev';
import {SSHEET_H, SSHEET_W, StickmanSheet} from './stickman/StickmanSheet';
import {Pilot01, PILOT_FPS, PILOT_FRAMES, PilotSubsAR, PilotSubsEN} from './pilot/Pilot01';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Phase01" component={Timeline} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0, length: TOTAL_FRAMES}} />
    <Composition id="Phase01Clean" component={Timeline} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0, length: TOTAL_FRAMES, burnCaptions: false}} />
    <Composition id="CaptionsOverlay" component={CaptionsOverlay} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0}} />
    <Composition id="Pilot01" component={Pilot01} durationInFrames={PILOT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Pilot01SubsEN" component={PilotSubsEN} durationInFrames={PILOT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Pilot01SubsAR" component={PilotSubsAR} durationInFrames={PILOT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="StickmanSheet" component={StickmanSheet} durationInFrames={1} fps={FPS} width={SSHEET_W} height={SSHEET_H} />
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
