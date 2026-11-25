# Phase 01 — Scene Timing & Voiceover Sync Guide

**Film:** *When Life Doesn't Go as Planned* · Scenes 01–03 · 1920×1080 · 30 fps · **1230 frames = 41.0 s**

All numbers below come from `src/config/production.ts`. That file is the source of truth. If you change a number there, every shot, beat and audio cue moves with it.

---

## 1. Scene timing

| Scene | Title | Frames | Timecode (HH:MM:SS:FF @30) | Length |
|---|---|---|---|---|
| 01 | How Did I End Up Here? | 0 – 329 | 00:00:00:00 – 00:00:10:29 | 11.0 s |
| 02 | This Was Not the Plan | 330 – 719 | 00:00:11:00 – 00:00:23:29 | 13.0 s |
| 03 | The Life We Imagined | 720 – 1229 | 00:00:24:00 – 00:00:40:29 | 17.0 s |

### Transitions

| Where | Frames | What happens |
|---|---|---|
| Film open | 0 – 40 | Fade up from deep charcoal `#303238` |
| S01 → S02 | 310 – 350 (cut at 330) | Mist rolls across the lens; the cut to the medium shot is hidden at peak density |
| S02 → S03 | cut at 720 | **Cut on action:** he lowers his eyes to the map (682–712) → his point of view of the map |
| Inside S03 | 800 – 884 | **Match transition:** the paper dissolves outward from the ink route and the imagined world appears exactly under the drawing |
| Inside S03 | 1096 – 1174 | Warm mist rolls in, cools, and carries us back to the present-day medium shot |
| Film close | 1204 – 1229 | Fade to deep charcoal |

---

## 2. Voiceover cue sheet (placeholder timing)

The narration is **not** generated. These cues are where each line is designed to sit, read by a calm female voice at ~130 wpm with the written pauses.

| Track | Line (exact approved text) | In (frame / TC) | Out (frame / TC) | Key word → frame |
|---|---|---|---|---|
| VO01 | "Have you ever looked at your life… and wondered how you ended up here?" | 45 · 00:00:01:15 | 205 · 00:00:06:25 | looked 66 · life 100 · **wondered 128** · here 190 |
| VO02 | "Not because everything is terrible. But because… this isn't where you thought you would be." | 360 · 00:00:12:00 | 612 · 00:00:20:12 | terrible 425 · but because 462 · **isn't 528** · would be 600 |
| VO03 | "You had plans. You had dreams. You imagined a different version of yourself by now." | 744 · 00:00:24:24 | 1020 · 00:00:34:00 | **plans 770** · **dreams 846** · **imagined 905** · version 950 · by now 1005 |

Visual silence after each line is deliberate:
- 4.1 s after VO01, as the mist takes us closer.
- 3.6 s after VO02, while he exhales and looks down.
- 7 s after VO03, while the imagined future plays out and the mist returns.

---

## 3. Picture beats tied to the words

| Frame(s) | Beat | Anchored to |
|---|---|---|
| 0 – 330 | Slow push toward him (camera travels 10 m, ~50 mm lens) | whole of VO01 |
| 114 – 160 | He turns his head toward the far paths | "…and **wondered**" |
| 248 – 302 | Head settles back, slight tilt | after "here?" |
| 340 – 370 | Lifts the folded map in front of him | just before "Not because" |
| 368 – 448 | Unfolds it: bottom fold drops, panels swing open, far hand takes the edge | "everything is terrible" |
| 448 – 522 | Studies the drawn route (small reading eye movements) | "But because…" |
| 524 – 550 | Eyes leave the map and look into the misty landscape; brows lift slightly | "this **isn't** where…" |
| 532 – 580 | Rack focus from him/the map to the paths behind him | "…you thought you would be" |
| 596 – 642 | Quiet exhale, shoulders settle | silence |
| 640 – 674 | Focus returns to him | silence |
| 682 – 712 | He looks back down at the map → **cut** | silence |
| 720 – 800 | POV push into the drawn route | "You had **plans**." |
| 800 – 884 | Ink route becomes the real path; the paper melts away | "You had **dreams**." |
| 850 → | Camera starts moving into the imagined world; warm sun rises | — |
| 880 – 1096 | He walks with certainty toward the flourishing olive tree | "You **imagined** a different version of yourself by now." |
| 1096 – 1174 | Mist returns; warm light cools | silence |
| 1170 – 1210 | Back in the present he slowly lifts his eyes from the map | silence |

---

## 4. Importing the narrator's recording

### A. In this Remotion project (keeps every beat in sync automatically)
1. Export each line as its own WAV (48 kHz, 24-bit), named exactly:
   - `public/audio/VO01_have_you_ever_looked.wav`
   - `public/audio/VO02_not_because.wav`
   - `public/audio/VO03_you_had_plans.wav`
2. In `src/config/production.ts`, set `voiceover.enabled = true`.
3. Run `npm run studio`, scrub to each key word in the recording, and update that line's `start` and `beats` frames. Character beats that read from those beats move with them (for example the S01 head turn follows `beats.wondered`).
4. If a line runs longer than its window, extend the relevant scene `duration` in `scenes`. The scenes after it are positioned by their own `start` values, so shift those too.
5. Render again: `npm run render`.

Each line is its own `<Audio>` inside its own named `<Sequence>` ("VO · VO01" …), so in Remotion Studio the tracks stay separately editable. No music or sound-effects tracks exist yet, by design.

### B. In an NLE (Premiere / Resolve / Final Cut)
- Drop `out/phase01_combined.mp4` on V1. It has no audio track.
- Import `docs/vo_markers.csv` as timeline markers (Resolve: *Timeline → Import → Timeline Markers from EDL/CSV*; Premiere: paste the timecodes as markers manually).
- Put each narration line on its own audio track: A1 = VO01, A2 = VO02, A3 = VO03. Keep A4–A6 empty for music, ambience and foley later.
- Align each line's **key word** (bold in §2) to its marker rather than the start of the breath. That's what the animation is timed to.
- If the read is slower, nudge the picture by ±0.5 s rather than squeezing the voice. The holds were designed with slack.

### Loudness targets for the final mix
- Dialogue around −16 LUFS short-term.
- Integrated −14 LUFS, true peak −1 dBTP.
