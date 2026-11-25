"""Export the on-screen script as an SRT subtitle file (for YouTube closed captions).

Uses the same placement data as the film (src/data/narration.json), so the SRT matches the
burned-in captions frame for frame.   python3 scripts/export_srt.py  →  out/phase01_captions.srt
"""
import json
import os

FPS = 30
ROOT = os.path.join(os.path.dirname(__file__), "..")
d = json.load(open(os.path.join(ROOT, "src", "data", "narration.json")))
LEAD, HOLD = 0.08, 0.5  # keep in sync with `captions` in src/config/production.ts


def film(src: float) -> float:
    for s in d["segments"]:
        if s["src"][0] - 1e-6 <= src <= s["src"][1] + 1e-6:
            return s["at"] + (src - s["src"][0])
    raise ValueError(src)


def tc(t: float) -> str:
    f = round(t * FPS) / FPS
    h, rem = divmod(f, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s - int(s)) * 1000)):03d}"


items = []
for t in d["titles"]:
    items.append((film(t["src"][0]) - 0.1, film(t["src"][1]) + 0.2, t["text"]))
caps = d["captions"]
for i, c in enumerate(caps):
    a = film(c["src"][0]) - LEAD
    b = film(c["src"][1]) + HOLD
    if i + 1 < len(caps):
        b = min(b, film(caps[i + 1]["src"][0]) - LEAD - 2 / FPS)
    items.append((a, b, c["text"]))
os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
out = os.path.join(ROOT, "out", "phase01_captions.srt")
with open(out, "w", encoding="utf-8") as fh:
    for k, (a, b, text) in enumerate(items, 1):
        fh.write(f"{k}\n{tc(a)} --> {tc(b)}\n{text}\n\n")
print("wrote", out)
