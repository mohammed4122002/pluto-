# Phase 01 v2 — render status

**COMPLETE.** The pipeline finished with `exit 0`.

Verification of `out/phase01_v2_final.mp4`:
- decodes with 0 errors;
- 1227 frames, 40.9 s, stereo 48 kHz audio;
- −15.0 LUFS integrated, true peak −1.5 dBTP, LRA 9.9;
- voice onsets land on the planned segment cues;
- captions spot-checked against speech.

Delivered:
- `phase01_v2_final.mp4` and `phase01_v2_final_720p.mp4`;
- `docs/phase01_captions.srt`;
- `out/compare/*` (V1/V2 pairs, face, landscape/tree);
- the stage-1 file `v2_picture_av.mp4`.

---

## Checkpoint history

**Checked:** 18:34 UTC. The pipeline (`scripts/render_final.sh`, started 18:04, pid 14982) runs as a detached background process. It doesn't depend on the session's monitor and keeps running if the monitor expires. It stops only if the cloud container itself is reclaimed.

| Stage | Output (`deeply-rooted/out/`, not in git) | Status at checkpoint |
|---|---|---|
| 1 Clean picture + soundtrack (Remotion `Phase01Clean`) | `v2_picture_av.mp4` (1227 frames, 40.9 s, stereo 48 kHz) | ✅ done 18:28 |
| 2 Painterly pass (`scripts/paint_pass.py`) | `v2_painted.mp4` | ⏳ running (≥ 480 / 1227 frames) |
| 3 Subtitle + title layer (Remotion `CaptionsOverlay`, ProRes 4444 alpha) | `v2_subtitles_overlay.mov` | pending |
| 4 Audio master (−15 LUFS, TP ≤ −1.5 dBTP) | `v2_mix_raw.wav` → `v2_mix_master.wav` | pending |
| 5 Composites | `phase01_v2_final.mp4` (with subtitles), `phase01_v2_clean.mp4` (without) | pending |
| — SRT | `out/phase01_captions.srt` (copy in `docs/phase01_captions.srt`) | written |

Progress log: `out/render_v2.log` (ends with `exit 0` on success).

## If the pipeline was interrupted

1. Make sure nothing is still running:

   ```bash
   ps aux | grep -E "render_final|paint_pass|remotion render"
   ```

2. Resume from the last completed stage. The resume script skips every finished output, checking for complete files with all 1227 frames:

   ```bash
   bash deeply-rooted/scripts/render_resume.sh
   ```

**Caveat:** a partially written `v2_painted.mp4` has fewer than 1227 frames, so the script redoes stage 2 only. Stage 1 is never re-rendered while its file is complete.

## Remaining after the render (deliverables, no artistic changes)

- **720p preview:**

  ```bash
  ffmpeg -i out/phase01_v2_final.mp4 -vf scale=1280:720 -c:v libx264 -crf 25 -c:a aac -b:a 160k out/phase01_v2_final_720p.mp4
  ```

- **V1/V2 comparison frames:**

  ```bash
  python3 scripts/make_comparison.py out/phase01_final.mp4 out/phase01_v2_final.mp4 out/compare
  ```

  The V1 still frames are already extracted in `out/compare/before/`.

- **Face close-up and landscape/olive-tree crops** from the comparison frames.

- **Verification:** that the file plays end to end, voice cues land at the planned frames, captions are aligned, and the master measures −14 to −16 LUFS with TP ≤ −1 dBTP.

- **Delivery:** send the files and the limitations report (`docs/04_QUALITY_UPGRADE.md`, last section).
