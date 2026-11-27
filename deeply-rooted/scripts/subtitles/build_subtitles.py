"""DEEPLY ROOTED — bilingual subtitle builder (one system for every episode).

Input : src/data/subtitles/<id>.cues.json
          placement: where each narration excerpt sits in the film  [{"src": [from, to], "at": film_seconds}, …]
                     (or a path to a JSON file with "segments" in that form, shared with the picture)
          cues:      [{"en": "...", "ar": "...", "words": [first_word_start, last_word_end]?, "burn": false?}, …]
                     one line per language, broken at natural pauses. Without "words", the cue is aligned
                     automatically to "transcript" (word timestamps of the narration recording).
                     "burn": false keeps a cue out of the burned-in layer (e.g. lines carried by a title card)
                     but in the SRTs.
Output: src/data/subtitles/<id>.timed.json   (frames, read by the BilingualSubtitles component)
        subtitles/<id>_en.srt, subtitles/<id>_ar.srt   (separate tracks for YouTube)

Timing rules (same as BILINGUAL_TIMING in src/subtitles/style.ts): in 2 frames before the first word,
out 0.5 s after the last word, always clearing 2 frames before the next cue. Checks line length and reading speed.
Usage: python3 scripts/subtitles/build_subtitles.py pilot01
"""
import difflib
import json
import os
import re
import sys
import unicodedata

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
LEAD_FRAMES, TAIL_SEC, MIN_GAP_FRAMES = 2, 0.5, 2
MAX_EN, MAX_AR, MAX_CPS = 46, 46, 20  # Arabic counted without diacritics; reading speed is a warning only
NUMBERS = {"216": "two hundred sixteen"}


def visible_len(text):
    return sum(1 for ch in text if unicodedata.category(ch) != "Mn")


def tokens(text):
    out = []
    for w in re.sub(r"[-–—/]", " ", text.lower()).split():
        w = re.sub(r"[^a-z0-9']", "", w.replace("’", "'")).strip("'")
        if w:
            out += NUMBERS.get(w, w).split()
    return out


def align(cues, words):
    """Time each cue from the transcript's words (sequence alignment tolerates recogniser spellings)."""
    tw = [re.sub(r"[^a-z0-9']", "", w["w"]) for w in words]
    ctoks, owner = [], []
    for i, c in enumerate(cues):
        for t in tokens(c["en"]):
            ctoks.append(t)
            owner.append(i)
    m = [None] * len(ctoks)
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=ctoks, b=tw, autojunk=False).get_opcodes():
        for k in range(i1, i2):
            if tag in ("equal", "replace") and j2 > j1:
                m[k] = j1 + min(j2 - j1 - 1, int((k - i1) * (j2 - j1) / max(1, i2 - i1)))
    for k in range(len(m)):  # tokens with no counterpart borrow their neighbour's position
        if m[k] is None:
            m[k] = next((m[q] for q in range(k - 1, -1, -1) if m[q] is not None), 0)
    times = {}
    for k, i in enumerate(owner):
        a, b = times.get(i, (None, None))
        times[i] = (words[m[k]]["t"] if a is None else a, words[m[k]]["end"])
    return times


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
    if isinstance(placement, str):
        placement = json.load(open(os.path.join(ROOT, placement)))["segments"]
    auto = {}
    if any("words" not in c for c in spec["cues"]):
        auto = align(spec["cues"], json.load(open(os.path.join(ROOT, spec["transcript"])))["words"])
    timed, problems, warnings = [], [], []
    for i, c in enumerate(spec["cues"]):
        a, b = c.get("words") or auto[i]
        t = {"from": film_frame(a, placement, fps) - LEAD_FRAMES, "to": film_frame(b, placement, fps) + round(TAIL_SEC * fps), "en": c["en"], "ar": c["ar"]}
        if c.get("burn") is False:
            t["burn"] = False
        if c.get("scrim"):
            t["scrim"] = True
        timed.append(t)
    for i in range(len(timed) - 1):
        timed[i]["to"] = min(timed[i]["to"], timed[i + 1]["from"] - MIN_GAP_FRAMES)
    for i, c in enumerate(timed, 1):
        dur = (c["to"] - c["from"]) / fps
        for lang, mx in (("en", MAX_EN), ("ar", MAX_AR)):
            n = visible_len(c[lang])
            if n > mx:
                problems.append(f"cue {i} {lang}: {n} chars > {mx} — split it at a natural pause")
            if dur > 0 and n / dur > MAX_CPS:
                warnings.append(f"cue {i} {lang}: {n / dur:.1f} chars/s (> {MAX_CPS})")
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
    if warnings:
        print("reading-speed warnings (set by the narration's pace):\n  " + "\n  ".join(warnings))
    if problems:
        print("PROBLEMS:\n  " + "\n  ".join(problems))
        sys.exit(1)
    print(f"ok: {len(timed)} cues → src/data/subtitles/{cue_id}.timed.json, subtitles/{cue_id}_en.srt, subtitles/{cue_id}_ar.srt")


if __name__ == "__main__":
    build(sys.argv[1] if len(sys.argv) > 1 else "pilot01")
