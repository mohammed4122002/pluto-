"""Deeply Rooted — Pilot 01 painted background plates ("The End of the Pier").

Each plate is composed as an under-painting (light, colour, perspective) and then *painted*
with layered brush strokes (coarse → fine, after Hertzmann's painterly rendering): strokes follow
the forms, sample colour from the under-painting, and stop where colour changes. Layers keep alpha
so the camera can move them with parallax. Deterministic. Output: public/plates/pilot01/*.png

  python3 scripts/pilot/paint_plates_pilot01.py
"""
from __future__ import annotations

import math
import os

import cv2
import numpy as np

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "plates", "pilot01")
os.makedirs(OUT, exist_ok=True)
W, H = 2560, 1440


def hexbgr(h):
    h = h.lstrip("#")
    return np.array([int(h[4:6], 16), int(h[2:4], 16), int(h[0:2], 16)], np.float32)


def fbm(h, w, scale, octaves, seed):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        gh, gw = max(2, int(h / scale * 2 ** o)), max(2, int(w / scale * 2 ** o))
        acc += amp * cv2.resize(rng.random((gh, gw)).astype(np.float32), (w, h), interpolation=cv2.INTER_CUBIC)
        norm += amp
        amp *= 0.5
    return acc / norm


def vgrad(stops, h=H, w=W):
    y = np.linspace(0, 1, h)
    img = np.zeros((h, w, 3), np.float32)
    ys = [s[0] for s in stops]
    for c in range(3):
        img[..., c] = np.interp(y, ys, [hexbgr(s[1])[c] for s in stops])[:, None]
    return img


def glow(img, cx, cy, rx, ry, col, a):
    yy, xx = np.mgrid[0 : img.shape[0], 0 : img.shape[1]].astype(np.float32)
    g = np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)) * a
    return img * (1 - g[..., None]) + hexbgr(col) * g[..., None]


def ridge(h, w, base_y, amp, freq, seed):
    x = np.arange(w)
    n = fbm(1, w, w * freq, 5, seed)[0]
    return base_y - amp * (n - n.min()) / (n.max() - n.min() + 1e-6)


# ------------------------------------------------------------------------------ brush painter
def stroke_paint(base, radii=(26, 13, 7, 4, 2), T=10.0, seed=0, maxlen=9, flow_bias=(1.0, 0.0), bias_w=0.35, alpha=None):
    """Layered brush strokes over an under-painting (uint8 BGR). Returns uint8 BGR."""
    rng = np.random.default_rng(seed)
    base8 = np.clip(base, 0, 255).astype(np.uint8)
    canvas = cv2.GaussianBlur(base8, (0, 0), radii[0])
    Hh, Ww = base8.shape[:2]
    for R in radii:
        ref = cv2.GaussianBlur(base8, (0, 0), max(0.7, R * 0.45))
        lum = cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY).astype(np.float32)
        gx = cv2.GaussianBlur(cv2.Sobel(lum, cv2.CV_32F, 1, 0, ksize=3), (0, 0), R * 0.8 + 1)
        gy = cv2.GaussianBlur(cv2.Sobel(lum, cv2.CV_32F, 0, 1, ksize=3), (0, 0), R * 0.8 + 1)
        diff = np.abs(canvas.astype(np.int16) - ref.astype(np.int16)).sum(axis=2).astype(np.float32)
        gh, gw = Hh // R, Ww // R
        err = cv2.resize(diff, (gw, gh), interpolation=cv2.INTER_AREA)
        cells = np.argwhere(err > T)
        rng.shuffle(cells)
        refi = ref.astype(np.int16)
        for cy, cx in cells:
            y = min(Hh - 1, cy * R + int(rng.integers(0, R)))
            x = min(Ww - 1, cx * R + int(rng.integers(0, R)))
            if alpha is not None and alpha[y, x] < 0.02:
                continue
            col = refi[y, x]
            pts = [(x, y)]
            px, py = float(x), float(y)
            ldx, ldy = 0.0, 0.0
            for i in range(maxlen):
                gxv, gyv = gx[int(py), int(px)], gy[int(py), int(px)]
                gm = math.hypot(gxv, gyv)
                if gm > 1e-3:
                    dx, dy = -gyv / gm, gxv / gm
                else:
                    dx, dy = flow_bias
                # blend toward the layer's natural brush direction (horizontal water, sky…)
                dx, dy = dx * (1 - bias_w) + flow_bias[0] * bias_w * (1 if dx * flow_bias[0] + dy * flow_bias[1] >= 0 else -1), dy * (1 - bias_w) + flow_bias[1] * bias_w * (1 if dx * flow_bias[0] + dy * flow_bias[1] >= 0 else -1)
                n = math.hypot(dx, dy) or 1
                dx, dy = dx / n, dy / n
                if i and dx * ldx + dy * ldy < 0:
                    dx, dy = -dx, -dy
                if i:
                    dx, dy = 0.6 * dx + 0.4 * ldx, 0.6 * dy + 0.4 * ldy
                nx, ny = px + R * dx, py + R * dy
                if not (0 <= nx < Ww - 1 and 0 <= ny < Hh - 1):
                    break
                if i >= 2:
                    rc = refi[int(ny), int(nx)]
                    cc = canvas[int(ny), int(nx)].astype(np.int16)
                    if np.abs(rc - col).sum() > np.abs(rc - cc).sum():
                        break
                pts.append((nx, ny))
                px, py, ldx, ldy = nx, ny, dx, dy
            j = 1 + rng.normal(0, 0.025)
            c = tuple(int(np.clip(v * j, 0, 255)) for v in col)
            cv2.polylines(canvas, [np.array(pts, np.int32)], False, c, thickness=max(1, int(R * rng.uniform(0.85, 1.25))), lineType=cv2.LINE_AA)
    return canvas


def finish(img, seed):
    """Canvas tooth + very light bristle noise so brushwork reads as paint, not pixels."""
    rng = np.random.default_rng(seed)
    n = cv2.GaussianBlur(rng.normal(0, 1, img.shape[:2]).astype(np.float32), (0, 0), 0.8)
    yy, xx = np.mgrid[0 : img.shape[0], 0 : img.shape[1]].astype(np.float32)
    weave = np.sin(xx * 2 * np.pi / 3.3) * np.sin(yy * 2 * np.pi / 3.1)
    t = (n * 2.2 + weave * 1.6)[..., None]
    return np.clip(img.astype(np.float32) + t, 0, 255).astype(np.uint8)


def save(name, bgr, alpha=None):
    if alpha is None:
        cv2.imwrite(os.path.join(OUT, name), bgr)
    else:
        a = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
        cv2.imwrite(os.path.join(OUT, name), np.dstack([bgr, a]))
    print("wrote", name)


def extend(img, alpha):
    """Fill transparent areas with nearby colour so strokes never pull in black at edges."""
    m = (alpha < 0.05).astype(np.uint8) * 255
    small = cv2.resize(img.astype(np.uint8), (img.shape[1] // 4, img.shape[0] // 4))
    ms = cv2.resize(m, (img.shape[1] // 4, img.shape[0] // 4))
    filled = cv2.inpaint(small, ms, 6, cv2.INPAINT_TELEA)
    big = cv2.resize(filled, (img.shape[1], img.shape[0]), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    a = alpha[..., None]
    return img * a + big * (1 - a)


# ================================================================================ SHOT 1
def shot1():
    hz = 640
    # ---- sky + distant mountains (far plate)
    sky = vgrad([(0, "#0D1422"), (0.2, "#162238"), (0.36, "#26364F"), (0.43, "#3E5266"), (0.47, "#62717A"), (1, "#62717A")])
    sky = glow(sky, 2050, hz - 10, 900, 230, "#B4865F", 0.55)
    sky = glow(sky, 2150, hz - 30, 380, 90, "#E2B27A", 0.35)
    clouds = fbm(H, W, 420, 6, 3) * 0.7 + cv2.resize(fbm(H, W // 6, 160, 4, 4), (W, H)) * 0.45
    cl = np.clip((clouds - 0.5) * 3.2, 0, 1) * np.clip(1 - np.abs(np.linspace(0, 1, H)[:, None] - 0.24) / 0.2, 0, 1)
    sky = sky * (1 - cl[..., None] * 0.45) + hexbgr("#0E1420") * cl[..., None] * 0.45
    under = np.roll(cl, 18, axis=0) * np.clip(1 - np.abs(np.linspace(0, 1, H)[:, None] - 0.3) / 0.12, 0, 1)
    sky = sky + hexbgr("#6A5A55") * (under * 0.25)[..., None]
    rs = np.random.default_rng(9)
    for _ in range(260):
        sx, sy2 = int(rs.uniform(0, W)), int(rs.uniform(0, hz * 0.55))
        b = rs.uniform(0.25, 0.8) * (1 - sy2 / (hz * 0.7))
        cv2.circle(sky, (sx, sy2), 1 if rs.random() < 0.85 else 2, tuple(float(v) for v in hexbgr("#DCE3EA") * b + hexbgr("#162238") * (1 - b)), -1, cv2.LINE_AA)
    for k, (base, amp, col, seed) in enumerate(((hz - 70, 150, "#34465A", 11), (hz - 35, 95, "#2A394B", 12), (hz - 8, 45, "#212E3D", 13))):
        top = ridge(H, W, base, amp, 0.38 - k * 0.08, seed)
        yy = np.arange(H)[:, None]
        m = (yy > top[None, :]) & (yy < hz + 6)
        haze = np.clip((yy - top[None, :]) / (hz - top[None, :] + 1), 0, 1) ** 1.4
        c = hexbgr(col) * (1 - haze[..., None] * 0.55) + hexbgr("#5D6F79") * haze[..., None] * 0.55
        sky = np.where(m[..., None], c, sky)
    # ---- the lake (mirror of the sky, broken by ripples)
    water = np.zeros_like(sky)
    for y in range(hz, H):
        d = (y - hz) / (H - hz)
        sy = int(hz - (y - hz) * 0.85)
        sy = max(0, sy)
        shift = (np.sin(np.arange(W) * 0.013 + y * 0.31) * 6 + np.sin(np.arange(W) * 0.047 - y * 0.6) * 3) * (0.4 + d * 2.2)
        xs = np.clip((np.arange(W) + shift).astype(int), 0, W - 1)
        water[y] = sky[sy, xs] * (0.72 - d * 0.32)
    rip = fbm(H, W, 60, 4, 21)
    streak = np.clip((cv2.resize(fbm(H, W // 10, 14, 3, 22), (W, H)) - 0.6) * 5, 0, 1)
    yy = np.arange(H)[:, None]
    wmask = (yy >= hz).astype(np.float32)
    water = water * (0.9 + 0.2 * rip[..., None])
    water += hexbgr("#C79A6C") * (streak * np.clip(1 - np.abs(np.arange(W)[None, :] - 2080) / 700, 0, 1) * np.clip(1 - (yy - hz) / 260, 0, 1))[..., None] * 0.35
    # warm reflection of the lamp
    lamp_x = 1890
    refl = np.clip(1 - np.abs(np.arange(W)[None, :] - lamp_x) / 34, 0, 1) * np.clip((yy - 1300) / 40, 0, 1) * np.clip(1 - (yy - 1300) / 160, 0, 1)
    refl = np.clip(1 - np.abs(np.arange(W)[None, :] - lamp_x - 40) / np.maximum(1, 40 + (yy - 1300) * 0.4), 0, 1) * np.clip((yy - 1296) / 30, 0, 1)
    refl = refl * np.clip((cv2.resize(fbm(H, W // 12, 10, 3, 23), (W, H)) - 0.42) * 4, 0, 1)
    water += hexbgr("#F0BE7E") * (refl * 0.75)[..., None]
    # dark reflections of the pier's posts
    for px in list(range(120, 1985, 330)) + [1945]:
        pr = np.clip(1 - np.abs(np.arange(W)[None, :] - px) / 22, 0, 1) * (yy > 1300)
        water = water * (1 - (pr * 0.5)[..., None])
    far = sky * (1 - wmask[..., None]) + water * wmask[..., None]
    # mist hugging the water at the horizon
    mist_band = np.exp(-(((yy - (hz + 12)) / 26.0) ** 2)) * (0.55 + 0.45 * fbm(H, W, 300, 4, 24))
    far = far * (1 - mist_band[..., None] * 0.6) + hexbgr("#7D8C93") * mist_band[..., None] * 0.6
    p = stroke_paint(far, seed=1, flow_bias=(1.0, 0.0), bias_w=0.55)
    save("s1_far.png", finish(p, 1))

    # ---- drifting mist layer (alpha)
    m = fbm(H, W * 2 // 2, 380, 6, 31)
    band = np.exp(-(((yy - (hz + 40)) / 90.0) ** 2))
    a = np.clip((m - 0.42) * 2.2, 0, 1) * band * 0.55
    col = np.full((H, W, 3), hexbgr("#8E9CA3"), np.float32)
    save("s1_mist.png", cv2.GaussianBlur(col, (0, 0), 1).astype(np.uint8), cv2.GaussianBlur(a, (0, 0), 6))

    # ---- the pier (deck, posts, lamp) — alpha layer
    pier = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    end_x = 1985
    deck_far, deck_near, beam = 1096, 1250, 1318
    xx = np.arange(W)[None, :]
    rs = np.random.default_rng(42)
    grain = cv2.resize(fbm(H, W // 6, 12, 4, 41), (W, H))
    wood = fbm(H, W, 30, 4, 41)
    # planks run along the pier; each plank its own weathered value
    plank_h = 15
    plank_idx = ((yy - deck_far) // plank_h).astype(int)
    plank_val = rs.uniform(0.78, 1.12, 64)
    pv = plank_val[np.clip(plank_idx, 0, 63)]
    deck_col = hexbgr("#2F2822") * (pv * (0.82 + 0.3 * grain))[..., None]
    seams = (((yy - deck_far) % plank_h) < 2).astype(np.float32)
    deck_col = deck_col * (1 - seams[..., None] * 0.45)
    end_at = end_x - (yy - deck_far) * 0.10
    deck_m = (yy >= deck_far) & (yy < deck_near) & (xx < end_at)
    pier = np.where(deck_m[..., None], deck_col, pier)
    alpha = np.where(deck_m, 1, alpha)
    beam_m = (yy >= deck_near) & (yy < beam) & (xx < end_x - 16)
    pier = np.where(beam_m[..., None], hexbgr("#1A1613") * (0.8 + 0.35 * wood[..., None]), pier)
    alpha = np.where(beam_m, 1, alpha)
    # top edge highlight on the beam, catching sky light
    hl = (yy >= deck_near) & (yy < deck_near + 3) & (xx < end_x - 16)
    pier = np.where(hl[..., None], hexbgr("#4C4A4C"), pier)
    for px in list(range(120, end_x, 330)) + [end_x - 40]:
        post = (xx >= px - 17) & (xx <= px + 17) & (yy >= beam - 4) & (yy < H)
        pier = np.where(post[..., None], hexbgr("#16120F") * (0.8 + 0.4 * grain[..., None]), pier)
        alpha = np.where(post, 1, alpha)
        if px < end_x - 100:
            b2 = (xx >= px - 9) & (xx <= px + 9) & (yy >= deck_far - 58) & (yy < deck_far + 6)
            pier = np.where(b2[..., None], hexbgr("#241E1A"), pier)
            alpha = np.where(b2, 1, alpha)
    for i in range(0, end_x - 400, 330):
        x0, x1 = 120 + i, 120 + i + 330
        xs = np.arange(x0, x1)
        ys = deck_far - 48 + 15 * np.sin(np.pi * (xs - x0) / (x1 - x0))
        for x, y in zip(xs, ys):
            pier[int(y) : int(y) + 3, x] = hexbgr("#3E352E")
            alpha[int(y) : int(y) + 3, x] = 1
    # lamplight pooling on the planks near the end (warm, restrained)
    pool = np.exp(-(((xx - 1840) / 430.0) ** 2 + ((yy - 1160) / 95.0) ** 2))
    pier = pier * (1 + 0.95 * (pool * deck_m)[..., None]) + hexbgr("#8A6242") * (pool * 0.28 * deck_m)[..., None]
    # lamp post
    post = (xx >= lamp_x - 9) & (xx <= lamp_x + 9) & (yy >= 300) & (yy < deck_far + 30)
    pier = np.where(post[..., None], hexbgr("#16181D"), pier)
    alpha = np.where(post, 1, alpha)
    arm = (xx >= lamp_x - 9) & (xx <= lamp_x + 70) & (yy >= 300) & (yy < 314)
    pier = np.where(arm[..., None], hexbgr("#16181D"), pier)
    alpha = np.where(arm, 1, alpha)
    # lantern: dark frame + glowing glass
    lx, ly = lamp_x + 58, 330
    frame = (np.abs(xx - lx) <= 26) & (yy >= ly) & (yy <= ly + 70)
    glass = (np.abs(xx - lx) <= 19) & (yy >= ly + 8) & (yy <= ly + 62)
    pier = np.where(frame[..., None], hexbgr("#121418"), pier)
    pier = np.where(glass[..., None], hexbgr("#FFE2A6"), pier)
    alpha = np.where(frame, 1, alpha)
    pier = extend(pier, alpha)
    pp = stroke_paint(pier, radii=(14, 7, 4, 2), seed=3, flow_bias=(1.0, 0.0), bias_w=0.5, alpha=alpha)
    a2 = cv2.GaussianBlur(alpha, (0, 0), 0.8)
    save("s1_pier.png", finish(pp, 3), a2)

    # ---- lamp glow (additive layer, animated flicker in the film)
    g = np.zeros((H, W), np.float32)
    g += np.exp(-(((xx - lx) / 260.0) ** 2 + ((yy - (ly + 35)) / 260.0) ** 2)) * 0.75
    g += np.exp(-(((xx - lx) / 50.0) ** 2 + ((yy - (ly + 35)) / 50.0) ** 2)) * 0.9
    col = np.full((H, W, 3), hexbgr("#FFD08A"), np.float32)
    save("s1_glow.png", col.astype(np.uint8), np.clip(g, 0, 1))

    # ---- foreground mooring post + rope (near, will be defocused)
    fg = np.zeros((H, W, 3), np.float32)
    fa = np.zeros((H, W), np.float32)
    m1 = (xx >= 40) & (xx <= 250) & (yy >= 930)
    fg = np.where(m1[..., None], hexbgr("#141110") * (0.8 + 0.5 * wood[..., None]), fg)
    fa = np.where(m1, 1, fa)
    cap = ((xx - 145) / 112.0) ** 2 + ((yy - 935) / 26.0) ** 2 <= 1
    fg = np.where(cap[..., None], hexbgr("#2C2520"), fg)
    fa = np.where(cap, 1, fa)
    for k in range(5):
        ring = (np.abs(((xx - 145) / 120.0) ** 2 + ((yy - (1060 + k * 34)) / 22.0) ** 2 - 1) < 0.18) & (xx > 20) & (xx < 270)
        fg = np.where(ring[..., None], hexbgr("#5C4E3E"), fg)
        fa = np.where(ring, 1, fa)
    fg = extend(fg, fa)
    fp = stroke_paint(fg, radii=(10, 5, 3), seed=5, flow_bias=(0.0, 1.0), bias_w=0.4, alpha=fa)
    save("s1_fg.png", finish(fp, 5), cv2.GaussianBlur(fa, (0, 0), 1.0))


# ================================================================================ SHOT 2
def shot2():
    hz = 430
    sky = vgrad([(0, "#0F1727"), (0.18, "#1D2B42"), (0.28, "#33465C"), (0.3, "#566874"), (1, "#566874")])
    sky = glow(sky, 1900, hz, 1100, 170, "#A87C58", 0.45)
    clouds = fbm(H, W, 380, 6, 51)
    cl = np.clip((clouds - 0.52) * 3, 0, 1) * np.clip(1 - np.abs(np.linspace(0, 1, H)[:, None] - 0.12) / 0.12, 0, 1)
    sky = sky * (1 - cl[..., None] * 0.4) + hexbgr("#0E1420") * cl[..., None] * 0.4
    yy = np.arange(H)[:, None]
    xx = np.arange(W)[None, :]
    for k, (base, amp, col, seed) in enumerate(((hz - 40, 90, "#33445A", 52), (hz - 16, 50, "#273648", 53))):
        top = ridge(H, W, base, amp, 0.33, seed)
        m = (yy > top[None, :]) & (yy < hz + 4)
        haze = np.clip((yy - top[None, :]) / (hz - top[None, :] + 1), 0, 1) ** 1.3
        c = hexbgr(col) * (1 - haze[..., None] * 0.6) + hexbgr("#5D6F79") * haze[..., None] * 0.6
        sky = np.where(m[..., None], c, sky)
    water = np.zeros_like(sky)
    for y in range(hz, H):
        d = (y - hz) / (H - hz)
        sy = max(0, int(hz - (y - hz) * 0.5))
        shift = (np.sin(np.arange(W) * 0.009 + y * 0.12) * 8 + np.sin(np.arange(W) * 0.03 - y * 0.25) * 4) * (0.3 + d * 2.5)
        xs = np.clip((np.arange(W) + shift).astype(int), 0, W - 1)
        water[y] = sky[sy, xs] * (0.7 - d * 0.42)
    rip = fbm(H, W, 80, 4, 54)
    water = water * (0.9 + 0.2 * rip[..., None])
    vx, vy = 1280, 600  # far end of the pier
    # lamp reflection streak running toward camera on the right of the pier
    refl = np.clip(1 - np.abs(xx - (vx + 46 + (yy - vy) * 0.05)) / (6 + np.abs(yy - vy) * 0.06), 0, 1) * (yy > vy + 10) * np.clip(1 - (yy - vy) / 520, 0, 1)
    refl = refl * np.clip((cv2.resize(fbm(H, W // 12, 10, 3, 55), (W, H)) - 0.42) * 4, 0, 1)
    water += hexbgr("#E8B577") * (refl * 0.8)[..., None]
    # the pier's dark reflection under both edges
    tt = np.clip((yy - vy) / (H + 40 - vy), 0, 1)
    hw = 22 + tt * (1040 / 2 - 22)  # half-width follows the deck
    cx = vx + tt * ((760 + 1800) / 2 - vx)
    dd = np.abs(xx - cx) - hw
    pr = np.exp(-np.clip(dd, 0, None) / (6 + tt * 60)) * (dd > -8) * (yy > vy)
    water = water * (1 - 0.45 * pr[..., None])
    wmask = (yy >= hz).astype(np.float32)
    far = sky * (1 - wmask[..., None]) + water * wmask[..., None]
    mist_band = np.exp(-(((yy - (hz + 10)) / 22.0) ** 2)) * (0.6 + 0.4 * fbm(H, W, 300, 4, 56))
    far = far * (1 - mist_band[..., None] * 0.65) + hexbgr("#7A8990") * mist_band[..., None] * 0.65
    p = stroke_paint(far, seed=7, flow_bias=(1.0, 0.0), bias_w=0.55)
    save("s2_far.png", finish(p, 7))

    # mist banks drifting across the middle distance
    m = cv2.resize(fbm(H, W // 5, 140, 5, 61), (W, H))
    band = np.exp(-(((yy - 520) / 60.0) ** 2)) * 0.9 + 0.45 * np.exp(-(((yy - 760) / 70.0) ** 2))
    a = np.clip((m - 0.4) * 2.2, 0, 1) * band * 0.5
    save("s2_mist.png", np.full((H, W, 3), hexbgr("#8C99A0"), np.uint8), cv2.GaussianBlur(a, (0, 0), 8))

    # the long pier in perspective, bottom-centre → far end
    pier = np.zeros((H, W, 3), np.float32)
    alpha = np.zeros((H, W), np.float32)
    bot_y, bot_l, bot_r = H + 40, 760, 1800
    far_l, far_r = vx - 22, vx + 22

    def edge(t):  # t: 0 = far end, 1 = bottom (perspective-correct interpolation)
        z = 1 / (1 + t * 22)
        tt = (1 - z) / (1 - 1 / 23)
        return vy + (bot_y - vy) * tt, far_l + (bot_l - far_l) * tt, far_r + (bot_r - far_r) * tt

    pts_l = [(edge(t)[1], edge(t)[0]) for t in np.linspace(0, 1, 200)]
    pts_r = [(edge(t)[2], edge(t)[0]) for t in np.linspace(1, 0, 200)]
    poly = np.array(pts_l + pts_r, np.int32)
    dm = np.zeros((H, W), np.uint8)
    cv2.fillPoly(dm, [poly], 255, lineType=cv2.LINE_AA)
    deck = dm.astype(np.float32) / 255
    wood = fbm(H, W, 26, 4, 62)
    grain = cv2.resize(fbm(H // 6, W, 10, 3, 63), (W, H))
    pier = hexbgr("#2E2721") * (0.78 + 0.32 * grain[..., None]) * (0.85 + 0.25 * wood[..., None]) * np.ones((H, W, 1), np.float32)
    # boards run lengthwise, converging on him: each board its own weathered value, fine seams between
    rs2 = np.random.default_rng(64)
    tt = np.clip((yy - vy) / (bot_y - vy), 0, 1).astype(np.float32)
    zz = 1 / (23 - 22 * tt)  # inverse of edge()'s perspective mapping → depth-correct u across the deck
    tpar = (1 / np.maximum(zz, 1e-6) - 1) / 22
    yt, lt, rt = edge(0)[0], 0, 0
    L = far_l + (bot_l - far_l) * tt
    Rr = far_r + (bot_r - far_r) * tt
    u = np.clip((xx - L) / np.maximum(1e-3, Rr - L), 0, 1)
    nb = 13
    bi = np.minimum((u * nb).astype(int), nb - 1)
    bval = rs2.uniform(0.84, 1.12, nb)
    pier = pier * bval[bi][..., None]
    fu = (u * nb) % 1.0
    seam_w = 0.03 + 0.05 * (1 - tt)  # seams stay visible into the distance
    seam = np.clip(1 - np.minimum(fu, 1 - fu) / seam_w, 0, 1)
    pier = pier * (1 - 0.35 * seam[..., None])
    # staggered butt joints across individual boards
    for k in range(nb):
        for t in np.sort(rs2.uniform(0.05, 1, 9)):
            y, l, r = edge(t)
            x0 = l + (r - l) * k / nb
            x1 = l + (r - l) * (k + 1) / nb
            if 0 <= int(y) < H:
                th = max(1, int(1 + (y - vy) * 0.004))
                pier[int(y) : int(y) + th, int(x0) + 1 : int(x1)] *= 0.72
    # the side beams: continuous lines, thickening toward the camera
    for t0, t1 in zip(np.linspace(0, 1, 120)[:-1], np.linspace(0, 1, 120)[1:]):
        y0, l0, r0 = edge(t0)
        y1, l1, r1 = edge(t1)
        w2 = max(2, int(2 + (y1 - vy) * 0.016))
        for a0, a1 in ((l0, l1), (r0, r1)):
            cv2.line(pier, (int(a0), int(y0)), (int(a1), int(y1)), tuple(float(c) for c in hexbgr("#1A1512")), w2, cv2.LINE_AA)
    # the pier's side face (fascia): one smooth polygon per side
    fascia = np.zeros((H, W), np.uint8)
    T = np.linspace(0, 1, 240)
    for side in (1, 2):
        top = [(edge(t)[side], edge(t)[0]) for t in T]
        bot = [(edge(t)[side], edge(t)[0] + 3 + (edge(t)[0] - vy) * 0.045) for t in T[::-1]]
        cv2.fillPoly(fascia, [np.array(top + bot, np.int32)], 255, lineType=cv2.LINE_AA)
    fm = cv2.GaussianBlur(fascia.astype(np.float32) / 255, (0, 0), 0.8)
    pier = pier * (1 - fm[..., None]) + hexbgr("#15110E") * (0.8 + 0.4 * grain[..., None]) * fm[..., None]
    deck = np.maximum(deck, fm)
    alpha = deck.copy()
    # light pool at the far end
    pool = np.exp(-(((xx - vx) / 90.0) ** 2 + ((yy - vy - 14) / 40.0) ** 2))
    pier = pier * (1 + 2.4 * pool[..., None]) + hexbgr("#B5845A") * (pool * 0.4)[..., None]
    # posts along both edges
    for t in np.linspace(0.02, 1, 18):
        y, l, r = edge(t)
        hgt = 6 + (y - vy) * 0.1
        w2 = max(1, int(1 + (y - vy) * 0.012))
        for x in (l, r):
            m2 = (np.abs(xx - x) <= w2) & (yy >= y) & (yy < y + hgt)
            pier = np.where(m2[..., None], hexbgr("#17130F"), pier)
            alpha = np.where(m2, 1, alpha)
    # the lamp at the end
    post = (np.abs(xx - (vx + 18)) <= 2) & (yy >= vy - 92) & (yy < vy + 2)
    pier = np.where(post[..., None], hexbgr("#121418"), pier)
    alpha = np.where(post, 1, alpha)
    glass = (np.abs(xx - (vx + 18)) <= 4) & (yy >= vy - 100) & (yy <= vy - 88)
    pier = np.where(glass[..., None], hexbgr("#FFE2A6"), pier)
    alpha = np.where(glass, 1, alpha)
    pier = extend(pier, alpha)
    pp = stroke_paint(pier, radii=(10, 5, 3, 2), seed=9, flow_bias=(1.0, 0.0), bias_w=0.5, alpha=alpha)
    save("s2_pier.png", finish(pp, 9), cv2.GaussianBlur(alpha, (0, 0), 0.7))

    g = np.exp(-(((xx - (vx + 18)) / 150.0) ** 2 + ((yy - (vy - 94)) / 150.0) ** 2)) * 0.7 + np.exp(-(((xx - (vx + 18)) / 18.0) ** 2 + ((yy - (vy - 94)) / 18.0) ** 2)) * 0.9
    save("s2_glow.png", np.full((H, W, 3), hexbgr("#FFD08A"), np.uint8), np.clip(g, 0, 1))

    # shore reeds framing the bottom corners (near, defocused)
    fg = np.zeros((H, W, 3), np.float32)
    fa = np.zeros((H, W), np.float32)
    rng = np.random.default_rng(71)
    for side in (0, 1):
        for _ in range(150):
            bx = rng.uniform(-40, 560) if side == 0 else rng.uniform(W - 600, W + 40)
            hgt = rng.uniform(220, 520)
            lean = rng.uniform(-0.25, 0.25) + (0.12 if side == 0 else -0.12)
            pts = np.array([[bx, H + 10], [bx + lean * hgt * 0.5, H - hgt * 0.55], [bx + lean * hgt, H - hgt]], np.int32)
            cv2.polylines(fg, [pts], False, tuple(float(v) for v in hexbgr("#151A20") * rng.uniform(0.7, 1.6)), thickness=int(rng.uniform(3, 8)), lineType=cv2.LINE_AA)
            if rng.random() < 0.35:
                tip = (int(bx + lean * hgt), int(H - hgt))
                cv2.ellipse(fg, tip, (int(rng.uniform(4, 7)), int(rng.uniform(16, 26))), float(np.degrees(lean)), 0, 360, tuple(float(v) for v in hexbgr("#2A2722")), -1, cv2.LINE_AA)
                cv2.ellipse(fa, tip, (int(rng.uniform(4, 7)), int(rng.uniform(16, 26))), float(np.degrees(lean)), 0, 360, 1.0, -1, cv2.LINE_AA)
            cv2.polylines(fa, [pts], False, 1.0, thickness=int(rng.uniform(3, 8)), lineType=cv2.LINE_AA)
    save("s2_fg.png", fg.astype(np.uint8), np.clip(fa, 0, 1))


if __name__ == "__main__":
    import sys

    which = sys.argv[1:] or ["1", "2"]
    if "1" in which:
        shot1()
    if "2" in which:
        shot2()
