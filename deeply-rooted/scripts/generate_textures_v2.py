"""Deeply Rooted — painterly texture library v2 (quality upgrade).

Deterministic. Writes into public/textures/:
  paint_strokes.png   tileable overlapping brush strokes (value variation laid over any surface)
  wool.png            charcoal overcoat wool (fibres + faint twill), tileable
  knit.png            cream sweater knit (stitch columns + rib grooves), tileable
  twill.png           trouser twill, tileable
  canvas_weave.png    satchel canvas, tileable
  leather.png         boot leather grain, tileable
  skin_pores.png      very soft skin mottling, tileable
  sky_present.jpg     stroke-painted pre-dawn sky (blue-grey stratus, faint gold low on the right)
  sky_imagined.jpg    stroke-painted warm golden sky
  python3 scripts/generate_textures_v2.py   (numpy + opencv)
"""
from __future__ import annotations

import os

import cv2
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "textures")
os.makedirs(OUT, exist_ok=True)


def fbm(h, w, scale, octaves, seed, tile=True):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        gh, gw = max(2, int(h / scale * 2**o)), max(2, int(w / scale * 2**o))
        g = rng.random((gh, gw)).astype(np.float32)
        if tile:
            g = np.tile(g, (3, 3))
            big = cv2.resize(g, (w * 3, h * 3), interpolation=cv2.INTER_CUBIC)[h : 2 * h, w : 2 * w]
        else:
            big = cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC)
        acc += amp * big
        norm += amp
        amp *= 0.5
    return acc / norm


def save_gray(name, a, lo=0.0, hi=1.0):
    a = (a - a.min()) / (a.max() - a.min() + 1e-9)
    a = lo + a * (hi - lo)
    cv2.imwrite(os.path.join(OUT, name), (a * 255).astype(np.uint8))
    print("wrote", name)


def strokes_tile(size=1024, n=1500, seed=1, angle=0.0, spread=24, length=(70, 230), width=(12, 34)):
    rng = np.random.default_rng(seed)
    acc = np.zeros((size, size), np.float32)
    wsum = np.zeros((size, size), np.float32)
    for _ in range(n):
        cx, cy = rng.uniform(0, size, 2)
        a = np.deg2rad(angle + rng.normal(0, spread))
        L = rng.uniform(*length)
        wdt = rng.uniform(*width)
        v = rng.uniform(0.32, 0.68)
        # tapered stroke as a filled polygon with soft bristle texture
        t = np.linspace(-0.5, 0.5, 14)
        bend = rng.normal(0, 0.12)
        xs = cx + np.cos(a) * L * t - np.sin(a) * L * bend * (t**2 - 0.25)
        ys = cy + np.sin(a) * L * t + np.cos(a) * L * bend * (t**2 - 0.25)
        taper = np.sin(np.pi * (t + 0.5)) ** 0.6 * wdt / 2 + 0.5
        nx, ny = -np.sin(a), np.cos(a)
        poly = np.concatenate([np.stack([xs + nx * taper, ys + ny * taper], 1), np.stack([xs - nx * taper, ys - ny * taper], 1)[::-1]])
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                p = poly + [ox, oy]
                x0, y0 = int(max(0, p[:, 0].min() - 2)), int(max(0, p[:, 1].min() - 2))
                x1, y1 = int(min(size, p[:, 0].max() + 3)), int(min(size, p[:, 1].max() + 3))
                if x1 <= x0 or y1 <= y0:
                    continue
                mask = np.zeros((y1 - y0, x1 - x0), np.uint8)
                cv2.fillPoly(mask, [(p - [x0, y0]).astype(np.int32)], 255, lineType=cv2.LINE_AA)
                m = mask.astype(np.float32) / 255 * 0.55
                acc[y0:y1, x0:x1] = acc[y0:y1, x0:x1] * (1 - m) + v * m
                wsum[y0:y1, x0:x1] = np.maximum(wsum[y0:y1, x0:x1], m)
    base = fbm(size, size, 256, 4, seed + 7)
    acc = np.where(wsum > 0, acc, base)
    bristle = cv2.GaussianBlur(np.random.default_rng(seed + 3).random((size, size)).astype(np.float32), (0, 0), 0.8)
    acc = acc * 0.85 + bristle * 0.15
    return cv2.GaussianBlur(acc, (0, 0), 0.9)


def wool(size=512, seed=11):
    rng = np.random.default_rng(seed)
    img = np.zeros((size, size), np.float32)
    for _ in range(9000):
        x, y = rng.uniform(0, size, 2)
        a = rng.uniform(0, np.pi)
        L = rng.uniform(4, 14)
        x2, y2 = x + np.cos(a) * L, y + np.sin(a) * L
        v = rng.uniform(-1, 1)
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                cv2.line(img, (int(x + ox), int(y + oy)), (int(x2 + ox), int(y2 + oy)), float(v), 1, cv2.LINE_AA)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    twill = np.sin((xx + yy) * 2 * np.pi / 7.0) * 0.35
    img = cv2.GaussianBlur(img, (0, 0), 0.7) + twill + (fbm(size, size, 128, 3, seed) - 0.5) * 2.5
    return img


def knit(size=512, cols=32, rows=44):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    cw, rh = size / cols, size / rows
    u = (xx % cw) / cw - 0.5
    v = (yy % rh) / rh
    # each stitch: two slanted lobes forming a V
    lobe = np.exp(-(((np.abs(u) - 0.24) * 2.6 + (v - 0.5) * 0.9) ** 2) / 0.05) * np.exp(-((v - 0.5) ** 2) / 0.12)
    groove = np.exp(-(u**2) / 0.003) * 0.55
    rib = ((xx // cw) % 4 == 3).astype(np.float32) * 0.35
    img = lobe - groove - rib + (fbm(size, size, 96, 3, 21) - 0.5) * 0.4
    return cv2.GaussianBlur(img, (0, 0), 0.6)


def twill(size=512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    t = np.sin((xx * 0.7 + yy) * 2 * np.pi / 5.0) * 0.5 + (fbm(size, size, 64, 3, 31) - 0.5) * 0.8
    return cv2.GaussianBlur(t, (0, 0), 0.5)


def canvas_weave(size=512):
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    w = np.sin(xx * 2 * np.pi / 6) * np.sin(yy * 2 * np.pi / 6)
    thread = (fbm(size, size, 32, 2, 41) - 0.5) * 1.2
    return cv2.GaussianBlur(w * 0.6 + thread, (0, 0), 0.6)


def leather(size=512, seed=51):
    rng = np.random.default_rng(seed)
    pts = rng.uniform(0, size, (900, 2)).astype(np.float32)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.full((size, size), 1e9, np.float32)
    for (px, py) in pts:
        dx = np.minimum(np.abs(xx - px), size - np.abs(xx - px))
        dy = np.minimum(np.abs(yy - py), size - np.abs(yy - py))
        d = np.minimum(d, dx * dx + dy * dy)
    cells = np.sqrt(d)
    return cv2.GaussianBlur(cells, (0, 0), 1.0) + (fbm(size, size, 128, 3, seed) - 0.5) * 6


def painted_sky(w, h, stops, glow, seed, clouds):
    """Stroke-painted sky. stops: [(y_frac, bgr)], glow: (x_frac, y_frac, bgr, strength)."""
    rng = np.random.default_rng(seed)
    y = np.linspace(0, 1, h)[:, None]
    base = np.zeros((h, w, 3), np.float32)
    ys = [s[0] for s in stops]
    for c in range(3):
        base[..., c] = np.interp(y, ys, [s[1][c] for s in stops])
    gx, gy, gcol, gs = glow
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    g = np.exp(-(((xx / w - gx) / 0.42) ** 2 + ((yy / h - gy) / 0.2) ** 2)) * gs
    base = base * (1 - g[..., None]) + np.array(gcol, np.float32) * g[..., None]
    # cloud field
    cf = fbm(h, w, 380, 6, seed + 1, tile=False)
    stretch = cv2.resize(fbm(h, w // 4, 200, 4, seed + 2, tile=False), (w, h))
    cloud = np.clip((cf * 0.7 + stretch * 0.45 - clouds[0]) / clouds[1], 0, 1)
    cloud *= np.clip(1 - np.abs(y - clouds[2]) / clouds[3], 0, 1)
    ccol = np.array(clouds[4], np.float32)
    target = base * (1 - cloud[..., None] * clouds[5]) + ccol * cloud[..., None] * clouds[5]
    # lay brush strokes sampled from the target
    canvas = cv2.GaussianBlur(target, (0, 0), 6)
    for layer, (n, L, wd) in enumerate(((5000, (90, 260), (14, 34)), (9000, (40, 120), (6, 16)))):
        for _ in range(n):
            cx, cy = rng.uniform(0, w), rng.uniform(0, h)
            col = target[int(cy), int(cx)] * (1 + rng.normal(0, 0.025))
            a = np.deg2rad(rng.normal(0, 6 if layer == 0 else 10))
            length = rng.uniform(*L)
            wid = rng.uniform(*wd)
            p1 = (int(cx - np.cos(a) * length / 2), int(cy - np.sin(a) * length / 2))
            p2 = (int(cx + np.cos(a) * length / 2), int(cy + np.sin(a) * length / 2))
            x0, x1 = max(0, min(p1[0], p2[0]) - int(wid)), min(w, max(p1[0], p2[0]) + int(wid))
            y0, y1 = max(0, min(p1[1], p2[1]) - int(wid)), min(h, max(p1[1], p2[1]) + int(wid))
            if x1 <= x0 or y1 <= y0:
                continue
            roi = canvas[y0:y1, x0:x1]
            m = np.zeros(roi.shape[:2], np.float32)
            cv2.line(m, (p1[0] - x0, p1[1] - y0), (p2[0] - x0, p2[1] - y0), 1.0, int(wid), cv2.LINE_AA)
            m = cv2.GaussianBlur(m, (0, 0), 1.2) * rng.uniform(0.25, 0.55)
            roi[:] = roi * (1 - m[..., None]) + col * m[..., None]
    return np.clip(canvas, 0, 255).astype(np.uint8)


if __name__ == "__main__":
    save_gray("paint_strokes.png", strokes_tile())
    save_gray("wool.png", wool(), 0.25, 0.75)
    save_gray("knit.png", knit(), 0.2, 0.8)
    save_gray("twill.png", twill(), 0.3, 0.7)
    save_gray("canvas_weave.png", canvas_weave(), 0.3, 0.7)
    save_gray("leather.png", leather(), 0.3, 0.7)
    save_gray("skin_pores.png", fbm(512, 512, 24, 4, 61) * 0.6 + fbm(512, 512, 160, 3, 62) * 0.4, 0.3, 0.7)
    # BGR colours
    sky_p = painted_sky(
        2400, 1100,
        [(0.0, (104, 96, 89)), (0.45, (152, 146, 138)), (0.8, (190, 196, 200)), (1.0, (196, 203, 207))],
        (0.78, 0.92, (150, 196, 228), 0.42), 7,
        (0.5, 0.25, 0.42, 0.42, (182, 182, 178), 0.55),
    )
    cv2.imwrite(os.path.join(OUT, "sky_present.jpg"), sky_p, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print("wrote sky_present.jpg")
    sky_i = painted_sky(
        2400, 1100,
        [(0.0, (150, 172, 186)), (0.45, (170, 200, 220)), (0.8, (196, 226, 242)), (1.0, (206, 232, 244))],
        (0.72, 0.72, (170, 220, 246), 0.7), 9,
        (0.52, 0.22, 0.4, 0.4, (214, 232, 244), 0.6),
    )
    cv2.imwrite(os.path.join(OUT, "sky_imagined.jpg"), sky_i, [cv2.IMWRITE_JPEG_QUALITY, 92])
    print("wrote sky_imagined.jpg")
