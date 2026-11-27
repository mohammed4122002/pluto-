/** Episode 01 timing: every cut and action is derived from the narration's word timings and its placement. */
import placement from '../data/episode01/placement.json';
import transcript from '../data/narration_new_transcript.json';

export const FPS = 30;
export const EP_FRAMES = placement.frames;
export const VOICE = placement.voice;
export const SEGMENTS = placement.segments;

/** Film seconds of a time in the recording. */
export const filmSec = (t: number) => {
  for (const s of SEGMENTS) if (t >= s.src[0] - 1e-6 && t <= s.src[1] + 1e-6) return s.at + t - s.src[0];
  throw new Error(`time ${t} is outside the placed narration`);
};
/** Film frame of a time in the recording. */
export const fr = (t: number) => Math.round(filmSec(t) * FPS);

const PH = transcript.phrases;
const WORDS = transcript.words;
export const ps = (i: number) => fr(PH[i].start); // phrase start (frame)
export const pe = (i: number) => fr(PH[i].end); // phrase end (frame)
/** A cut in the silence before phrase i (midpoint of the gap, including any added pause). */
export const cut = (i: number) => Math.round((pe(i - 1) + ps(i)) / 2);
/** Frame where word `w` is spoken inside phrase i. */
export const word = (i: number, w: string) => {
  const p = PH[i];
  const hit = WORDS.find((x) => x.t >= p.start - 0.2 && x.t <= p.end + 0.05 && x.w.replace(/[^a-z']/g, '') === w);
  if (!hit) throw new Error(`word "${w}" not found in phrase ${i}: ${p.text}`);
  return fr(hit.t);
};
/** Is the narrator speaking at film frame f? (for gentle ambience ducking) */
export const speaking = (f: number) => PH.some((p, i) => {
  try {
    return f >= ps(i) - 4 && f <= pe(i) + 6;
  } catch {
    return false;
  }
});
