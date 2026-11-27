"""DEEPLY ROOTED — bilingual subtitle builder (one system for every episode).

Input : src/data/subtitles/<id>.cues.json
          placement: where each narration excerpt sits in the film  [{"src": [from, to], "at": film_seconds}, …]
          cues:      [{"words": [first_word_start, last_word_end]  (seconds in the narration recording),
                       "en": "...", "ar": "..."}, …]   — one line per language, broken at natural pauses
Output: src/data/subtitles/<id>.timed.json   (frames, read by the BilingualSubtitles component)
        subtitles/<id>_en.srt, subtitles/<id>_ar.srt   (separate tracks for YouTube)

Timing rules (same as BILINGUAL_TIMING in src/subtitles/style.ts): in 2 frames before the first word,
out 0.5 s after the last word, always clearing 2 frames before the next cue. Checks line length and reading speed.
Usage: python3 scripts/subtitles/build_subtitles.py pilot01
"""
import json
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
LEAD_FRAMES, TAIL_SEC, MIN_GAP_FRAMES = 2, 0.5, 2
MAX_EN, MAX_AR, MAX_CPS = 42, 44, 17


def film_frame(t, placement, fps):
    for seg in placement:
        a, b = seg["src"]
        if a - 1e-6 <= t <= b + 1e-6:
            return int(round((seg["at"] + (t - a)) * fps + 1e-9))
    raise ValueError(f"narration time {t}s is outside every placed excerpt {placement}")


def srt_time(frame, fps):
    ms = round(frame / fps * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def build(cue_id):
    spec = json.load(open(os.path.join(ROOT, "src", "data", "subtitles", f"{cue_id}.cues.json"), encoding="utf-8"))
    fps, placement = spec["fps"], spec["placement"]
    timed, problems = [], []
    for c in spec["cues"]:
        a, b = c["words"]
        timed.append({"from": film_frame(a, placement, fps) - LEAD_FRAMES, "to": film_frame(b, placement, fps) + round(TAIL_SEC * fps), "en": c["en"], "ar": c["ar"]})
    for i in range(len(timed) - 1):
        timed[i]["to"] = min(timed[i]["to"], timed[i + 1]["from"] - MIN_GAP_FRAMES)
    for i, c in enumerate(timed, 1):
        dur = (c["to"] - c["from"]) / fps
        for lang, mx in (("en", MAX_EN), ("ar", MAX_AR)):
            n = len(c[lang])
            if n > mx:
                problems.append(f"cue {i} {lang}: {n} chars > {mx} — split it at a natural pause")
            if n / dur > MAX_CPS:
                problems.append(f"cue {i} {lang}: {n / dur:.1f} chars/s > {MAX_CPS} — too fast to read")
        if c["to"] <= c["from"]:
            problems.append(f"cue {i}: no screen time")
    out = {"id": cue_id, "fps": fps, "cues": timed}
    json.dump(out, open(os.path.join(ROOT, "src", "data", "subtitles", f"{cue_id}.timed.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.makedirs(os.path.join(ROOT, "subtitles"), exist_ok=True)
    for lang in ("en", "ar"):
        lines = [f"{i}\n{srt_time(c['from'], fps)} --> {srt_time(c['to'], fps)}\n{c[lang]}\n" for i, c in enumerate(timed, 1)]
        open(os.path.join(ROOT, "subtitles", f"{cue_id}_{lang}.srt"), "w", encoding="utf-8").write("\n".join(lines))
    for i, c in enumerate(timed, 1):
        print(f"{i}  {c['from']:>5}–{c['to']:<5} ({srt_time(c['from'], fps)} → {srt_time(c['to'], fps)})  {c['en']}  |  {c['ar']}")
    if problems:
        print("PROBLEMS:\n  " + "\n  ".join(problems))
        sys.exit(1)
    print(f"ok: {len(timed)} cues → src/data/subtitles/{cue_id}.timed.json, subtitles/{cue_id}_en.srt, subtitles/{cue_id}_ar.srt")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "pilot01")
