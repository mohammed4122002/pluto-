import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {loadFont} from '@remotion/fonts';
import arabic500 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2';
import {ensureFonts} from '../post/fonts';
import {ramp} from '../engine/anim';
import {BILINGUAL_STYLE, BILINGUAL_STYLE_VERTICAL, BilingualCue, subtitleZoneTop} from './style';

let arabicLoaded = false;
const ensureArabic = () => {
  if (arabicLoaded) return;
  arabicLoaded = true;
  loadFont({family: 'DR Arabic', url: arabic500, weight: '500'});
};

/**
 * The channel's bilingual subtitle layer — one component for every Deeply Rooted episode.
 * Feed it timed cues (built from the narration's word timings by scripts/subtitles/build_subtitles.py);
 * it never needs per-scene styling. Render it over the picture, or alone as a transparent overlay.
 */
export const BilingualSubtitles: React.FC<{cues: BilingualCue[]; showSafeZone?: boolean}> = ({cues, showSafeZone = false}) => {
  ensureFonts();
  ensureArabic();
  const frame = useCurrentFrame();
  const {height, width} = useVideoConfig();
  const vertical = height > width; // 9:16 Shorts master → the vertical layout, same identity
  const s = vertical ? width / 1080 : height / 1080;
  const S = BILINGUAL_STYLE;
  const V = BILINGUAL_STYLE_VERTICAL;
  const cue = cues.find((c) => frame >= c.from && frame < c.to);
  const o = cue ? Math.min(ramp(frame, cue.from, S.fadeIn), 1 - ramp(frame, cue.to - S.fadeOut, S.fadeOut)) : 0;
  const line = (lang: 'en' | 'ar', text: string): React.CSSProperties => {
    const t = S[lang];
    return {
      fontFamily: t.family,
      fontWeight: t.weight,
      fontSize: (vertical ? (lang === 'en' ? V.enSize : V.arSize) : t.size) * s,
      lineHeight: vertical ? (lang === 'en' ? 1.22 : 1.38) : t.lineHeight,
      letterSpacing: t.letterSpacing * s,
      whiteSpace: vertical ? 'normal' : 'nowrap',
      textWrap: vertical ? 'balance' : undefined,
      textAlign: 'center',
      unicodeBidi: 'isolate',
      color: S.color,
      textShadow: S.shadow,
    };
  };
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {cue?.scrim && !vertical && (
        <AbsoluteFill
          style={{
            top: 'auto',
            height: S.scrim.height * s,
            opacity: o,
            background: `linear-gradient(to top, rgba(4,6,10,${S.scrim.opacity}) 0%, rgba(4,6,10,${S.scrim.opacity * 0.55}) 45%, rgba(4,6,10,0) 100%)`,
          }}
        />
      )}
      {showSafeZone && (
        <div style={{position: 'absolute', left: 0, right: 0, top: subtitleZoneTop(height), bottom: 0, border: '2px dashed rgba(255,80,80,0.8)', background: 'rgba(255,80,80,0.08)'}} />
      )}
      {cue && vertical && (
        <div
          style={{
            position: 'absolute',
            left: (V.centerX - V.maxWidth / 2) * s,
            width: V.maxWidth * s,
            bottom: V.bottom * s,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: V.gap * s,
            opacity: o,
          }}
        >
          <div lang="en" dir="ltr" style={line('en', cue.en)}>
            {cue.en}
          </div>
          <div lang="ar" dir="rtl" style={line('ar', cue.ar)}>
            {cue.ar}
          </div>
        </div>
      )}
      {cue && !vertical && (
        <div
          style={{
            position: 'absolute',
            left: S.sideMargin * s,
            right: S.sideMargin * s,
            bottom: S.bottom * s,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: S.gap * s,
            opacity: o,
            maxWidth: width - 2 * S.sideMargin * s,
          }}
        >
          <div lang="en" dir="ltr" style={line('en', cue.en)}>
            {cue.en}
          </div>
          <div lang="ar" dir="rtl" style={line('ar', cue.ar)}>
            {cue.ar}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
