#!/usr/bin/env bash
# Pilot 01 · BILINGUAL — the channel's bilingual subtitles (English above, Arabic beneath) burned into one video.
# Picture + sound: the voice-test pilot (out/pilot01_voicetest/, read-only here; rendered by render_pilot01_voicetest.sh).
# Output: out/pilot01_bilingual/  (primary bilingual video, 720p preview, separate EN + AR SRTs). Earlier outputs untouched.
set -euo pipefail
cd "$(dirname "$0")/../.."
O=out/pilot01_bilingual
V=out/pilot01_voicetest
mkdir -p "$O"
[ -s $V/pilot01_voicetest_painted.mp4 ] && [ -s $V/mix_master.wav ] || bash scripts/pilot/render_pilot01_voicetest.sh

python3 scripts/subtitles/build_subtitles.py pilot01
npx remotion render Pilot01BilingualSubs $O/pilot01_bilingual_subs.mov --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png --concurrency=4 --log=error
ffmpeg -loglevel error -y -i $V/pilot01_voicetest_painted.mp4 -i $O/pilot01_bilingual_subs.mov -i $V/mix_master.wav \
  -filter_complex "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]" -map "[v]" -map 2:a \
  -c:v libx264 -preset slow -crf 16 -c:a aac -b:a 256k -movflags +faststart $O/pilot01_bilingual.mp4
ffmpeg -loglevel error -y -i $O/pilot01_bilingual.mp4 -vf scale=1280:720 -c:v libx264 -crf 20 -preset slow -c:a copy -movflags +faststart $O/pilot01_bilingual_720p.mp4
cp subtitles/pilot01_en.srt subtitles/pilot01_ar.srt $O/
echo "pilot01_bilingual done"
