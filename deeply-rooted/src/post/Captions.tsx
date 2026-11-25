import React from 'react';
import {captions, captionTrack, H, TimedText, titleTrack, W} from '../config/production';
import {palette} from '../config/palette';
import {ease, ramp} from '../engine/anim';
import {rgba} from '../engine/color';


const vis = (f: number, t: TimedText, fi: number, fo: number) =>
  Math.min(ramp(f, t.from, fi, ease.outSine), 1 - ramp(f, t.to - fo, fo, ease.inSine));

/**
 * The narration on screen, phrase by phrase, exactly as the narrator says it.
 * Quiet typography: one phrase at a time, soft fades, no word-by-word kinetic effects.
 */
export const Captions: React.FC<{frame: number}> = ({frame}) => {
  if (!captions.enabled) return null;
  const active = captionTrack.filter((c) => frame >= c.from && frame < c.to);
  const scrim = Math.max(0, ...active.map((c) => vis(frame, c, captions.fadeIn, captions.fadeOut)));
  const titles = titleTrack.filter((t) => frame >= t.from && frame < t.to);
  return (
    <div style={{position: 'absolute', inset: 0, width: W, height: H, pointerEvents: 'none'}}>
      {scrim > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 300,
            opacity: scrim,
            background: `linear-gradient(to top, ${rgba(palette.charcoal, captions.scrim)} 0%, ${rgba(palette.charcoal, captions.scrim * 0.55)} 45%, ${rgba(palette.charcoal, 0)} 100%)`,
          }}
        />
      )}
      {active.map((c) => {
        const o = vis(frame, c, captions.fadeIn, captions.fadeOut);
        const rise = (1 - ramp(frame, c.from, captions.fadeIn + 4, ease.outCubic)) * 8;
        return (
          <div
            key={c.from}
            style={{
              position: 'absolute',
              left: 160,
              right: 160,
              bottom: captions.bottom,
              textAlign: 'center',
              fontFamily: captions.fontFamily,
              fontSize: captions.fontSize,
              lineHeight: 1.25,
              letterSpacing: 0.3,
              color: captions.color,
              opacity: o,
              transform: `translateY(${rise}px)`,
              textShadow: `0 2px 3px ${rgba('#1A1B1F', 0.55)}, 0 0 24px ${rgba('#1A1B1F', 0.5)}`,
            }}
          >
            {c.text}
          </div>
        );
      })}
      {titles.map((t) => {
        const o = vis(frame, t, 14, 18);
        const common: React.CSSProperties = {
          position: 'absolute',
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: o,
          color: palette.ivory,
          textShadow: `0 2px 4px ${rgba('#1A1B1F', 0.45)}, 0 0 30px ${rgba('#1A1B1F', 0.4)}`,
        };
        if (t.style === 'channel')
          return (
            <div key={t.text} style={{...common, top: 190, fontFamily: 'Inter, "DejaVu Sans", sans-serif', fontSize: 24, letterSpacing: 11, fontWeight: 600, color: palette.gold}}>
              {t.text.toUpperCase()}
            </div>
          );
        if (t.style === 'episode')
          return (
            <div key={t.text} style={{...common, top: 345, fontFamily: captions.fontFamily, fontSize: 34, fontStyle: 'italic', color: palette.beige}}>
              {t.text}
            </div>
          );
        return (
          <div key={t.text} style={{...common, top: 238, fontFamily: captions.fontFamily, fontSize: 80, letterSpacing: 0.5}}>
            {t.text}
          </div>
        );
      })}
    </div>
  );
};
