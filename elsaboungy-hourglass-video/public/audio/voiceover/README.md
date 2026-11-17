Put the phase-2 voice-over here (not used by the silent review render).

- One file for the whole ad, e.g. `voiceover.wav` → set `"voiceoverSrc": "audio/voiceover/voiceover.wav"` in `src/config/audio.json`
- or one clip per scene, e.g. `rush.wav`, `hourglass.wav` … → set `"sceneClips": { "rush": "audio/voiceover/rush.wav", ... }`

Timings and lines: `voiceover/VO_SCRIPT.md` (regenerate with `npm run vo:guide`).
Render with audio: `npm run render:vo`.
