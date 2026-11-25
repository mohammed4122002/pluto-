"""Generate the reusable texture library for Deeply Rooted.

Deterministic (fixed seeds) so every render of the project looks identical.
Outputs PNGs into public/textures/. Run:  python3 scripts/generate_textures.py

Textures
  fog_bank_{0,1,2}.png   horizontally tileable fog banks (white, alpha = density)
  fog_wisp_{0,1}.png     thinner, more detailed drifting wisps (tileable)
  grain_{0..5}.png       film grain tiles (mid-gray, used with soft-light blending)
  paper.png              aged map paper (ivory, fibres, foxing, stains)
  brush.png              directional painterly stroke texture (gray, multiply/overlay)
  sky_clouds.png         soft horizontally streaked pre-dawn cloud field (alpha)
"""
from __future__ import annotations

import os
import numpy as np
from PIL import Image, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "textures")
os.makedirs(OUT, exist_ok=True)


def value_noise(h: int, w: int, cells_y: int, cells_x: int, rng: np.random.Generator, tile_x: bool) -> np.ndarray:
    """Smooth value noise in [0,1]. If tile_x, the result wraps seamlessly left/right."""
    grid = rng.random((cells_y + 1, cells_x)).astype(np.float32)
    if tile_x:
        tiled = np.concatenate([grid, grid, grid], axis=1)
        img = Image.fromarray((tiled * 65535).astype(np.uint16).astype(np.int32), mode="I")
        img = img.resize((w * 3, h), Image.BICUBIC)
        arr = np.asarray(img, dtype=np.float32)[:, w : 2 * w] / 65535.0
    else:
        img = Image.fromarray((grid * 65535).astype(np.uint16).astype(np.int32), mode="I")
        arr = np.asarray(img.resize((w, h), Image.BICUBIC), dtype=np.float32) / 65535.0
    return np.clip(arr, 0, 1)


def fbm(h: int, w: int, base_y: int, base_x: int, octaves: int, seed: int, tile_x: bool = True, gain: float = 0.5) -> np.ndarray:
    rng = np.random.default_rng(seed)
    total = np.zeros((h, w), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        cy, cx = base_y * 2 ** o, base_x * 2 ** o
        total += amp * value_noise(h, w, min(cy, h // 2), min(cx, w // 2), rng, tile_x)
        norm += amp
        amp *= gain
    return total / norm


def smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def save_rgba(name: str, alpha: np.ndarray, rgb=(255, 255, 255)) -> None:
    h, w = alpha.shape
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 0], out[..., 1], out[..., 2] = rgb
    out[..., 3] = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(out, "RGBA").save(os.path.join(OUT, name), optimize=True)
    print("wrote", name)


def fog_bank(seed: int, w=2048, h=640, softness=0.55, height=0.62) -> np.ndarray:
    n = fbm(h, w, 2, 5, 6, seed)
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    # dense at the bottom, ragged billowing top edge
    top = 1 - height + (n - 0.5) * 0.55
    body = smoothstep(top - 0.08, top + softness * 0.5, y)
    # long soft foot so a bank melts into the ground instead of ending on a line
    bottom_fade = 1 - smoothstep(0.55, 1.0, y) ** 1.6
    alpha = body * bottom_fade * (0.55 + 0.45 * n)
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3)), np.float32) / 255
    return alpha


def fog_wisp(seed: int, w=2048, h=512) -> np.ndarray:
    n = fbm(h, w, 3, 9, 7, seed)
    stretch = fbm(h, w, 2, 3, 3, seed + 99)
    y = np.linspace(-1, 1, h, dtype=np.float32)[:, None]
    band = np.exp(-(y * 2.2) ** 2)
    alpha = smoothstep(0.42, 0.78, n * 0.75 + stretch * 0.35) * band
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), np.float32) / 255
    return alpha


def grain(seed: int, size=1024) -> None:
    rng = np.random.default_rng(seed)
    g = rng.normal(0.5, 0.16, (size, size)).astype(np.float32)
    # slight clumping like film emulsion
    img = Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    arr = np.asarray(img, np.float32) / 255
    arr = 0.5 + (arr - 0.5) * 1.8
    Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "L").save(os.path.join(OUT, f"grain_{seed}.png"), optimize=True)
    print(f"wrote grain_{seed}.png")


def paper(w=2400, h=1600) -> None:
    base = np.array([239, 231, 214], np.float32)  # warm ivory map paper
    blot = fbm(h, w, 3, 4, 6, 11, tile_x=False)
    fine = fbm(h, w, 40, 60, 3, 12, tile_x=False)
    rng = np.random.default_rng(13)
    tone = (blot - 0.5) * 26 + (fine - 0.5) * 10
    img = base[None, None, :] + tone[..., None] * np.array([1.0, 1.0, 1.15])[None, None, :]
    # foxing / age stains (warm brown spots)
    for _ in range(26):
        cy, cx = rng.integers(0, h), rng.integers(0, w)
        r = rng.uniform(8, 70)
        yy, xx = np.ogrid[:h, :w]
        d = np.sqrt((yy - cy) ** 2 + (xx - cx) ** 2) / r
        s = np.exp(-d ** 2) * rng.uniform(6, 20)
        img -= s[..., None] * np.array([0.6, 0.9, 1.5])[None, None, :]
    # paper fibres
    fib = np.zeros((h, w), np.float32)
    for _ in range(2600):
        y0, x0 = rng.uniform(0, h), rng.uniform(0, w)
        ang = rng.uniform(0, np.pi)
        ln = rng.uniform(6, 30)
        for t in np.linspace(0, 1, int(ln)):
            yy, xx = int(y0 + np.sin(ang) * ln * t), int(x0 + np.cos(ang) * ln * t)
            if 0 <= yy < h and 0 <= xx < w:
                fib[yy, xx] += 1
    fib = np.asarray(Image.fromarray((np.clip(fib, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)), np.float32) / 255
    img -= fib[..., None] * 9
    # darker, worn edges
    yy = np.linspace(-1, 1, h)[:, None]
    xx = np.linspace(-1, 1, w)[None, :]
    edge = np.clip(np.maximum(np.abs(xx) ** 8, np.abs(yy) ** 8), 0, 1)
    img -= edge[..., None] * np.array([18, 24, 34])[None, None, :]
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB").save(os.path.join(OUT, "paper.jpg"), quality=92)
    print("wrote paper.jpg")


def brush(w=1600, h=1000) -> None:
    """Directional painterly strokes: anisotropic noise blurred along stroke direction."""
    rng = np.random.default_rng(21)
    big = int(np.ceil(np.hypot(w, h))) + 8
    oy, ox = (big - h) // 2, (big - w) // 2
    acc = np.zeros((h, w), np.float32)
    for angle, weight in ((8, 1.0), (-14, 0.7), (32, 0.45)):
        n = rng.random((big, big)).astype(np.float32)
        img = Image.fromarray((n * 255).astype(np.uint8))
        img = img.rotate(angle, resample=Image.BICUBIC, expand=False)
        # strong blur in x after rotation emulates bristle drag
        arr = np.asarray(img, np.float32) / 255
        k = 41
        kernel = np.ones(k, np.float32) / k
        arr = np.apply_along_axis(lambda r: np.convolve(r, kernel, mode="same"), 1, arr)
        img = Image.fromarray((arr * 255).astype(np.uint8)).rotate(-angle, resample=Image.BICUBIC)
        crop = np.asarray(img, np.float32)[oy : oy + h, ox : ox + w] / 255
        acc += weight * (crop - 0.5)
    low = fbm(h, w, 4, 6, 4, 22, tile_x=False) - 0.5
    acc = acc * 2.4 + low * 0.9
    acc = 0.5 + acc * 0.9
    Image.fromarray((np.clip(acc, 0, 1) * 255).astype(np.uint8), "L").save(os.path.join(OUT, "brush.png"), optimize=True)
    print("wrote brush.png")


def sky_clouds(w=2048, h=768) -> None:
    n = fbm(h, w, 3, 3, 6, 31)
    streak = fbm(h, w, 6, 1, 3, 32)
    alpha = smoothstep(0.5, 0.78, n * 0.7 + streak * 0.4)
    y = np.linspace(0, 1, h)[:, None]
    alpha *= smoothstep(0.0, 0.35, y) * (1 - smoothstep(0.75, 1.0, y))
    alpha = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5)), np.float32) / 255
    save_rgba("sky_clouds.png", alpha)


if __name__ == "__main__":
    for i, s in enumerate((101, 202, 303)):
        save_rgba(f"fog_bank_{i}.png", fog_bank(s, height=0.5 + 0.12 * i))
    for i, s in enumerate((404, 505)):
        save_rgba(f"fog_wisp_{i}.png", fog_wisp(s))
    for s in range(6):
        grain(s)
    paper()
    brush()
    sky_clouds()
