"""Deeply Rooted — painterly finishing pass (non-photorealistic post-processing).

Turns the clean programmatic render into brushwork, frame by frame:
  1. Soft generalised Kuwahara filter (edge-preserving, oil/gouache brush patches), two scales
  2. Pigment pooling: gentle darkening along edges, like paint gathering at a stroke's border
  3. Canvas tooth: a fine woven-canvas / paper texture
  4. Halation / bloom on highlights (warm)
  5. Film grain (after painting, so grain never gets smeared)

It is deterministic per pixel (no random strokes), so it is temporally stable on moving footage.

  python3 scripts/paint_pass.py IN.mp4 OUT.mp4 [--workers 4]
  python3 scripts/paint_pass.py --still IN.png OUT.png
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor

import cv2
import numpy as np

W, H = 1920, 1080
HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "..", "public", "textures")

PARAMS = dict(
    radius_fine=4,
    radius_broad=8,
    broad_mix=0.45,
    q=6.0,
    edge_dark=0.16,
    canvas=0.055,
    bloom=0.22,
    bloom_threshold=0.70,
    grain=0.032,
)
# --light: for already-painted plates (Pilot 01) — unifies plate, character and light without repainting them
PARAMS_LIGHT = dict(
    radius_fine=2,
    radius_broad=4,
    broad_mix=0.3,
    q=6.0,
    edge_dark=0.07,
    canvas=0.024,
    bloom=0.2,
    bloom_threshold=0.72,
    grain=0.022,
    broad_half=True,
)
ACTIVE = PARAMS
EXTEND_BELOW = 0  # vertical master: rows from here down are filled with a soft reflection of the picture above


def _half_kernels(r: int):
    x = np.arange(-r, r + 1, dtype=np.float32)
    g = np.exp(-(x**2) / (2 * (r * 0.55) ** 2)).astype(np.float32)
    lo = g * (x <= 0)
    hi = g * (x >= 0)
    return lo / lo.sum(), hi / hi.sum()


def kuwahara(img: np.ndarray, r: int, q: float) -> np.ndarray:
    """Soft generalised Kuwahara with 4 overlapping Gaussian-weighted quadrants (separable)."""
    lo, hi = _half_kernels(r)
    img2 = img * img
    num = np.zeros_like(img)
    den = np.zeros(img.shape[:2], np.float32)
    for kx in (lo, hi):
        for ky in (lo, hi):
            m = cv2.sepFilter2D(img, -1, kx, ky, borderType=cv2.BORDER_REFLECT)
            m2 = cv2.sepFilter2D(img2, -1, kx, ky, borderType=cv2.BORDER_REFLECT)
            var = np.maximum(m2 - m * m, 0).sum(axis=2)
            w = 1.0 / (1e-5 + var) ** (q / 2)
            w = w.astype(np.float32)
            num += m * w[..., None]
            den += w
    return num / den[..., None]


_canvas = None


def canvas_texture() -> np.ndarray:
    global _canvas
    if _canvas is None:
        rng = np.random.default_rng(5)
        # woven canvas: fine orthogonal threads + paper fibres from the brush texture
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        weave = 0.5 + 0.25 * np.sin(x * 2 * np.pi / 3.1) * np.sin(y * 2 * np.pi / 3.3)
        weave = cv2.GaussianBlur(weave, (0, 0), 0.6)
        brush = cv2.imread(os.path.join(TEX, "brush.png"), cv2.IMREAD_GRAYSCALE)
        brush = cv2.resize(brush, (W, H)).astype(np.float32) / 255
        fib = rng.normal(0.5, 0.15, (H // 2, W // 2)).astype(np.float32)
        fib = cv2.resize(cv2.GaussianBlur(fib, (0, 0), 0.8), (W, H))
        t = 0.45 * weave + 0.35 * brush + 0.2 * fib
        _canvas = (t - t.mean()).astype(np.float32)
    return _canvas


def extend_below(frame_bgr: np.ndarray, row: int) -> np.ndarray:
    """Fill the rows under the picture (9:16 master) with the scene's own foreground, mirrored, softened and darkened —
    like water or ground continuing into shadow — so the bottom of the phone frame belongs to the scene."""
    h = frame_bgr.shape[0] - row
    if h <= 0:
        return frame_bgr
    out = frame_bgr.copy()
    src = frame_bgr[row - h:row][::-1].astype(np.float32)
    small = cv2.resize(src, (src.shape[1] // 8, max(1, h // 8)), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 3.0)
    soft = cv2.resize(small, (src.shape[1], h), interpolation=cv2.INTER_LINEAR)
    t = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    near = np.clip(1 - t / 0.08, 0, 1)  # the first rows stay closer to the sharp mirror, so the seam is invisible
    mix = src * near + soft * (1 - near)
    dark = 0.78 - 0.5 * t ** 0.8
    out[row:] = np.clip(mix * dark + 6 * (1 - dark), 0, 255).astype(np.uint8)
    return out


def paint(frame_bgr: np.ndarray, idx: int = 0, p: dict = PARAMS) -> np.ndarray:
    if EXTEND_BELOW:
        frame_bgr = extend_below(frame_bgr, EXTEND_BELOW)
    img = frame_bgr.astype(np.float32) / 255.0
    fine = kuwahara(img, p["radius_fine"], p["q"])
    if p.get("broad_half"):
        # the broad (low-frequency) strokes computed at half resolution: same look, ~3x cheaper
        h0, w0 = img.shape[:2]
        small = cv2.resize(img, (w0 // 2, h0 // 2), interpolation=cv2.INTER_AREA)
        broad = cv2.resize(kuwahara(small, max(1, p["radius_broad"] // 2), p["q"]), (w0, h0), interpolation=cv2.INTER_LINEAR)
    else:
        broad = kuwahara(img, p["radius_broad"], p["q"])
    # broad strokes in flat areas, fine strokes where detail lives (faces, hands, edges)
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    detail = cv2.GaussianBlur(np.abs(cv2.Laplacian(lum, cv2.CV_32F, ksize=3)), (0, 0), 3)
    keep_fine = np.clip(detail * 18, 0, 1)[..., None]
    out = fine * keep_fine + (fine * (1 - p["broad_mix"]) + broad * p["broad_mix"]) * (1 - keep_fine)

    # pigment pooling along edges (difference of Gaussians on luminance)
    l2 = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
    dog = cv2.GaussianBlur(l2, (0, 0), 1.2) - cv2.GaussianBlur(l2, (0, 0), 3.2)
    pool = np.clip(-dog * 9, 0, 1)
    out = out * (1 - p["edge_dark"] * pool[..., None])

    # canvas tooth
    out = out * (1 + p["canvas"] * canvas_texture()[..., None] * 2)

    # halation on highlights (warm)
    l3 = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
    hi = np.clip((l3 - p["bloom_threshold"]) / (1 - p["bloom_threshold"]), 0, 1)
    small = cv2.resize(hi, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 9)
    glow = cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR)[..., None] * np.array([0.78, 0.9, 1.0], np.float32)
    out = 1 - (1 - out) * (1 - p["bloom"] * glow)

    # film grain (temporal)
    rng = np.random.default_rng(1000 + idx)
    g = rng.normal(0, 1, (H // 2, W // 2)).astype(np.float32)
    g = cv2.resize(cv2.GaussianBlur(g, (0, 0), 0.7), (W, H), interpolation=cv2.INTER_LINEAR)
    mid = 1 - np.abs(cv2.cvtColor(out, cv2.COLOR_BGR2GRAY) - 0.5) * 1.2
    out = out + g[..., None] * p["grain"] * mid[..., None]
    return np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8)


def _work(args):
    idx, buf = args
    cv2.setNumThreads(1)
    frame = np.frombuffer(buf, np.uint8).reshape(H, W, 3)
    return idx, paint(frame, idx, ACTIVE).tobytes()


def run_video(src: str, dst: str, workers: int, crf: int) -> None:
    dec = subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE
    )
    enc = subprocess.Popen(
        ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", "30", "-i", "-",
         "-c:v", "libx264", "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", dst],
        stdin=subprocess.PIPE,
    )
    size = W * H * 3
    idx = 0
    batch = []
    with ProcessPoolExecutor(workers) as ex:
        while True:
            buf = dec.stdout.read(size)
            if len(buf) < size:
                break
            batch.append((idx, buf))
            idx += 1
            if len(batch) == workers * 4:
                for _, out in sorted(ex.map(_work, batch)):
                    enc.stdin.write(out)
                batch = []
                if idx % 120 == 0:
                    print(f"  painted {idx} frames", flush=True)
        for _, out in sorted(ex.map(_work, batch)):
            enc.stdin.write(out)
    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(f"painted {idx} frames → {dst}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--still", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--crf", type=int, default=14)
    ap.add_argument("--light", action="store_true", help="gentler pass for pre-painted plates")
    ap.add_argument("--size", default="1920x1080", help="frame size WxH (1080x1920 for the vertical master)")
    ap.add_argument("--extend-below", type=int, default=0, help="vertical master: fill rows from this one down")
    a = ap.parse_args()
    W, H = map(int, a.size.split("x"))
    EXTEND_BELOW = a.extend_below
    if a.light:
        ACTIVE = PARAMS_LIGHT
    if a.still:
        im = cv2.imread(a.src)
        cv2.imwrite(a.dst, paint(im, 0, ACTIVE))
    else:
        run_video(a.src, a.dst, a.workers, a.crf)
