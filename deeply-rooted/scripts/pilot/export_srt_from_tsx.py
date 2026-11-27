"""Writes SRT subtitle tracks (en + ar) from a pilot composition's PILOT_SUBS cues.
Usage: python3 scripts/pilot/export_srt_from_tsx.py <composition.tsx> <out-prefix>
e.g.   python3 scripts/pilot/export_srt_from_tsx.py src/pilot/Pilot01VoiceTest.tsx out/pilot01_voicetest/pilot01_voicetest"""
import os
import re
import sys

tsx, prefix = sys.argv[1], sys.argv[2]
src = open(tsx, encoding="utf-8").read()
FPS = int(re.search(r"PILOT_FPS = (\d+)", src).group(1))
VO_AT = int(re.search(r"const VO_AT = (\d+)", src).group(1))
SRC0 = float(re.search(r"const SRC0 = ([\d.]+)", src).group(1))


def film(t):
    x = VO_AT + (t - SRC0) * FPS
    return int(x + 0.5)  # Math.round


def ts(frame):
    ms = round(frame / FPS * 1000)
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


block = src[src.index("export const PILOT_SUBS") :]
os.makedirs(os.path.dirname(prefix) or ".", exist_ok=True)
for lang in ("en", "ar"):
    part = block[block.index(f"{lang}: [") :]
    part = part[: part.index("],")]
    cues = re.findall(r"\{text: '(.+?)', from: (.+?), to: (.+?)\}", part)
    out = [f"{i}\n{ts(eval(a, {'film': film}))} --> {ts(eval(b, {'film': film}))}\n{text}\n" for i, (text, a, b) in enumerate(cues, 1)]
    open(f"{prefix}_{lang}.srt", "w", encoding="utf-8").write("\n".join(out))
    print(f"wrote {prefix}_{lang}.srt\n" + "\n".join(out))
