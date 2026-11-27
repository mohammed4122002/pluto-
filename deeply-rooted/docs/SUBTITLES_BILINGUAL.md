# Deeply Rooted: bilingual subtitle standard

This standard is part of the channel's visual identity, and it applies to every episode. Every video carries **English and Arabic together**, burned into the picture and always visible. English is on the first line and the Arabic translation sits directly beneath it, both centred near the bottom. Separate English and Arabic SRT files ship alongside as extra deliverables.

## One system, three parts

| Part | File | What it does |
|---|---|---|
| Style | `src/subtitles/style.ts` | Typefaces, sizes, colour, shadow, spacing, fades, timing rules, and the subtitle-safe zone. Change the look here once and it changes everywhere. |
| Component | `src/subtitles/BilingualSubtitles.tsx` | `<BilingualSubtitles cues={…} />` draws the layer. It needs no per-scene styling. |
| Cue builder | `scripts/subtitles/build_subtitles.py <id>` | Reads `src/data/subtitles/<id>.cues.json` and turns word times into frames. It writes `<id>.timed.json` for the component and `subtitles/<id>_en.srt` / `<id>_ar.srt`, and rejects lines that are too long or too fast to read. |

Writing an episode's cue file is the only per-episode work: the English and Arabic text plus the narration time of each cue's first and last word, which comes from the transcript's word timestamps.

## The look (at 1080p; it scales with resolution)

- **Colour:** soft ivory `#F4EFE6`, with a subtle soft shadow. There is no box.
- **English:** Inter 500, 42 px.
- **Arabic:** IBM Plex Sans Arabic 500, 46 px. Arabic letterforms sit optically smaller, so it is set 4 px larger to give both lines equal weight; neither reads as secondary.
- **Arabic text handling:** set right to left (`dir="rtl"`, isolated), with connected letters and punctuation placed by the Arabic text direction.
- **Lines:** one line per language, never wrapped. Long sentences are split into separate cues at natural pauses, with English and Arabic always carrying the same meaning.
- **Position:** the Arabic line ends 56 px above the frame bottom and the English line sits 4 px above it. The position is the same in every shot of every episode.
- **Fades:** both lines fade together, 6 frames in and 8 frames out.
- **Bright backgrounds:** set `"scrim": true` on that cue to add a very soft transparent gradient behind the subtitle area. Night and dusk scenes don't need it.

## Timing rules

- A cue appears 2 frames before its first spoken word and stays 0.5 s after its last word.
- It always clears 2 frames before the next cue.
- Each line holds at most 42 characters (English) or 44 (Arabic), at no more than 17 characters per second.

## Staging rule: the subtitle-safe zone

The band from **y = 905 down to the frame bottom** (at 1080p) belongs to the subtitles. Shots must keep the Traveller and any key story detail above it. Shadows, water and floor texture may pass underneath.

To check a shot, render it with the safe zone drawn: `npx remotion still Pilot01Bilingual --frame=80 --props='{"showSafeZone":true}'`.

## Pilot 01 (first use)

- Cue file: `src/data/subtitles/pilot01.cues.json`.
- Render: `bash scripts/pilot/render_pilot01_bilingual.sh` writes `out/pilot01_bilingual/pilot01_bilingual.mp4`, the primary deliverable.
- It reuses the voice-test picture and sound unchanged. Only the bilingual subtitle layer is new.
