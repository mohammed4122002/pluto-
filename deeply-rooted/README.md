# Deeply Rooted — Phase 01: Animation Production Test

*When Life Doesn't Go as Planned* · opening Scenes 01–03 · 1920×1080 · 30 fps · 41 s

A self-contained Remotion project. It has nothing to do with the clinic platform in the rest of this repository and can be moved into its own repository unchanged.

| Deliverable | Where |
|---|---|
| Master character reference sheet | `out/character_reference_sheet.png`, or render it: `npm run still:sheet` |
| Reusable character assets | `src/character/` (master lock in `spec.ts`) |
| Scene 01 / 02 / 03 previews | `out/scene01.mp4`, `out/scene02.mp4`, `out/scene03.mp4` (`npm run render:scenes`) |
| Combined preview | `out/phase01_combined.mp4` (`npm run render`) |
| Editable source | this folder; open `npm run studio` |
| Timing & VO sync guide | `docs/01_TIMING_AND_VO_SYNC.md`, `docs/vo_markers.csv` |
| Visual prompts & animation specs | `docs/02_VISUAL_PROMPTS_AND_ANIMATION_SPECS.md` |
| Technical notes & limitations | `docs/03_TECHNICAL_IMPLEMENTATION.md` |

Everything you'd want to tune — scene lengths, voiceover cue points, camera speed, fog, wind, lighting, transitions, palette and grade — lives in **`src/config/production.ts`** and **`src/config/palette.ts`**.

Rendered files in `out/` are not committed; re-create them with the commands above.
