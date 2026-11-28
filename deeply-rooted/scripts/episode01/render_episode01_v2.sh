#!/usr/bin/env bash
# Deeply Rooted · Episode 01 v2 — ONE production, TWO masters (resumable: re-run to continue; finished stages are skipped)
#   16:9 long-form   Episode01          1920×1080 → Deeply_Rooted_Episode01_LongForm_16x9.mp4
#   9:16 Shorts      Episode01Vertical  1080×1920 → Deeply_Rooted_Episode01_ShortsMaster_9x16.mp4
# Both share narration, sound, cues, timing, sets and animation; only framing and subtitle layout differ.
# Stages: audio (once) → per format: raw picture chunks (muted) → light paint pass (vertical: + extension below the
#         picture) → concat → clean master + bilingual burn-in. Times go to out/episode01_v2/render_times.log
set -euo pipefail
cd "$(dirname "$0")/../.."
O=out/episode01_v2
mkdir -p $O/chunks
LOG=$O/render_times.log
now() { date +%s; }
echo "=== v2 start $(date -u +%H:%M:%S)" >> $LOG
FRAMES=$(python3 -c "import json; print(json.load(open('src/data/episode01/placement.json'))['frames'])")
CHUNKS=("0 2479" "2480 4959" "4960 7439" "7440 $((FRAMES-1))")

python3 scripts/subtitles/build_subtitles.py ep01 > /dev/null
for F in L V; do
  C=BilingualCueStill; [ $F = V ] && C=BilingualCueStillVertical
  [ -s $O/cues_$F/cue_0002.png ] || { s=$(now); node scripts/subtitles/render_cue_stills.mjs ep01 $O/cues_$F $C; echo "cue stills $F $(( $(now)-s ))s" >> $LOG; }
done

# ---- sound: render once (shared by both masters), then master: gentle compression → −15 LUFS / −1.5 dBTP → limiter
if [ ! -s $O/mix_master.wav ]; then
  s=$(now)
  [ -s $O/mix_raw.wav ] || npx remotion render Episode01 $O/mix_raw.wav --codec=wav --log=error
  ffmpeg -loglevel error -y -i $O/mix_raw.wav -af "acompressor=threshold=-28dB:ratio=2.5:attack=10:release=250:makeup=1" -ar 48000 $O/mix_comp.wav
  M=$(ffmpeg -hide_banner -nostats -i $O/mix_comp.wav -af loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/{/,/}/p')
  get() { echo "$M" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
  ffmpeg -loglevel error -y -i $O/mix_comp.wav -af "loudnorm=I=-15:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):offset=$(get target_offset):linear=true,alimiter=limit=0.82:attack=2:release=60:level=false" -ar 48000 $O/mix_master.wav
  echo "audio $(( $(now)-s ))s" >> $LOG
fi

for F in L V; do
  if [ $F = L ]; then COMP=Episode01; SIZE=1920x1080; EXT=0; else COMP=Episode01Vertical; SIZE=1080x1920; EXT=1475; fi
  for c in "${CHUNKS[@]}"; do
    set -- $c; A=$1; B=$2; N=$(printf "%s_%05d-%05d" $F $A $B)
    if [ ! -s $O/chunks/raw_$N.mp4 ]; then
      s=$(now); npx remotion render $COMP $O/chunks/raw_$N.mp4 --frames=$A-$B --muted --concurrency=4 --log=error
      echo "raw $N $(( $(now)-s ))s" >> $LOG
    fi
    if [ ! -s $O/chunks/painted_$N.mp4 ]; then
      s=$(now); python3 scripts/paint_pass.py $O/chunks/raw_$N.mp4 $O/chunks/painted_$N.mp4 --light --workers 4 --crf 14 --size $SIZE --extend-below $EXT
      echo "paint $N $(( $(now)-s ))s" >> $LOG
    fi
  done
done

s=$(now)
for F in L V; do
  if [ $F = L ]; then NAME=LongForm_16x9; SIZE=1920x1080; else NAME=ShortsMaster_9x16; SIZE=1080x1920; fi
  ls $O/chunks/painted_${F}_*.mp4 | sort | sed "s#^$O/chunks/#file '#; s#\$#'#" > $O/chunks/list_$F.txt
  ffmpeg -loglevel error -y -f concat -safe 0 -i $O/chunks/list_$F.txt -c copy $O/picture_$F.mp4
  ffmpeg -loglevel error -y -i $O/picture_$F.mp4 -i $O/mix_master.wav -map 0:v -map 1:a -c:v libx264 -crf 19 -preset medium -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart $O/Deeply_Rooted_Episode01_${NAME}_clean.mp4
  python3 scripts/subtitles/burn_bilingual.py $O/picture_$F.mp4 ep01 $O/cues_$F $O/Deeply_Rooted_Episode01_${NAME}.mp4 --audio $O/mix_master.wav --crf 19 --preset medium --size $SIZE
done
cp subtitles/ep01_en.srt $O/Deeply_Rooted_Episode01_EN.srt
cp subtitles/ep01_ar.srt $O/Deeply_Rooted_Episode01_AR.srt
echo "assemble $(( $(now)-s ))s" >> $LOG
echo "=== v2 end $(date -u +%H:%M:%S)" >> $LOG
echo "episode01 v2 done"
