# Phase 01 — Timing, Narration Sync, On-screen Script & Sound

**Film:** *When Life Doesn't Go as Planned* · Scenes 01–03 · 1920×1080 · 30 fps · **1233 frames = 41.1 s**

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

## 2. Narration placement on the film

Her phrasing is kept intact inside each segment. Pauses are only added between segments, where a scene needs room: the mist wipe, the map unfolding, the cut into the map.

| Segment | Recording (s) | Film start (s) | Film start (frame) |
|---|---|---|---|
| TITLE | 0.00 – 5.58 | 1.30 | 39 |
| VO01 | 6.02 – 10.82 | 7.75 | 233 |
| VO02a ("Not because… But because…") | 11.52 – 14.86 | 15.30 | 459 |
| VO02b ("this isn't where…") | 15.14 – 17.26 | 19.50 | 585 |
| VO03a ("You had plans.") | 17.96 – 19.24 | 26.95 | 809 |
| VO03b ("You had dreams. You imagined…") | 19.40 – 23.92 | 29.00 | 870 |

**Voice processing:**
- **Source:** the original was very quiet (−34.5 LUFS).
- **Processing:** high-pass at 70 Hz, gentle 3:1 compression, +22 dB of gain and a −1.5 dBFS limiter.
- **Result:** the voice stem `public/audio/narration.m4a` sits at −16 LUFS.

To redo it:

```bash
ffmpeg -i narration_original.mp3 -af "highpass=f=70,acompressor=threshold=0.025:ratio=3:attack=4:release=140:knee=6:makeup=1,volume=22dB,alimiter=limit=0.84:attack=3:release=60:level=false" -ar 48000 -c:a aac -b:a 256k public/audio/narration.m4a
```

---

## 3. Scenes and beats (derived from her words)

| Scene | Frames | Timecode | Length |
|---|---|---|---|
| 01 How Did I End Up Here? | 0 – 417 | 00:00:00:00 – 00:00:13:27 | 13.9 s |
| 02 This Was Not the Plan | 418 – 791 | 00:00:13:28 – 00:00:26:11 | 12.5 s |
| 03 The Life We Imagined | 792 – 1232 | 00:00:26:12 – 00:00:41:02 | 14.7 s |

| Beat | Frame | Tied to |
|---|---|---|
| Fade up from charcoal; title card (Deeply Rooted / When Life Doesn't Go as Planned / Episode One) | 0 – 226 | title read |
| Head turns toward the far paths | 302 – 348 | "**wondered**" (312) |
| Mist rolls across the lens → medium shot | 398 – 438 (cut 418) | 1.45 s after "…here?" |
| Lifts and unfolds the map | 426 – 532 | "Not because everything is terrible." |
| Studies the route | 532 – 591 | "But because…" |
| Eyes leave the map; rack focus to the paths | 591 – 649 | "this **isn't** where…" (597) |
| Exhale, focus returns, looks down | 666 – 788 | silence |
| Cut on his glance → POV push into the map | 792 – 869 | "You had **plans**." |
| Ink route dissolves into the real world | 869 – 953 | "You had **dreams**." (885) |
| Walks toward the flourishing olive tree | 869 – 1087 | "You **imagined** a different version of yourself…" |
| Mist returns to the present; he lifts his eyes | 1087 – 1199 | silence |
| Fade to charcoal | 1207 – 1233 | — |

**To re-time:** change a segment's `at` in `src/data/narration.json`. Scene lengths, transitions, acting beats, captions and every sound cue follow automatically.

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
