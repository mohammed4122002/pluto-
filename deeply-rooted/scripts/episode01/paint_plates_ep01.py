"""Deeply Rooted — Episode 01 painted plates (reuses the Pilot 01 painter: same under-painting → brush-stroke method).

New sets (the pilot's night lake plates are reused as they are):
  lake dawn   — dawn sky/lake + mist for the two pilot views (pier layers are reused, re-lit in the film)
  road        — side-view sky (dusk, dawn) + tileable hills / road / grass strips for tracking walks
  plain       — high wide plain with five winding paths (+ paths.json for placing walkers), dusk & dawn skies
  hill        — side view with an underground cut (tree + roots are drawn in code), pre-dawn & morning skies
Output: public/plates/ep01/*.png (+ plain_paths.json).    python3 scripts/episode01/paint_plates_ep01.py [set ...]
"""
from __future__ import annotations

import importlib.util
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("pilot", os.path.join(HERE, "..", "pilot", "paint_plates_pilot01.py"))
P = importlib.util.module_from_spec(spec)
spec.loader.exec_module(P)  # helpers only (the pilot script paints nothing on import)
hexbgr, fbm, vgrad, glow, ridge, stroke_paint, finish, extend = P.hexbgr, P.fbm, P.vgrad, P.glow, P.ridge, P.stroke_paint, P.finish, P.extend
W, H = P.W, P.H
OUT = os.path.join(HERE, "..", "..", "public", "plates", "ep01")
os.makedirs(OUT, exist_ok=True)
YY = np.arange(H)[:, None].astype(np.float32)
XX = np.arange(W)[None, :].astype(np.float32)


def save(name, bgr, alpha=None):
    path = os.path.join(OUT, name)
    if alpha is None:
        cv2.imwrite(path, np.clip(bgr, 0, 255).astype(np.uint8))
    else:
        cv2.imwrite(path, np.dstack([np.clip(bgr, 0, 255).astype(np.uint8), (np.clip(alpha, 0, 1) * 255).astype(np.uint8)]))
    print("wrote", name, flush=True)


def tileable(img, alpha=None, ov=320):
    """Cross-fade the right edge into the left so the strip repeats seamlessly (width W - ov)."""
    w = np.linspace(0, 1, ov, dtype=np.float32)
    out = img[:, : W - ov].copy()
    out[:, :ov] = img[:, W - ov :] * (1 - w[None, :, None]) + img[:, :ov] * w[None, :, None]
    if alpha is None:
        return out, None
    a = alpha[:, : W - ov].copy()
    a[:, :ov] = alpha[:, W - ov :] * (1 - w[None, :]) + alpha[:, :ov] * w[None, :]
    return out, a


def sky(stops, sun=None, clouds=0.0, cloud_col="#0E1420", lit_col=None, seed=0, stars=0):
    s = vgrad(stops)
    if sun:
        x, y, rx, ry, col, a = sun
        s = glow(s, x, y, rx, ry, col, a)
        s = glow(s, x, y, rx * 0.3, ry * 0.35, "#FFF0D2", a * 0.7)
    if clouds:
        c = fbm(H, W, 420, 6, seed) * 0.7 + cv2.resize(fbm(H, W // 6, 160, 4, seed + 1), (W, H)) * 0.45
        cl = np.clip((c - 0.5) * 3.2, 0, 1) * np.clip(1 - np.abs(np.linspace(0, 1, H)[:, None] - 0.22) / 0.2, 0, 1) * clouds
        s = s * (1 - cl[..., None] * 0.5) + hexbgr(cloud_col) * cl[..., None] * 0.5
        if lit_col:
            under = np.roll(cl, 16, axis=0) - cl
            s = s + hexbgr(lit_col) * np.clip(under, 0, 1)[..., None] * 0.35
    rs = np.random.default_rng(seed + 7)
    for _ in range(stars):
        sx, sy = int(rs.uniform(0, W)), int(rs.uniform(0, H * 0.3))
        b = rs.uniform(0.2, 0.6)
        cv2.circle(s, (sx, sy), 1, tuple(float(v) for v in s[sy, sx] * (1 - b) + hexbgr("#E4E8EE") * b), -1, cv2.LINE_AA)
    return s


def ridges(img, hz, layers, haze_col):
    for base, amp, col, freq, seed in layers:
        top = ridge(H, W, base, amp, freq, seed)
        m = (YY > top[None, :]) & (YY < hz + 6)
        hz_ = np.clip((YY - top[None, :]) / (hz - top[None, :] + 1), 0, 1) ** 1.4
        c = hexbgr(col) * (1 - hz_[..., None] * 0.5) + hexbgr(haze_col) * hz_[..., None] * 0.5
        img = np.where(m[..., None], c, img)
    return img


def lake(img, hz, k=0.85, dark=0.72, fall=0.32, seed=21):
    water = np.zeros_like(img)
    for y in range(hz, H):
        d = (y - hz) / (H - hz)
        sy = max(0, int(hz - (y - hz) * k))
        shift = (np.sin(np.arange(W) * 0.013 + y * 0.31) * 6 + np.sin(np.arange(W) * 0.047 - y * 0.6) * 3) * (0.4 + d * 2.2)
        xs = np.clip((np.arange(W) + shift).astype(int), 0, W - 1)
        water[y] = img[sy, xs] * (dark - d * fall)
    water = water * (0.9 + 0.2 * fbm(H, W, 60, 4, seed)[..., None])
    wm = (YY >= hz).astype(np.float32)[..., None]
    return img * (1 - wm) + water * wm


def mist_band(img, hz, col, a=0.6, w=26, seed=24):
    mb = np.exp(-(((YY - (hz + 12)) / w) ** 2)) * (0.55 + 0.45 * fbm(H, W, 300, 4, seed))
    return img * (1 - mb[..., None] * a) + hexbgr(col) * mb[..., None] * a


def mist_layer(name, y0, spread, col, a, seed):
    m = fbm(H, W, 380, 6, seed)
    band = np.exp(-(((YY - y0) / spread) ** 2))
    al = np.clip((m - 0.42) * 2.2, 0, 1) * band * a
    save(name, cv2.GaussianBlur(np.full((H, W, 3), hexbgr(col), np.float32), (0, 0), 1), cv2.GaussianBlur(al, (0, 0), 6))


# ======================================================================= LAKE · DAWN (pilot views, new light)
def lake_dawn():
    # view 1 (medium, horizon 640) — sun about to rise behind the far right mountains
    hz = 640
    s = sky([(0, "#39466A"), (0.18, "#56618A"), (0.3, "#8E87A3"), (0.38, "#D29C8B"), (0.43, "#EDBB8C"), (0.47, "#F6D4A2"), (1, "#F6D4A2")],
            sun=(2050, hz - 12, 900, 240, "#FFD39A", 0.7), clouds=0.9, cloud_col="#6F6680", lit_col="#F2B48A", seed=101)
    s = ridges(s, hz, [(hz - 70, 150, "#6C6F8E", 0.38, 11), (hz - 35, 95, "#5B5E7C", 0.30, 12), (hz - 8, 45, "#4C4F69", 0.22, 13)], "#C9A7A0")
    f = lake(s, hz, dark=0.82, fall=0.3)
    for px in list(range(120, 1985, 330)) + [1945]:  # the pier's post reflections, as in the night plate
        pr = np.clip(1 - np.abs(XX - px) / 22, 0, 1) * (YY > 1300)
        f = f * (1 - (pr * 0.45)[..., None])
    f = mist_band(f, hz, "#E2C9B2", 0.55)
    save("lake1_dawn_far.png", finish(stroke_paint(f, seed=111, flow_bias=(1.0, 0.0), bias_w=0.55), 111))
    mist_layer("lake1_dawn_mist.png", hz + 40, 90, "#EAD5BF", 0.5, 131)
    # view 2 (high wide, horizon 430)
    hz = 430
    s = sky([(0, "#4A5578"), (0.18, "#7A7C9E"), (0.27, "#D3A08E"), (0.3, "#F2CE9E"), (1, "#F2CE9E")],
            sun=(1900, hz - 6, 1000, 170, "#FFD69C", 0.75), clouds=0.8, cloud_col="#7E7590", lit_col="#F3B98E", seed=102)
    s = ridges(s, hz, [(hz - 40, 90, "#77789A", 0.33, 52), (hz - 16, 50, "#66698A", 0.3, 53)], "#D8B6A6")
    f = lake(s, hz, k=0.5, dark=0.85, fall=0.4)
    vx, vy = 1280, 600
    tt = np.clip((YY - vy) / (H + 40 - vy), 0, 1)
    hw = 22 + tt * (1040 / 2 - 22)
    cx = vx + tt * ((760 + 1800) / 2 - vx)
    dd = np.abs(XX - cx) - hw
    pr = np.exp(-np.clip(dd, 0, None) / (6 + tt * 60)) * (dd > -8) * (YY > vy)
    f = f * (1 - 0.4 * pr[..., None])
    f = mist_band(f, hz - 2, "#E6CDB6", 0.6, w=22)
    save("lake2_dawn_far.png", finish(stroke_paint(f, seed=112, flow_bias=(1.0, 0.0), bias_w=0.55), 112))
    m = cv2.resize(fbm(H, W // 5, 140, 5, 161), (W, H))
    band = np.exp(-(((YY - 520) / 60.0) ** 2)) * 0.9 + 0.45 * np.exp(-(((YY - 760) / 70.0) ** 2))
    save("lake2_dawn_mist.png", np.full((H, W, 3), hexbgr("#E9D4BE"), np.uint8), cv2.GaussianBlur(np.clip((m - 0.4) * 2.2, 0, 1) * band * 0.45, (0, 0), 8))


# ======================================================================= ROAD (side view, tracking walks)
ROAD_HZ = 760


def road():
    pal = {
        "dusk": dict(stops=[(0, "#1E2440"), (0.2, "#33395C"), (0.36, "#6A5A78"), (0.46, "#C28A74"), (0.53, "#E7AE7E"), (1, "#E7AE7E")],
                     sun=(1700, ROAD_HZ + 10, 1100, 200, "#F0A774", 0.6), cloud="#3E3A58", lit="#E39A78"),
        "dawn": dict(stops=[(0, "#5A6B90"), (0.2, "#8A95B2"), (0.36, "#C8B4B0"), (0.46, "#F1C9A0"), (0.53, "#F9DDB2"), (1, "#F9DDB2")],
                     sun=(900, ROAD_HZ - 30, 900, 260, "#FFE0A8", 0.8), cloud="#9C93A8", lit="#F6C79C"),
    }
    for k, p in pal.items():
        s = sky(p["stops"], sun=p["sun"], clouds=0.8, cloud_col=p["cloud"], lit_col=p["lit"], seed=201 if k == "dusk" else 202)
        haze = "#B48A8A" if k == "dusk" else "#E3C2AE"
        s = ridges(s, ROAD_HZ, [(ROAD_HZ - 60, 110, "#4E4C66" if k == "dusk" else "#8F8FA6", 0.35, 211), (ROAD_HZ - 25, 60, "#3E3D55" if k == "dusk" else "#7F7F98", 0.3, 212)], haze)
        save(f"road_sky_{k}.png", finish(stroke_paint(s, seed=221, flow_bias=(1.0, 0.0), bias_w=0.55), 221))
    # mid: rolling meadow with sparse trees (neutral light; graded per shot in the film), tileable
    top = ridge(H, W, ROAD_HZ - 10, 40, 0.4, 231)
    mid = np.zeros((H, W, 3), np.float32)
    a = (YY > top[None, :]).astype(np.float32)
    d = np.clip((YY - ROAD_HZ) / (1100 - ROAD_HZ), 0, 1)
    tex = fbm(H, W, 90, 5, 232)
    near, far = hexbgr("#4F5A3D"), hexbgr("#7E8679")  # atmospheric perspective: hazier and cooler toward the horizon
    mid = (far * (1 - d[..., None] ** 0.7) + near * d[..., None] ** 0.7) * (0.86 + 0.26 * tex[..., None])
    patches = cv2.resize(fbm(H // 8, W // 8, 30, 4, 235), (W, H))
    mid = mid * (0.88 + 0.24 * patches[..., None])
    rows = 0.5 + 0.5 * np.sin(YY * (0.18 + 0.25 * d) + 6 * fbm(H, W, 200, 3, 236))
    mid = mid * (1 - 0.05 * rows[..., None] * d[..., None])
    for hy in (800, 850, 930, 1030):  # hedgerows: darker, slightly wavy bands
        hb = np.exp(-(((YY - hy - 10 * np.sin(XX * 0.003 + hy)) / (3 + (hy - ROAD_HZ) * 0.03)) ** 2))
        hb = hb * np.clip((fbm(1, W, 160, 4, hy)[0][None, :] - 0.35) * 3, 0, 1)
        mid = mid * (1 - 0.3 * hb[..., None])
    rs = np.random.default_rng(233)
    for _ in range(7):  # distant trees: trunk + rounded canopy masses
        tx, ty = rs.uniform(100, W - 100), rs.uniform(ROAD_HZ + 10, ROAD_HZ + 60)
        sc = rs.uniform(0.6, 1.2)
        cv2.line(mid, (int(tx), int(ty)), (int(tx), int(ty - 70 * sc)), tuple(float(v) for v in hexbgr("#2E2A26")), max(2, int(5 * sc)), cv2.LINE_AA)
        cv2.line(a, (int(tx), int(ty)), (int(tx), int(ty - 70 * sc)), 1.0, max(2, int(5 * sc)), cv2.LINE_AA)
        for j in range(6):
            cx, cy = tx + rs.normal(0, 26 * sc), ty - 90 * sc + rs.normal(0, 18 * sc)
            r = int(rs.uniform(22, 38) * sc)
            cv2.circle(mid, (int(cx), int(cy)), r, tuple(float(v) for v in hexbgr("#3A4632") * rs.uniform(0.85, 1.15)), -1, cv2.LINE_AA)
            cv2.circle(a, (int(cx), int(cy)), r, 1.0, -1, cv2.LINE_AA)
    mid = extend(mid, a)
    mp = finish(stroke_paint(mid, radii=(12, 6, 3, 2), seed=234, flow_bias=(1.0, 0.0), bias_w=0.5, alpha=a), 234)
    mt, at = tileable(mp.astype(np.float32), cv2.GaussianBlur(a, (0, 0), 0.8))
    save("road_mid.png", mt, at)
    # ground: verge grass, dirt road with wheel ruts, lower verge — tileable
    g = np.zeros((H, W, 3), np.float32)
    edge_top = 1060 + 8 * np.sin(XX[0] * 0.011) + 6 * fbm(1, W, 120, 4, 241)[0]
    ag = (YY > edge_top[None, :]).astype(np.float32)
    grass = hexbgr("#4D5A38") * (0.8 + 0.4 * fbm(H, W, 18, 4, 242)[..., None])
    dirt = hexbgr("#8A765E") * (0.82 + 0.3 * fbm(H, W, 22, 4, 243)[..., None])
    road_m = ((YY > 1100) & (YY < 1212)).astype(np.float32)
    road_m = cv2.GaussianBlur(road_m, (0, 0), 3)
    g = grass * (1 - road_m[..., None]) + dirt * road_m[..., None]
    for ry in (1128, 1186):  # ruts
        rut = np.exp(-(((YY - ry) / 5.0) ** 2)) * road_m
        g = g * (1 - 0.25 * rut[..., None])
    rs = np.random.default_rng(244)
    for _ in range(260):  # pebbles on the road
        px, py = int(rs.uniform(0, W)), int(rs.uniform(1104, 1208))
        cv2.circle(g, (px, py), int(rs.uniform(1, 3)), tuple(float(v) for v in hexbgr("#A39079") * rs.uniform(0.8, 1.2)), -1, cv2.LINE_AA)
    for _ in range(900):  # grass blades along both verges
        bx = rs.uniform(0, W)
        by = rs.choice([rs.uniform(1062, 1104), rs.uniform(1214, 1440)])
        hgt = rs.uniform(10, 30) * (1 + (by - 1060) / 400)
        cv2.line(g, (int(bx), int(by)), (int(bx + rs.normal(0, 4)), int(by - hgt)), tuple(float(v) for v in hexbgr("#5F6E42") * rs.uniform(0.7, 1.3)), 2, cv2.LINE_AA)
    g = extend(g, ag)
    gp = finish(stroke_paint(g, radii=(8, 4, 2), seed=245, flow_bias=(1.0, 0.0), bias_w=0.45, alpha=ag), 245)
    gt, agt = tileable(gp.astype(np.float32), cv2.GaussianBlur(ag, (0, 0), 0.8))
    save("road_ground.png", gt, agt)
    # foreground grass tufts (defocused in the film), tileable
    fg = np.zeros((H, W, 3), np.float32)
    fa = np.zeros((H, W), np.float32)
    for _ in range(170):
        bx, hgt = rs.uniform(0, W), rs.uniform(120, 300)
        lean = rs.uniform(-0.3, 0.3)
        pts = np.array([[bx, H + 10], [bx + lean * hgt * 0.5, H - hgt * 0.55], [bx + lean * hgt, H - hgt]], np.int32)
        cv2.polylines(fg, [pts], False, tuple(float(v) for v in hexbgr("#2A3222") * rs.uniform(0.7, 1.4)), int(rs.uniform(3, 7)), cv2.LINE_AA)
        cv2.polylines(fa, [pts], False, 1.0, int(rs.uniform(3, 7)), cv2.LINE_AA)
    ft, fat = tileable(fg, fa)
    save("road_fg.png", ft, fat)


# ======================================================================= PLAIN (high wide, many paths)
PLAIN_HZ = 520


def plain():
    pal = {
        "dusk": ([(0, "#232845"), (0.16, "#4A4566"), (0.3, "#B98272"), (0.36, "#E2A57A"), (1, "#E2A57A")], (1500, PLAIN_HZ, 1100, 180, "#EFA172", 0.55), "#3F3A56", "#DF9878", "#9E7E82"),
        "dawn": ([(0, "#62729A"), (0.16, "#9AA2BC"), (0.3, "#EBC6A2"), (0.36, "#FADDB0"), (1, "#FADDB0")], (1100, PLAIN_HZ - 10, 1100, 200, "#FFE0A6", 0.8), "#A098AE", "#F4C79A", "#E1C2AE"),
    }
    for k, (stops, sun, cl, lit, haze) in pal.items():
        s = sky(stops, sun=sun, clouds=0.7, cloud_col=cl, lit_col=lit, seed=301 if k == "dusk" else 302)
        s = ridges(s, PLAIN_HZ, [(PLAIN_HZ - 50, 90, "#5A5670" if k == "dusk" else "#9192AA", 0.35, 311), (PLAIN_HZ - 20, 50, "#48465E" if k == "dusk" else "#82849E", 0.3, 312)], haze)
        save(f"plain_sky_{k}.png", finish(stroke_paint(s, seed=321, flow_bias=(1.0, 0.0), bias_w=0.55), 321))
    # ground: meadow in perspective + five winding paths (neutral light; graded per shot)
    d = np.clip((YY - PLAIN_HZ) / (H - PLAIN_HZ), 0, 1)
    tex = fbm(H, W, 40, 5, 331) * 0.6 + cv2.resize(fbm(H // 4, W, 30, 4, 332), (W, H)) * 0.4
    g = (hexbgr("#8D9483") * (1 - d[..., None] ** 0.6) + hexbgr("#4E5A39") * d[..., None] ** 0.6) * (0.84 + 0.28 * tex[..., None])
    patches = cv2.resize(fbm(H // 8, W // 8, 40, 4, 333), (W, H))
    g = g * (0.86 + 0.26 * patches[..., None])
    g = g * (1 - 0.25 * np.exp(-(((YY - PLAIN_HZ) / 30.0) ** 2))[..., None]) + hexbgr("#9FA294") * (0.25 * np.exp(-(((YY - PLAIN_HZ) / 30.0) ** 2)))[..., None]
    paths = []
    rs = np.random.default_rng(341)
    starts = [(260, 1440), (820, 1440), (1300, 1440), (1820, 1440), (2380, 1440)]
    ends = [(900, PLAIN_HZ + 8), (1150, PLAIN_HZ + 6), (1310, PLAIN_HZ + 5), (1480, PLAIN_HZ + 6), (1750, PLAIN_HZ + 8)]
    for i, ((x0, y0), (x1, y1)) in enumerate(zip(starts, ends)):
        n = 1600
        t = np.linspace(0, 1, n)
        z = 1 / (1 + t * 14)  # perspective: equal steps in depth bunch up toward the horizon
        tt = (1 - z) / (1 - 1 / 15)
        wob = np.sin(tt * np.pi * (2 + i % 2) + i) * 160 * (1 - tt) ** 1.2
        xs = x0 + (x1 - x0) * tt + wob
        ys = y0 + (y1 - y0) * tt
        ws = 42 * (1 - tt) ** 1.3 + 2
        paths.append([[float(a), float(b), float(c)] for a, b, c in zip(xs[::16], ys[::16], ws[::16])])
        pm = np.zeros((H, W), np.float32)
        for k in range(n - 1):  # continuous dirt band, perspective width
            cv2.line(pm, (int(xs[k]), int(ys[k])), (int(xs[k + 1]), int(ys[k + 1])), 1.0, max(1, int(ws[k])), cv2.LINE_AA)
        pm = cv2.GaussianBlur(pm, (0, 0), 1.2)
        dirt = hexbgr("#A6937A") * (0.85 + 0.25 * fbm(H, W, 14, 3, 350 + i)[..., None])
        g = g * (1 - pm[..., None]) + dirt * pm[..., None]
    rs2 = np.random.default_rng(342)
    for _ in range(55):  # shrub clumps for scale (perspective-sized)
        bx, by = rs2.uniform(0, W), rs2.uniform(PLAIN_HZ + 20, H - 60)
        sc = 2 + 22 * ((by - PLAIN_HZ) / (H - PLAIN_HZ)) ** 1.5
        for _k in range(5):
            cv2.circle(g, (int(bx + rs2.normal(0, sc * 0.6)), int(by + rs2.normal(0, sc * 0.25))), max(1, int(sc * rs2.uniform(0.4, 0.8))), tuple(float(v) for v in hexbgr("#46512F") * rs2.uniform(0.75, 1.1)), -1, cv2.LINE_AA)
    for _ in range(9):  # small trees near the horizon
        tx, ty = rs2.uniform(100, W - 100), PLAIN_HZ + rs2.uniform(4, 30)
        sc = 0.35 + (ty - PLAIN_HZ) / 60
        cv2.line(g, (int(tx), int(ty)), (int(tx), int(ty - 26 * sc)), tuple(float(v) for v in hexbgr("#3B3A35")), 2, cv2.LINE_AA)
        for _k in range(4):
            cv2.circle(g, (int(tx + rs2.normal(0, 8 * sc)), int(ty - 32 * sc + rs2.normal(0, 6 * sc))), max(2, int(11 * sc)), tuple(float(v) for v in hexbgr("#5A6452") * rs2.uniform(0.85, 1.1)), -1, cv2.LINE_AA)
    ag = ((YY >= PLAIN_HZ - 4) * np.ones((1, W))).astype(np.float32)
    g = extend(g, ag)
    save("plain_ground.png", finish(stroke_paint(g, radii=(12, 6, 3, 2), seed=343, flow_bias=(1.0, 0.0), bias_w=0.4, alpha=ag), 343), cv2.GaussianBlur(ag, (0, 0), 1))
    json.dump({"horizon": PLAIN_HZ, "paths": paths}, open(os.path.join(OUT, "plain_paths.json"), "w"))
    print("wrote plain_paths.json")
    fg = np.zeros((H, W, 3), np.float32)
    fa = np.zeros((H, W), np.float32)
    for side in (0, 1):
        for _ in range(120):
            bx = rs.uniform(-40, 520) if side == 0 else rs.uniform(W - 560, W + 40)
            hgt = rs.uniform(160, 380)
            lean = rs.uniform(-0.25, 0.25)
            pts = np.array([[bx, H + 10], [bx + lean * hgt * 0.5, H - hgt * 0.55], [bx + lean * hgt, H - hgt]], np.int32)
            cv2.polylines(fg, [pts], False, tuple(float(v) for v in hexbgr("#262D1E") * rs.uniform(0.7, 1.5)), int(rs.uniform(3, 7)), cv2.LINE_AA)
            cv2.polylines(fa, [pts], False, 1.0, int(rs.uniform(3, 7)), cv2.LINE_AA)
    save("plain_fg.png", fg, fa)


# ======================================================================= HILL (side view, underground cut)
HILL_CREST = (1450, 760)


def hill_surface():
    x = XX[0]
    cx, cy = HILL_CREST
    left = cy + 0.00011 * (x - cx) ** 2 * (x < cx)
    right = cy + 0.00016 * (x - cx) ** 2 * (x >= cx)
    return np.minimum(left + right - cy, 1150) + 6 * fbm(1, W, 90, 4, 401)[0]


def hill():
    hz = 820
    pal = {
        "predawn": ([(0, "#141B30"), (0.25, "#24304C"), (0.45, "#4C5470"), (0.56, "#8A7E8C"), (0.6, "#B69488"), (1, "#B69488")], (1900, hz, 1000, 160, "#C99884", 0.5), "#1C2236", None, 160),
        "dawn": ([(0, "#4E5C82"), (0.25, "#7F86A6"), (0.45, "#C9A9A6"), (0.56, "#F0C49A"), (0.6, "#F7D8A8"), (1, "#F7D8A8")], (1950, hz - 20, 1000, 220, "#FFD9A0", 0.8), "#8F86A0", "#F3BE92", 0),
        "morning": ([(0, "#6F8FB8"), (0.25, "#9DB4CF"), (0.45, "#D5DDE0"), (0.56, "#F3E6CC"), (0.6, "#F8EBCF"), (1, "#F8EBCF")], (2150, hz - 260, 900, 420, "#FFF1CF", 0.7), "#C9CFDA", "#FFFFFF", 0),
    }
    for k, (stops, sun, cl, lit, stars) in pal.items():
        s = sky(stops, sun=sun, clouds=0.7, cloud_col=cl, lit_col=lit, seed=410 + len(k), stars=stars)
        dark = {"predawn": ("#2E344A", "#262B3E", "#6A6676"), "dawn": ("#8586A0", "#76778F", "#D8B9AA"), "morning": ("#9AAAB8", "#8B9BAA", "#D9DEDC")}[k]
        s = ridges(s, hz, [(hz - 60, 100, dark[0], 0.35, 421), (hz - 25, 55, dark[1], 0.3, 422)], dark[2])
        save(f"hill_sky_{k}.png", finish(stroke_paint(s, seed=431, flow_bias=(1.0, 0.0), bias_w=0.55), 431))
    surf = hill_surface()
    a = (YY >= surf[None, :]).astype(np.float32)
    depth = np.clip((YY - surf[None, :]) / 500, 0, 1)
    soil = (hexbgr("#5A4632") * (1 - depth[..., None]) + hexbgr("#2E241B") * depth[..., None]) * (0.82 + 0.3 * fbm(H, W, 26, 5, 441)[..., None])
    for k2, sy in enumerate((120, 260, 420)):  # strata
        band = np.exp(-(((YY - surf[None, :] - sy - 20 * np.sin(XX * 0.004 + k2)) / 10.0) ** 2))
        soil = soil * (1 - 0.18 * band[..., None])
    rs = np.random.default_rng(442)
    for _ in range(80):  # stones in the soil
        sx = rs.uniform(0, W)
        sy = surf[int(sx) % W] + rs.uniform(40, 700)
        cv2.ellipse(soil, (int(sx), int(sy)), (int(rs.uniform(5, 18)), int(rs.uniform(4, 12))), rs.uniform(0, 180), 0, 360, tuple(float(v) for v in hexbgr("#615849") * rs.uniform(0.65, 0.95)), -1, cv2.LINE_AA)
    grass = np.clip(1 - (YY - surf[None, :]) / 26, 0, 1) * a
    soil = soil * (1 - grass[..., None]) + hexbgr("#4E5E36") * (0.8 + 0.4 * fbm(H, W, 10, 3, 443)[..., None]) * grass[..., None]
    for _ in range(700):  # grass blades on the surface
        bx = rs.uniform(0, W)
        by = surf[int(bx) % W] + 2
        hgt = rs.uniform(8, 22)
        cv2.line(soil, (int(bx), int(by)), (int(bx + rs.normal(0, 3)), int(by - hgt)), tuple(float(v) for v in hexbgr("#5D6F40") * rs.uniform(0.7, 1.3)), 2, cv2.LINE_AA)
        cv2.line(a, (int(bx), int(by)), (int(bx + rs.normal(0, 3)), int(by - hgt)), 1.0, 2, cv2.LINE_AA)
    # the cut face reads as a cross-section: a darker rim just under the grass line
    rim = np.exp(-(((YY - surf[None, :] - 34) / 8.0) ** 2)) * a
    soil = soil * (1 - 0.25 * rim[..., None])
    soil = extend(soil, a)
    save("hill_ground.png", finish(stroke_paint(soil, radii=(10, 5, 3, 2), seed=444, flow_bias=(1.0, 0.0), bias_w=0.4, alpha=a), 444), cv2.GaussianBlur(a, (0, 0), 0.8))
    json.dump({"crest": HILL_CREST, "surface": [float(v) for v in surf[::8]], "step": 8}, open(os.path.join(OUT, "hill_surface.json"), "w"))
    print("wrote hill_surface.json")


SETS = {"lake": lake_dawn, "road": road, "plain": plain, "hill": hill}
if __name__ == "__main__":
    for name in sys.argv[1:] or list(SETS):
        SETS[name]()
