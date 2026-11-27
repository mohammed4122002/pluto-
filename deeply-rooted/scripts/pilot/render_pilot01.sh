#!/usr/bin/env bash
# Pilot 01 — "The End of the Pier" (opening line). One cheap render (270 frames ≈ 9 s), then post.
# Output: out/pilot01/  (EN version, Arabic-preview version, clean master, subtitle layers, SRTs, stills)
set -euo pipefail
cd "$(dirname "$0")/../.."
O=out/pilot01
mkdir -p "$O"
done_() { [ -s "$1" ]; }

done_ $O/pilot01_raw.mp4 || npx remotion render Pilot01 $O/pilot01_raw.mp4 --concurrency=4 --log=error
for L in EN AR; do
  done_ $O/pilot01_subs_${L,,}.mov || npx remotion render Pilot01Subs$L $O/pilot01_subs_${L,,}.mov --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png --concurrency=4 --log=error
done
done_ $O/pilot01_painted.mp4 || python3 scripts/paint_pass.py $O/pilot01_raw.mp4 $O/pilot01_painted.mp4 --light --workers 4 --crf 14

# audio: master the mix to -15 LUFS integrated, true peak ≤ -1.5 dBTP (two-pass loudnorm + limiter)
ffmpeg -loglevel error -y -i $O/pilot01_raw.mp4 -vn -ac 2 -ar 48000 $O/mix_raw.wav
M=$(ffmpeg -hide_banner -nostats -i $O/mix_raw.wav -af loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
get() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
ffmpeg -loglevel error -y -i $O/mix_raw.wav -af "loudnorm=I=-15:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,alimiter=limit=0.84:attack=2:release=60:level=false" -ar 48000 $O/mix_master.wav

ffmpeg -loglevel error -y -i $O/pilot01_painted.mp4 -i $O/mix_master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -movflags +faststart $O/pilot01_clean.mp4
for L in en ar; do
  ffmpeg -loglevel error -y -i $O/pilot01_painted.mp4 -i $O/pilot01_subs_$L.mov -i $O/mix_master.wav \
    -filter_complex "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]" -map "[v]" -map 2:a \
    -c:v libx264 -preset slow -crf 16 -c:a aac -b:a 256k -movflags +faststart $O/pilot01_$L.mp4
done
python3 scripts/pilot/export_pilot_srt.py
echo "pilot01 done"
