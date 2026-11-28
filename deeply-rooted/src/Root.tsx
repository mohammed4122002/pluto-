import React from 'react';
import {Composition} from 'remotion';
import {FPS, H, scenes, TOTAL_FRAMES, W} from './config/production';
import {CaptionsOverlay, Timeline} from './Timeline';
import {CharacterSheet, SHEET_H, SHEET_W} from './character/CharacterSheet';
import {LookDev} from './LookDev';
import {SSHEET_H, SSHEET_W, StickmanSheet} from './stickman/StickmanSheet';
import {Pilot01, PILOT_FPS, PILOT_FRAMES, PilotSubsAR, PilotSubsEN} from './pilot/Pilot01';
import {Pilot01VoiceTest, PILOT_FRAMES as VT_FRAMES, VoiceTestSubsAR, VoiceTestSubsEN} from './pilot/Pilot01VoiceTest';
import {Pilot01Bilingual, Pilot01BilingualSubs} from './pilot/Pilot01Bilingual';
import {BilingualCueStill, Episode01, Episode01Preview, Episode01Vertical, Episode01VerticalPreview, EP_FRAMES} from './episode01/Episode01';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Phase01" component={Timeline} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0, length: TOTAL_FRAMES}} />
    <Composition id="Phase01Clean" component={Timeline} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0, length: TOTAL_FRAMES, burnCaptions: false}} />
    <Composition id="CaptionsOverlay" component={CaptionsOverlay} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} defaultProps={{offset: 0}} />
    <Composition id="Pilot01" component={Pilot01} durationInFrames={PILOT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Pilot01SubsEN" component={PilotSubsEN} durationInFrames={PILOT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Pilot01SubsAR" component={PilotSubsAR} durationInFrames={PILOT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Pilot01VoiceTest" component={Pilot01VoiceTest} durationInFrames={VT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Pilot01VoiceTestSubsEN" component={VoiceTestSubsEN} durationInFrames={VT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Pilot01VoiceTestSubsAR" component={VoiceTestSubsAR} durationInFrames={VT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Pilot01Bilingual" component={Pilot01Bilingual} durationInFrames={VT_FRAMES} fps={PILOT_FPS} width={W} height={H} defaultProps={{showSafeZone: false}} />
    <Composition id="Pilot01BilingualSubs" component={Pilot01BilingualSubs} durationInFrames={VT_FRAMES} fps={PILOT_FPS} width={W} height={H} />
    <Composition id="Episode01" component={Episode01} durationInFrames={EP_FRAMES} fps={30} width={W} height={H} />
    <Composition id="Episode01Preview" component={Episode01Preview} durationInFrames={EP_FRAMES} fps={30} width={W} height={H} defaultProps={{showSafeZone: false}} />
    <Composition id="Episode01Vertical" component={Episode01Vertical} durationInFrames={EP_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="Episode01VerticalPreview" component={Episode01VerticalPreview} durationInFrames={EP_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="BilingualCueStillVertical" component={BilingualCueStill} durationInFrames={1} fps={30} width={1080} height={1920} defaultProps={{en: 'Have you ever looked at your life…', ar: 'هل نظرتَ يومًا إلى حياتك…', scrim: false}} />
    <Composition id="BilingualCueStill" component={BilingualCueStill} durationInFrames={1} fps={30} width={W} height={H} defaultProps={{en: 'Have you ever looked at your life…', ar: 'هل نظرتَ يومًا إلى حياتك…', scrim: false}} />
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
