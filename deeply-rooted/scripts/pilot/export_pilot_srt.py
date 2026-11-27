"""Writes the Pilot 01 subtitle tracks (English + Arabic) as SRT, from the same cue times the film uses."""
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
src = open(os.path.join(ROOT, "src", "pilot", "Pilot01.tsx"), encoding="utf-8").read()
FPS = int(re.search(r"PILOT_FPS = (\d+)", src).group(1))
VO_AT = int(re.search(r"const VO_AT = (\d+)", src).group(1))
SRC0 = float(re.search(r"const SRC0 = ([\d.]+)", src).group(1))


def film(t):
    return round(VO_AT + (t - SRC0) * FPS)


def ev(expr):  # e.g. "film(6.08) - 2"
    return eval(expr, {"film": film})


def ts(frame):
    ms = round(frame / FPS * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


block = src[src.index("export const PILOT_SUBS") :]
for lang in ("en", "ar"):
    part = block[block.index(f"{lang}: [") : ]
    part = part[: part.index("],")]
    cues = re.findall(r"\{text: '(.+?)', from: (.+?), to: (.+?)\}", part)
    out = []
    for i, (text, a, b) in enumerate(cues, 1):
        out.append(f"{i}\n{ts(ev(a))} --> {ts(ev(b))}\n{text}\n")
    path = os.path.join(ROOT, "out", "pilot01", f"pilot01_{lang}.srt")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write("\n".join(out))
    print("wrote", path)
    print("\n".join(out))
