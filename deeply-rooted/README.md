# Deeply Rooted — Phase 01: Animation Production Test

*When Life Doesn't Go as Planned* · opening Scenes 01–03 · 1920×1080 · 30 fps · 41 s

A self-contained Remotion project. It has nothing to do with the clinic platform in the rest of this repository and can be moved into its own repository unchanged.

| Deliverable | Where |
|---|---|
| Master character reference sheet | `out/character_reference_sheet.png`, or render it: `npm run still:sheet` |
| Reusable character assets | `src/character/` (master lock in `spec.ts`) |
| Scene 01 / 02 / 03 previews | `out/scene01.mp4`, `out/scene02.mp4`, `out/scene03.mp4` (`npm run render:scenes`) |
| Combined preview (picture only) | `out/phase01_combined.mp4` |
| **v2 final film (painterly upgrade) with narration, subtitles and sound** | `out/phase01_v2_final.mp4` (`bash scripts/render_final.sh`) |
| v2 clean master (no subtitles) + subtitle layer | `out/phase01_v2_clean.mp4`, `out/v2_subtitles_overlay.mov` |
| Quality-upgrade notes | `docs/04_QUALITY_UPGRADE.md` |
| Subtitles for YouTube | `docs/phase01_captions.srt` (`python3 scripts/export_srt.py`) |
| Editable source | this folder; open `npm run studio` |
| Timing & VO sync guide | `docs/01_TIMING_AND_VO_SYNC.md`, `docs/vo_markers.csv` |
| Visual prompts & animation specs | `docs/02_VISUAL_PROMPTS_AND_ANIMATION_SPECS.md` |
| Technical notes & limitations | `docs/03_TECHNICAL_IMPLEMENTATION.md` |

Everything you'd want to tune — narration placement, scene lengths, camera speed, fog, wind, lighting, transitions, captions, sound-effect levels, palette and grade — lives in **`src/config/production.ts`**, **`src/config/palette.ts`** and **`src/data/narration.json`**. The picture follows the narrator's recording: move a narration segment and every scene, beat, caption and sound cue moves with it.

Audio: `public/audio/narration.m4a` (her recording, loudness-processed), `public/audio/sfx/` (procedural sound effects, `python3 scripts/generate_sfx.py`). No music in Phase 01.

Rendered files in `out/` are not committed; re-create them with the commands above. `npm run render` writes a high-bitrate master (CRF 16). The shared previews are re-encodes of that master (H.264 CRF 20, frame-accurate scene cuts: 330 / 390 / 510 frames).
