#!/usr/bin/env bash
# Deeply Rooted · Episode 01 — resumable render pipeline (re-run to continue; finished stages are skipped).
#   bash scripts/episode01/render_episode01.sh checkpoint   # 0:00–1:30 internal quality checkpoint
#   bash scripts/episode01/render_episode01.sh              # the full episode
# Stages: raw picture (Remotion, per chunk, muted) → light paint pass (per chunk) → audio (once) → master audio
#         → concat → bilingual burn-in (EN above AR) + clean master. Times are logged in out/episode01/render_times.log
set -euo pipefail
cd "$(dirname "$0")/../.."
O=out/episode01
mkdir -p $O/chunks
LOG=$O/render_times.log
now() { date +%s; }
MODE=${1:-full}
CHUNKS=("0 2699" "2700 5099" "5100 7499" "7500 9962")
[ "$MODE" = checkpoint ] && CHUNKS=("0 2699")

python3 scripts/subtitles/build_subtitles.py ep01 > /dev/null
[ -s $O/cues/cue_0003.png ] || { s=$(now); node scripts/subtitles/render_cue_stills.mjs ep01 $O/cues; echo "cue stills $(( $(now)-s ))s" >> $LOG; }

for c in "${CHUNKS[@]}"; do
  set -- $c; A=$1; B=$2; N=$(printf "%05d-%05d" $A $B)
  if [ ! -s $O/chunks/raw_$N.mp4 ]; then
    s=$(now); npx remotion render Episode01 $O/chunks/raw_$N.mp4 --frames=$A-$B --muted --concurrency=4 --log=error
    echo "raw $N $(( $(now)-s ))s" >> $LOG
  fi
  if [ ! -s $O/chunks/painted_$N.mp4 ]; then
    s=$(now); python3 scripts/paint_pass.py $O/chunks/raw_$N.mp4 $O/chunks/painted_$N.mp4 --light --workers 4 --crf 14
    echo "paint $N $(( $(now)-s ))s" >> $LOG
  fi
done

# ---- sound: render once, then master (gentle compression → two-pass loudnorm −15 LUFS / TP −1.5 dBTP → limiter)
if [ ! -s $O/mix_master.wav ]; then
  s=$(now)
  [ -s $O/mix_raw.wav ] || npx remotion render Episode01 $O/mix_raw.wav --codec=wav --log=error
  ffmpeg -loglevel error -y -i $O/mix_raw.wav -af "acompressor=threshold=-28dB:ratio=2.5:attack=10:release=250:makeup=1" -ar 48000 $O/mix_comp.wav
  M=$(ffmpeg -hide_banner -nostats -i $O/mix_comp.wav -af loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
  get() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
  ffmpeg -loglevel error -y -i $O/mix_comp.wav -af "loudnorm=I=-15:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,alimiter=limit=0.84:attack=2:release=60:level=false" -ar 48000 $O/mix_master.wav
  echo "audio $(( $(now)-s ))s" >> $LOG
fi

# ---- assemble
ls $O/chunks/painted_*.mp4 | sort | sed "s#^$O/chunks/#file '#; s#\$#'#" > $O/chunks/list.txt
if [ "$MODE" = checkpoint ]; then
  s=$(now)
  ffmpeg -loglevel error -y -i $O/mix_master.wav -t 90 $O/checkpoint_audio.wav
  python3 scripts/subtitles/burn_bilingual.py $O/chunks/painted_00000-02699.mp4 ep01 $O/cues $O/episode01_checkpoint_0-90s.mp4 --audio $O/checkpoint_audio.wav
  echo "checkpoint burn $(( $(now)-s ))s" >> $LOG
  echo "checkpoint done"
  exit 0
fi
s=$(now)
ffmpeg -loglevel error -y -f concat -safe 0 -i $O/chunks/list.txt -c copy $O/picture_painted.mp4
ffmpeg -loglevel error -y -i $O/picture_painted.mp4 -i $O/mix_master.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -movflags +faststart $O/episode01_clean_master.mp4
python3 scripts/subtitles/burn_bilingual.py $O/picture_painted.mp4 ep01 $O/cues $O/episode01_bilingual.mp4 --audio $O/mix_master.wav --preset medium
ffmpeg -loglevel error -y -i $O/episode01_bilingual.mp4 -vf scale=1280:720 -c:v libx264 -crf 21 -preset slow -c:a copy -movflags +faststart $O/episode01_bilingual_720p.mp4
cp subtitles/ep01_en.srt subtitles/ep01_ar.srt $O/
echo "assemble $(( $(now)-s ))s" >> $LOG
echo "episode01 done"
