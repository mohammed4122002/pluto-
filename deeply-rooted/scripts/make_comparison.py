"""Before/after comparison frames: v1 (previous delivery) vs v2 (quality upgrade).
  python3 scripts/make_comparison.py out/phase01_final.mp4 out/phase01_v2_final.mp4 out/compare
"""
import os
import subprocess
import sys

import cv2
import numpy as np

before, after, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
PAIRS = [  # (label, time in v1, time in v2)
    ("01 Opening seconds", 2.0, 2.0),
    ("02 The crossroads", 10.5, 10.5),
    ("03 'this isn't where…'", 20.5, 20.0),
    ("04 The map (POV)", 27.5, 27.6),
    ("05 Map becomes world", 29.6, 29.7),
    ("06 The imagined future", 32.5, 32.5),
    ("07 Ending", 39.5, 39.0),
]


def grab(src, t):
    p = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", str(t), "-i", src, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True)
    return cv2.imdecode(np.frombuffer(p.stdout, np.uint8), cv2.IMREAD_COLOR)


def label(img, text, sub):
    bar = np.full((56, img.shape[1], 3), (36, 34, 32), np.uint8)
    cv2.putText(bar, text, (18, 38), cv2.FONT_HERSHEY_DUPLEX, 0.95, (227, 237, 242), 1, cv2.LINE_AA)
    cv2.putText(bar, sub, (img.shape[1] - 330, 38), cv2.FONT_HERSHEY_DUPLEX, 0.7, (125, 183, 217), 1, cv2.LINE_AA)
    return np.vstack([bar, img])


tiles = []
for name, tb, ta in PAIRS:
    b = cv2.resize(grab(before, tb), (960, 540), interpolation=cv2.INTER_AREA)
    a = cv2.resize(grab(after, ta), (960, 540), interpolation=cv2.INTER_AREA)
    pair = np.hstack([label(b, "BEFORE  (v1)", f"{tb:.1f}s"), np.full((596, 8, 3), 20, np.uint8), label(a, "AFTER  (v2)", f"{ta:.1f}s")])
    head = np.full((60, pair.shape[1], 3), (24, 23, 22), np.uint8)
    cv2.putText(head, name, (18, 42), cv2.FONT_HERSHEY_DUPLEX, 1.15, (196, 226, 242), 1, cv2.LINE_AA)
    pair = np.vstack([head, pair])
    fn = os.path.join(out, f"compare_{name[:2]}.jpg")
    cv2.imwrite(fn, pair, [cv2.IMWRITE_JPEG_QUALITY, 90])
    tiles.append(pair)
    print("wrote", fn)
sheet = np.vstack(tiles)
cv2.imwrite(os.path.join(out, "before_after_all.jpg"), cv2.resize(sheet, (sheet.shape[1] // 2, sheet.shape[0] // 2), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 88])
print("wrote before_after_all.jpg")
