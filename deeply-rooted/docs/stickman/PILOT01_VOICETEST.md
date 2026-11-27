# Pilot 01 · Voice Test: new narration recording

This test replaces only the voice source. The shots, camera moves, lighting, animation, painted plates and subtitle style are identical to Pilot 01. Every cue is re-timed to the new performance.

| | |
|---|---|
| Composition | `Pilot01VoiceTest` (`src/pilot/Pilot01VoiceTest.tsx`) |
| Subtitle layers | `Pilot01VoiceTestSubsEN` / `Pilot01VoiceTestSubsAR` |
| Render | `bash scripts/pilot/render_pilot01_voicetest.sh` → `out/pilot01_voicetest/` |
| Original Pilot 01 | `src/pilot/Pilot01.tsx`, `scripts/pilot/render_pilot01.sh`, `out/pilot01/`: **not modified** |

## The recording

The delivered file was `ElevenLabs_2026-11-27T22_14_48_egyption_voice_sham_ivc_s50_sim75_v4.mp3`. It was the only new audio file in the project and uploads, so no other candidate existed.

| | Old (Pilot 01) | New |
|---|---|---|
| File in project | `public/audio/narration_original.mp3` (raw) / `narration.m4a` (processed) | `public/audio/voice_new/narration_new_2026-11-27.mp3`, a byte-identical copy (MD5 `95e360dd…`) |
| Format | MP3, 44.1 kHz, mono, 192 kb/s | MP3, 44.1 kHz, mono, 128 kb/s |
| Duration | 340.158 s (5:40.16) | **319.399 s (5:19.40)** |
| Difference | | **20.76 s shorter** (not longer) |
| Loudness (whole file) | n/a | −24.3 LUFS, peak −1.3 dBFS |

### Where the 20.8 s goes

I measured this, rather than assuming the extra time was silence.

- **Script.** Both takes read the same script. A speech-recognition word match is 98.5% identical: 906 vs 905 words, same phrase order. The remaining mismatches are mostly recogniser spellings.
- **Pauses.** Total pause time is 11.9 s shorter: 69.0 → 57.2 s, and 133 → 125 phrase breaks.
- **Speech.** Total speech time is 9.4 s shorter: 271.6 → 262.2 s, about 200 → 207 words per minute.
- **Not checked.** At about 28 s the recogniser heard "more loved" in the old take and "or loved" in the new one. That line is outside the pilot and I have not verified it.

Word timestamps for the whole new recording are in `src/data/narration_new_transcript.json`, ready for full-episode sync once approved.

## Opening line: old vs new timing

Every boundary below was measured with the same method on both takes: a 10 ms energy envelope, with threshold −30 dB from the segment peak.

| | Old take | New take | Change |
|---|---|---|---|
| "Have…" begins (in the file) | 6.171 s | 5.759 s | the line starts 0.41 s earlier |
| "Have you ever looked at your life…" | 1.728 s | 1.743 s | about the same |
| Pause after "life…" | 0.647 s | 0.447 s | **−0.20 s** |
| "…and wondered how you ended up here?" | 2.300 s | 1.783 s | **−0.52 s** |
| Whole line | 4.675 s | 3.974 s | **−0.70 s** |

## How the pilot follows the new voice

There is no time-stretch, no speed change and no edit inside the performance. The pilot plays one contiguous excerpt, 5.600–9.950 s of the new file, at its natural speed. Both edges sit in digital silence and have 0.1 s fades.

The only processing is a fixed +9.4 dB gain. It matches this excerpt (−27.7 LUFS) to the Pilot 01 voice level (−18.3 LUFS), so the voice-to-ambience balance is unchanged. The whole mix is then mastered exactly as Pilot 01: −15 LUFS, true peak ≤ −1.5 dBTP.

| Cue (frames at 30 fps) | Pilot 01 | Voice test | Rule (same for both) |
|---|---|---|---|
| Voice excerpt starts | 24 | 24 | 0.8 s in. "Have" lands at 0.94 s (Pilot 01) and 0.96 s (test). |
| Head lowers (shot 1) | 41 | 40 | 0.2 s before "looked" |
| **Cut to the wide shot** | 93 | **89** | inside the pause after "life…", just before "and" |
| He turns back (on "here") | 147–177 | **127–157** | starts 12 frames before "here" |
| EN/AR subtitle 1 | 24–87 | **24–87** | in 2 frames before the first word; the test clears 2 frames before cue 2 because the pause is shorter |
| EN/AR subtitle 2 | 94–165 | **89–165** | in 2 frames before "and", out 18 frames after "here" |
| Last word ends | 169 | 148 | |
| Hold after the last word | 101 frames (3.4 s) | 101 frames (3.4 s) | unchanged breathing room |
| **Total length** | **270 (9.00 s)** | **249 (8.30 s)** | follows the shorter performance |

The camera moves are the same moves: shot 1's push-in and shot 2's crane-up and pull-back. Their start and end points follow the new cut and end, so shot 1 is 0.13 s shorter and shot 2 is 0.57 s shorter.

## Verification (on the rendered files)

- **Length.** EN, AR and clean versions: 249 frames = **8.30 s** of picture. The file duration is 8.32 s because of AAC audio padding.
- **Loudness.** −15.1 LUFS integrated, peak −1.5 dBFS.
- **Correct voice.**
  - The new-recording excerpt appears in the final mix at 0.902 s (expected 0.900 s), with correlation 0.991.
  - The old recording correlates at only 0.139, so it is absent.
- **No stretch.** The late phrase "…ended up here" is at 4.102 s (expected 4.100 s). The 2 ms offset is the same at the start and end of the line, so there is no stretching or speed change.
- **Cut placement.** The cut (2.967 s) falls inside the pause: "life" fades by ~2.70 s and "and" begins at ~3.16 s, the same 0.2 s lead as Pilot 01.
- **Originals untouched.** All 30 Pilot 01 files fingerprinted before the change are byte-identical afterwards: source, render script, SRT script, plates, ambience, old recordings, and every file in `out/pilot01/`. `src/Root.tsx` only gained the three registration lines for the new compositions.
