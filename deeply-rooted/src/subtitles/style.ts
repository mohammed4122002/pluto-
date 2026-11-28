/**
 * DEEPLY ROOTED — channel subtitle identity (bilingual, burned in).
 * English on the first line, Arabic directly beneath, both centred near the bottom, always visible together.
 * Values are for a 1080p frame and scale with the composition height.
 */
export const BILINGUAL_STYLE = {
  color: '#F4EFE6', // soft ivory
  /** distance from the frame bottom to the bottom of the Arabic line box */
  bottom: 56,
  /** space between the English line box and the Arabic line box */
  gap: 4,
  en: {family: '"DR Inter", Inter, "Helvetica Neue", Arial, sans-serif', size: 42, weight: 500, lineHeight: 1.2, letterSpacing: 0.25},
  // Arabic glyphs sit optically smaller than Latin at the same px size → +4 px keeps the two lines equal in weight
  ar: {family: '"DR Arabic", "IBM Plex Sans Arabic", "Noto Sans Arabic", sans-serif', size: 46, weight: 500, lineHeight: 1.4, letterSpacing: 0},
  shadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.45)',
  /** optional, for bright backgrounds only: a very soft transparent gradient behind the subtitle area */
  scrim: {height: 300, opacity: 0.3},
  fadeIn: 6, // frames
  fadeOut: 8,
  sideMargin: 160, // lines never run closer than this to the frame edge
} as const;

/**
 * Vertical (9:16, 1080×1920) variant for the Shorts master: same typefaces, colour, shadow, fades and cue timing,
 * re-laid out for phones. Lines may wrap (balanced) inside a narrower column, the block sits above the area
 * platforms cover with captions/handles (bottom ≈ 23%), and it is shifted slightly left of the action buttons.
 * Values are for a 1080-wide portrait frame.
 */
export const BILINGUAL_STYLE_VERTICAL = {
  bottom: 460, // block bottom is 460 px above the frame bottom (y = 1460)
  gap: 10,
  enSize: 46,
  arSize: 50,
  maxWidth: 820,
  centerX: 500, // a little left of centre: keeps clear of the right-hand action buttons
} as const;

/** Timing rules used by scripts/subtitles/build_subtitles.py (kept here so the whole system is documented in one place). */
export const BILINGUAL_TIMING = {
  leadFrames: 2, // a cue appears 2 frames before its first word
  tailSec: 0.5, // and stays 0.5 s after its last word…
  minGapFrames: 2, // …but always clears 2 frames before the next cue
  maxCharsEn: 46, // one line per language: break long sentences into cues at natural pauses
  maxCharsAr: 46, // counted without diacritics
  maxCps: 20, // reading-speed warning (characters per second); the narration's pace sets the real limit
} as const;

/**
 * The subtitle-safe zone: the band (from the top of the English line box to the frame bottom) that staging must keep
 * clear of the Traveller and of any key story detail. At 1080p this is y ≥ 905.
 */
export const subtitleZoneTop = (height = 1080) => {
  const s = height / 1080;
  const S = BILINGUAL_STYLE;
  return height - s * (S.bottom + S.ar.size * S.ar.lineHeight + S.gap + S.en.size * S.en.lineHeight);
};

export interface BilingualCue {
  from: number; // frame (inclusive)
  to: number; // frame (exclusive)
  en: string;
  ar: string;
  scrim?: boolean; // only where the background is too bright for the shadow alone
}
