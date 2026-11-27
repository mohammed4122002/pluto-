"""Contact sheet: one frame from the middle of each shot, taken from the finished video, labelled with time + shot.
python3 scripts/episode01/contact_sheet.py <video> <out.jpg>"""
import os
import subprocess
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shot_frames import ends, starts  # noqa: E402

NAMES = ["title", "looked", "here", "imagined", "beside", "lamp out", "accept", "walk", "timelines", "race", "paths", "own pace",
         "breathe", "losses", "sit", "hold", "relight", "roots", "get up", "allowed", "courage", "pages", "let go", "verse",
         "look back", "whole picture", "next step", "sunrise", "keep growing", "together", "unfolding", "outro"]


def main(video, out):
    mids = [(a + b) // 2 for a, b in zip(starts, ends)]
    tiles = []
    for i, f in enumerate(mids):
        raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-ss", f"{f / 30:.3f}", "-i", video, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], capture_output=True).stdout
        im = np.frombuffer(raw, np.uint8).reshape(1080, 1920, 3)
        im = cv2.resize(im, (480, 270), interpolation=cv2.INTER_AREA)
        label = f"{i + 1:02d}  {f // 1800}:{f / 30 % 60:04.1f}  {NAMES[i]}"
        ov = im.copy()
        cv2.rectangle(ov, (0, 0), (480, 24), (10, 12, 16), -1)
        im = cv2.addWeighted(ov, 0.6, im, 0.4, 0)
        cv2.putText(im, label, (8, 17), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (235, 238, 240), 1, cv2.LINE_AA)
        tiles.append(im)
    rows = [np.hstack(tiles[r : r + 4]) for r in range(0, len(tiles), 4)]
    cv2.imwrite(out, np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
