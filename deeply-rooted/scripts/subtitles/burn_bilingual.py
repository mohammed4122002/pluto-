"""Burn the channel's bilingual subtitles into a video.
Blends each cue's still (rendered once by render_cue_stills.mjs with the BilingualSubtitles component) onto the frames,
with exactly the component's timing and fade (ease-in-out sine, 6 frames in / 8 out).
python3 scripts/subtitles/burn_bilingual.py <video_in> <id> <cue_stills_dir> <video_out> [--offset FRAMES] [--audio file] [--crf 16]
--offset: the input video starts at this frame of the episode (for checkpoint chunks)."""
import argparse
import json
import math
import os
import subprocess

import cv2
import numpy as np

FADE_IN, FADE_OUT = 6, 8
W, H = 1920, 1080


def ramp(f, start, dur):
    t = min(1.0, max(0.0, (f - start) / max(1, dur)))
    return -(math.cos(math.pi * t) - 1) / 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("id")
    ap.add_argument("stills")
    ap.add_argument("dst")
    ap.add_argument("--offset", type=int, default=0)
    ap.add_argument("--audio")
    ap.add_argument("--crf", type=int, default=16)
    ap.add_argument("--preset", default="slow")
    a = ap.parse_args()
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    cues = json.load(open(os.path.join(root, "src", "data", "subtitles", f"{a.id}.timed.json"), encoding="utf-8"))["cues"]
    cues = [(i, c) for i, c in enumerate(cues) if c.get("burn") is not False]
    cache = {}

    def still(i):
        if i not in cache:
            im = cv2.imread(os.path.join(a.stills, f"cue_{i:04d}.png"), cv2.IMREAD_UNCHANGED)
            al = im[..., 3].astype(np.float32) / 255
            ys, xs = np.where(al > 0.002)
            y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            cache.clear() if len(cache) > 6 else None
            cache[i] = (y0, y1, x0, x1, im[y0:y1, x0:x1, :3].astype(np.float32), al[y0:y1, x0:x1, None])
        return cache[i]

    dec = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", a.src, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "30", "-i", "-"]
    if a.audio:
        cmd += ["-i", a.audio, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "256k", "-shortest"]
    cmd += ["-c:v", "libx264", "-preset", a.preset, "-crf", str(a.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", a.dst]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    n, k = 0, 0
    size = W * H * 3
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        f = a.offset + n
        while k < len(cues) and cues[k][1]["to"] <= f:
            k += 1
        frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
        if k < len(cues) and cues[k][1]["from"] <= f < cues[k][1]["to"]:
            i, c = cues[k]
            o = min(ramp(f, c["from"], FADE_IN), 1 - ramp(f, c["to"] - FADE_OUT, FADE_OUT))
            if o > 0:
                y0, y1, x0, x1, rgb, al = still(i)
                frame = frame.copy()
                region = frame[y0:y1, x0:x1].astype(np.float32)
                aa = al * o
                frame[y0:y1, x0:x1] = np.clip(region * (1 - aa) + rgb * aa + 0.5, 0, 255).astype(np.uint8)
        enc.stdin.write(frame.tobytes())
        n += 1
    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(f"burned {n} frames → {a.dst}")


if __name__ == "__main__":
    main()
