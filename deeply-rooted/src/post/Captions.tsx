import React from 'react';
import {captions, captionTrack, H, TimedText, titleTrack, W} from '../config/production';
import {palette} from '../config/palette';
import {ease, ramp} from '../engine/anim';
import {rgba} from '../engine/color';
import {ensureFonts, SUB_FONT, TITLE_FONT} from './fonts';

ensureFonts();

const vis = (f: number, t: TimedText, fi: number, fo: number) =>
  Math.min(ramp(f, t.from, fi, ease.outSine), 1 - ramp(f, t.to - fo, fo, ease.inSine));

/**
 * The narration on screen, phrase by phrase, exactly as the narrator says it.
 * Mobile-first: large Inter Medium, at most two balanced lines, title-safe margins, a soft
 * feathered plate for contrast on bright backgrounds, gentle fades only.
 * Rendered as its own layer (see the CaptionsOverlay composition) so it stays editable.
 */
export const Captions: React.FC<{frame: number; titles?: boolean; subs?: boolean}> = ({frame, titles = true, subs = true}) => {
  const active = subs ? captionTrack.filter((c) => frame >= c.from && frame < c.to) : [];
  const tActive = titles ? titleTrack.filter((t) => frame >= t.from && frame < t.to) : [];
  return (
    <div style={{position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none'}}>
      {active.map((c) => {
        const o = vis(frame, c, captions.fadeIn, captions.fadeOut);
        return (
          <div
            key={c.from}
            style={{position: 'absolute', left: 0, right: 0, bottom: captions.bottom, display: 'flex', justifyContent: 'center', opacity: o}}
          >
            <div
              style={{
                maxWidth: captions.maxWidth,
                padding: '10px 28px 12px',
                borderRadius: 18,
                background: rgba('#1C1D21', captions.plate),
                boxShadow: `0 0 70px 34px ${rgba('#1C1D21', captions.plate * 1.05)}`,
                fontFamily: SUB_FONT,
                fontWeight: captions.weight,
                fontSize: captions.fontSize,
                lineHeight: captions.lineHeight,
                letterSpacing: 0.2,
                color: captions.color,
                textAlign: 'center',
                textWrap: 'balance' as React.CSSProperties['textWrap'],
                textShadow: `0 1px 2px ${rgba('#121316', 0.55)}`,
              }}
            >
              {c.text}
            </div>
          </div>
        );
      })}
      {tActive.map((t) => {
        const o = vis(frame, t, 16, 20);
        const common: React.CSSProperties = {
          position: 'absolute',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: o,
          color: palette.ivory,
          textShadow: `0 2px 6px ${rgba('#1A1B1F', 0.4)}, 0 0 36px ${rgba('#1A1B1F', 0.35)}`,
        };
        if (t.style === 'channel')
          return (
            <div key={t.text} style={{...common, top: 170, fontFamily: SUB_FONT, fontWeight: 600, fontSize: 22, letterSpacing: 12, color: palette.gold}}>
              {t.text.toUpperCase()}
            </div>
          );
        if (t.style === 'episode')
          return (
            <div key={t.text} style={{...common, top: 352, fontFamily: TITLE_FONT, fontSize: 40, fontStyle: 'italic', fontWeight: 500, color: palette.beige}}>
              {t.text}
            </div>
          );
        return (
          <div key={t.text} style={{...common, top: 214, fontFamily: TITLE_FONT, fontWeight: 600, fontSize: 98, letterSpacing: 0.5, lineHeight: 1.05}}>
            {t.text}
          </div>
        );
      })}
    </div>
  );
};
