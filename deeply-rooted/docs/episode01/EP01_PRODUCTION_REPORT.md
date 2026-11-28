# Episode 01: production report

"When Life Doesn't Go as Planned". 5:32.1, 9963 frames, 1920×1080 at 30 fps.

## Deliverables (`out/episode01/`)

| File | What it is |
|---|---|
| `episode01_bilingual.mp4` | **Primary**: full episode, English above Arabic, burned in (662 MB) |
| `episode01_bilingual_720p.mp4` | Light review copy of the same (83 MB) |
| `episode01_clean_master.mp4` | Same picture and sound, no subtitles (905 MB) |
| `ep01_en.srt`, `ep01_ar.srt` | Separate subtitle files (171 cues; also in `subtitles/`) |
| `episode01_contact_sheet.jpg` | One frame from each of the 32 shots |

## Checks on the rendered files

- **Length:** all three videos are 9963 frames, 332.1 s.
- **Loudness:** −15.0 LUFS integrated, LRA 3.2 LU. True peak −1.4 dBFS after AAC encoding (master WAV −1.5).
- **Voice:** the new recording is placed in 6 unedited segments with added pauses. It is not stretched or altered.
- **Subtitles:** every burned cue is rendered by the bilingual subtitle component, inside the safe zone (y ≥ 905).
- **Pilot files:** Pilot01, VoiceTest and Bilingual files are untouched.

## Reuse

- **Environments:** 4 painted sets (lake/pier, road, plain, hill), lit in 12 lighting presets, used across 32 shots.
- **Carried over from the pilot:** the Traveller and the pier plates.
- **Ambience:** 3 generated beds, rain, wind and dawn lake, plus the pilot's lake bed.

## Time

Wall clock from start of production to delivery: **27 Nov 23:07 → 28 Nov 03:13 UTC, ≈ 4 h 05 min.** This includes planning, plates, code, the 0–90 s checkpoint and the full render. The checkpoint review overlapped the planning of the remaining shots.

| Stage | Time |
|---|---|
| Plate painting (3 passes) | 4 min |
| Cue stills (168 bilingual cues) | 1.5 min |
| Checkpoint 0–90 s (raw, audio, paint, burn) | 33 min |
| **Full render** | **1 h 47 min** (01:25 → 03:11) |
| – raw picture, 4 chunks | 23 min (≈ 7 fps) |
| – painterly pass | 67 min (≈ 2.5 fps): **the bottleneck** |
| – assemble (concat, clean master, burn, 720p) | 17 min |

## For future episodes

- **Per-episode work:**
  - shot table;
  - cue file (EN + AR);
  - placement of the narration;
  - any new plates.
- **Reused without changes:**
  - the kit;
  - subtitle system;
  - burner;
  - audio master;
  - render script.
- **Speeding up the render:** the paint pass is 60% of render time. Running it in parallel per chunk would roughly halve the full render.

## Open items before publishing

See `EP01_SCRIPT_CHECK.md`. The narration says "believe" at 0:32, while the subtitle shows "believed". The verse's Arabic (2:216) and the whole Arabic translation need review by a native speaker.
