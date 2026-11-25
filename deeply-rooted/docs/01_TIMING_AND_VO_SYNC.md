# Phase 01 — Timing, Narration Sync, On-screen Script & Sound

**Film:** *When Life Doesn't Go as Planned* · Scenes 01–03 · 1920×1080 · 30 fps · **1227 frames = 40.9 s** (v2)

The picture now follows the narrator's recording (`When_Life_Doesnt_Go_as_Planned_1vd.mp3`, 5:40). Phase 01 uses its opening, the title read plus the first three lines. Everything is derived from `src/data/narration.json` and `src/config/production.ts`.

---

## 1. What the narrator says (speech recognition, checked against the approved script)

| In the recording | Spoken | Used in |
|---|---|---|
| 0.00 – 5.53 s | "When Life Doesn't Go as Planned · Deeply Rooted · Episode One" | Opening title card |
| 6.08 – 7.67 s | "Have you ever looked at your life…" | Scene 01 |
| 8.43 – 10.73 s | "…and wondered how you ended up here?" | Scene 01 |
| 11.60 – 13.33 s | "Not because everything is terrible." | Scene 02 |
| 13.93 – 14.80 s | "But because…" | Scene 02 |
| 15.21 – 17.16 s | "…this isn't where you thought you would be." | Scene 02 |
| 18.03 – 19.11 s | "You had plans." | Scene 03 |
| 19.48 – 20.62 s | "You had dreams." | Scene 03 |
| 21.08 – 23.82 s | "You imagined a different version of yourself by now." | Scene 03 |
| 24.65 s → | "Maybe you thought you'd be happier…" | next section (not in Phase 01) |

The three lines match the approved script word for word. The full word-level transcript of all 5:40 is in `src/data/narration_transcript.json` (906 words), ready for the next phases.

---

## 2. Narration placement on the film (v2 edit: hook first)

Her phrasing is kept intact inside each segment. Segments are placed so the emotional hook comes first and her title read plays over the reveal of the crossroads.

| Segment | Recording (s) | Film start (s) | Film start (frame) |
|---|---|---|---|
| VO01 ("Have you ever looked at your life… and wondered how you ended up here?") | 6.02 – 10.82 | 0.80 | 24 |
| TITLE ("When Life Doesn't Go as Planned · Deeply Rooted · Episode One") | 0.00 – 5.58 | 7.00 | 210 |
| VO02a ("Not because… But because…") | 11.52 – 14.86 | 14.60 | 438 |
| VO02b ("this isn't where…") | 15.14 – 17.26 | 18.90 | 567 |
| VO03a ("You had plans.") | 17.96 – 19.24 | 26.80 | 804 |
| VO03b ("You had dreams. You imagined…") | 19.40 – 23.92 | 28.80 | 864 |

**Voice processing:**
- **Source:** the original was very quiet (−34.5 LUFS).
- **Processing:** high-pass at 70 Hz, gentle 3:1 compression, +22 dB of gain and a −1.5 dBFS limiter.
- **Result:** the voice stem `public/audio/narration.m4a` sits at −16 LUFS. Her delivery and timing are untouched.

To redo it:

```bash
ffmpeg -i narration_original.mp3 -af "highpass=f=70,acompressor=threshold=0.025:ratio=3:attack=4:release=140:knee=6:makeup=1,volume=22dB,alimiter=limit=0.84:attack=3:release=60:level=false" -ar 48000 -c:a aac -b:a 256k public/audio/narration.m4a
```

---

## 3. Shots and beats (derived from her words)

| Scene | Frames | Length | Shots |
|---|---|---|---|
| 01 How Did I End Up Here? | 0 – 402 | 13.4 s | Close-up 0–158 · Wide 159–402 |
| 02 This Was Not the Plan | 403 – 787 | 12.8 s | Medium 403–568 · Close-up 569–645 · Medium 646–787 |
| 03 The Life We Imagined | 788 – 1226 | 14.6 s | POV map 788–862 · Match 863–946 · Imagined 863–1080 · Return 1081–1158 · Close-up 1159–1226 |

**Total: 1227 frames = 40.9 s.**

| Beat | Frame | Tied to |
|---|---|---|
| Fade from charcoal (0.4 s); close-up in drifting mist | 0 – 12 | — |
| His head turns toward the far paths (close-up) | 94 – 140 | "**wondered**" (104) |
| Cut to the wide crossroads | 159 | "…ended up **here**?" |
| Title card in the sky (her title read) | 209 – 403 | title read |
| Mist gust → medium shot | 383 – 423 (cut 403) | 0.9 s after "Episode One" |
| Lifts and unfolds the map | 411 – 517 | "Not because everything is terrible." |
| Studies the route; thumbs re-grip | 517 – 573 | "But because…" |
| **Close-up**: eyes leave the map, the map sinks slightly | 569 – 645 | "this **isn't** where…" (579) |
| Back on the medium: rack focus to the paths behind him | 648 – 694 | silence |
| Exhale; focus returns; he looks down → cut | 686 – 784 | silence |
| POV push into the drawn route | 788 – 862 | "You had **plans**." |
| Light through the paper → wash from the route → world | 837 – 946 | "You had **dreams**." (879) |
| Walks toward the flourishing olive tree | 863 – 1080 | "You **imagined** a different version of yourself…" |
| Mist returns; close-up as he lifts his eyes | 1081 – 1199 | silence |
| Fade to charcoal | 1201 – 1226 | — |

**To re-time:** move a segment's `at` in `src/data/narration.json`. Shots, transitions, acting beats, captions and sound cues all follow automatically.

---

## 4. On-screen script

- **Opening title card** in the sky, while she reads the title: "DEEPLY ROOTED" (small, letterspaced gold), "When Life Doesn't Go as Planned" (serif) and "Episode One" (italic).
- **Captions:** one phrase at a time, exactly as she says it.
  - Ivory serif at the bottom of the frame, with a soft charcoal gradient behind it so it stays readable over the bright paper map.
  - It fades in just before the first word and holds 0.5 s after the last.
  - No word-by-word kinetic effects.
- **Switching off:** set `captions.enabled = false` in `production.ts` for a clean version.
- **YouTube closed captions:** use `docs/phase01_captions.srt` (regenerate with `python3 scripts/export_srt.py`).

---

## 5. Sound effects (no music)

All effects are synthesised by `scripts/generate_sfx.py`, deterministic and royalty-free, into `public/audio/sfx/`. Each cue is its own named track in Remotion Studio. Levels and timing are in `sfx` in `production.ts`.

| Cue | When | Sound |
|---|---|---|
| Dawn wind (present) | 0 → match | Layered wind with gusts, a faint whistle, sparse distant birds |
| Mist whoosh | peaks on the Scene 01 → 02 cut | Airy swell moving right → left with the mist |
| Coat shift + paper lift | 424 – 460 | Wool rustle, paper sliding out |
| Paper: first fold / panels open | 456, 492 | Crinkle bursts, soft paper flaps, a snap |
| Paper flutter | while he studies the map | The free panel moving in the wind |
| Exhale | the sigh (666) | Soft breath |
| Coat settle | as he looks down | Small fabric movement |
| Paper grip (POV) | 794 | Map held close |
| Shimmer | the map becomes the world | Restrained bell-like partials over an airy bloom |
| Meadow (imagined) | 863 → return | Warm breeze, leaf rustle, lively birdsong |
| Footsteps | every heel strike of his walk | Dirt path, quieter as he walks away |
| Mist whoosh: return | 1079 | Darker swell carrying us back |
| Dawn wind (return) | 1081 → end | Present-day wind, fading with the picture |

**Mix:**
- voice stem −16 LUFS;
- ambience about 10–12 dB under the voice;
- foley close to camera, just under the voice.

The delivered master is loudness-normalised (see the README for the exact values).

### In an NLE
Use `out/phase01_av_master.mp4` as the reference. The stems are `public/audio/narration.m4a` (place segments per §2) and `public/audio/sfx/*.wav` (place per §5).
