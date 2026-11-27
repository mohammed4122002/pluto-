import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BilingualSubtitles} from '../subtitles/BilingualSubtitles';
import {BilingualCue} from '../subtitles/style';
import timed from '../data/subtitles/pilot01.timed.json';
import {Pilot01VoiceTest} from './Pilot01VoiceTest';

/**
 * Pilot 01 with the channel's bilingual subtitles (English above, Arabic beneath, always together).
 * Picture and sound are the voice-test pilot, unchanged. Cues come from src/data/subtitles/pilot01.cues.json
 * via scripts/subtitles/build_subtitles.py.
 */
const cues = timed.cues as BilingualCue[];

/** Transparent subtitle layer, composited over the painted picture in post (text stays crisp, never painted). */
export const Pilot01BilingualSubs: React.FC = () => <BilingualSubtitles cues={cues} />;

/** Studio preview: picture + sound + bilingual subtitles in one composition (set showSafeZone to check staging). */
export const Pilot01Bilingual: React.FC<{showSafeZone?: boolean}> = ({showSafeZone = false}) => (
  <AbsoluteFill>
    <Pilot01VoiceTest />
    <BilingualSubtitles cues={cues} showSafeZone={showSafeZone} />
  </AbsoluteFill>
);
