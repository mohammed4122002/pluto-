#!/usr/bin/env bash
# Resume the Phase 01 v2 pipeline: skips every stage whose output already exists and is complete.
# Safe to re-run. Never re-renders a finished stage. Do not run while render_final.sh is still running
# (check: ps aux | grep -E "render_final|paint_pass|remotion render").
set -euo pipefail
cd "$(dirname "$0")/.."
O=out
frames(){ ffprobe -v error -count_packets -select_streams v -show_entries stream=nb_read_packets -of csv=p=0 "$1" 2>/dev/null || echo 0; }
done_video(){ [ -s "$1" ] && [ "$(frames "$1")" = "1227" ]; }

done_video $O/v2_picture_av.mp4 || npx remotion render Phase01Clean $O/v2_picture_av.mp4 --concurrency=4 --audio-codec=aac --audio-bitrate=320k --crf=12 --log=error
done_video $O/v2_painted.mp4 || python3 scripts/paint_pass.py $O/v2_picture_av.mp4 $O/v2_painted.mp4 --workers 4 --crf 14
done_video $O/v2_subtitles_overlay.mov || npx remotion render CaptionsOverlay $O/v2_subtitles_overlay.mov --codec=prores --prores-profile=4444 --pixel-format=yuva444p10le --image-format=png --concurrency=4 --log=error
if [ ! -s $O/v2_mix_master.wav ]; then
  ffmpeg -loglevel error -y -i $O/v2_picture_av.mp4 -vn -ac 2 -ar 48000 $O/v2_mix_raw.wav
  M=$(ffmpeg -hide_banner -nostats -i $O/v2_mix_raw.wav -af loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
  get(){ echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
  ffmpeg -loglevel error -y -i $O/v2_mix_raw.wav -af "loudnorm=I=-15:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,alimiter=limit=0.84:attack=2:release=60:level=false" -ar 48000 $O/v2_mix_master.wav
fi
done_video $O/phase01_v2_final.mp4 || ffmpeg -loglevel error -y -i $O/v2_painted.mp4 -i $O/v2_subtitles_overlay.mov -i $O/v2_mix_master.wav \
  -filter_complex "[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]" -map "[v]" -map 2:a \
  -c:v libx264 -preset slow -crf 17 -c:a aac -b:a 256k -movflags +faststart $O/phase01_v2_final.mp4
done_video $O/phase01_v2_clean.mp4 || ffmpeg -loglevel error -y -i $O/v2_painted.mp4 -i $O/v2_mix_master.wav -map 0:v -map 1:a \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart $O/phase01_v2_clean.mp4
python3 scripts/export_srt.py
echo "done"
