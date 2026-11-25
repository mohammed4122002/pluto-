"""Deeply Rooted — procedural sound-effects library (Phase 01).

Every effect is synthesised from filtered noise, impulses and sine partials with fixed seeds, so the
library is reproducible and royalty-free. Writes 48 kHz / 16-bit stereo WAVs to public/audio/sfx/.

  python3 scripts/generate_sfx.py      (needs numpy + scipy)
"""
from __future__ import annotations

import os
import numpy as np
import scipy.signal as ss
from scipy.io import wavfile

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "sfx")
os.makedirs(OUT, exist_ok=True)


# ----------------------------------------------------------------------------- building blocks
def pink(n: int, rng) -> np.ndarray:
    X = rng.normal(size=n // 2 + 1) + 1j * rng.normal(size=n // 2 + 1)
    f = np.fft.rfftfreq(n, 1 / SR)
    f[0] = f[1]
    x = np.fft.irfft(X / np.sqrt(f), n)
    return x / (np.std(x) + 1e-12)


def white(n: int, rng) -> np.ndarray:
    return rng.normal(size=n)


def filt(x, kind: str, f, order=4):
    sos = ss.butter(order, f, btype=kind, fs=SR, output="sos")
    return ss.sosfilt(sos, x)


def peak_eq(x, f0, q, gain_db):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / SR
    alpha = np.sin(w0) / (2 * q)
    b = [1 + alpha * A, -2 * np.cos(w0), 1 - alpha * A]
    a = [1 + alpha / A, -2 * np.cos(w0), 1 - alpha / A]
    return ss.lfilter(b, a, x)


def slow(n: int, rate_hz: float, rng, smooth=True) -> np.ndarray:
    """Smooth random control signal in [0, 1] changing about `rate_hz` times per second."""
    k = max(4, int(n / SR * rate_hz) + 4)
    pts = rng.random(k)
    t = np.linspace(0, k - 3, n)
    i = np.floor(t).astype(int)
    u = t - i
    u = u * u * (3 - 2 * u) if smooth else u
    return pts[i] * (1 - u) + pts[i + 1] * u


def env(n: int, attack: float, release: float, shape=2.0) -> np.ndarray:
    t = np.arange(n) / SR
    dur = n / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1) ** shape
    r = np.clip((dur - t) / max(release, 1e-4), 0, 1) ** shape
    return a * r


def bell(n: int, peak: float = 0.5, width: float = 1.0) -> np.ndarray:
    t = np.linspace(0, 1, n)
    return np.exp(-(((t - peak) / (0.28 * width)) ** 2))


def reverb(x: np.ndarray, t60=1.2, mix=0.25, rng=None, predelay=0.012) -> np.ndarray:
    rng = rng or np.random.default_rng(99)
    n = int(SR * t60)
    ir = rng.normal(size=n) * np.exp(-6.9 * np.arange(n) / n)
    ir = filt(ir, "lowpass", 6000, 2)
    ir = np.concatenate([np.zeros(int(predelay * SR)), ir])
    ir /= np.sqrt(np.sum(ir**2)) + 1e-12
    wet = ss.fftconvolve(x, ir)[: len(x)]
    return (1 - mix) * x + mix * wet * 0.6


def crackle(n: int, rate, rng, lo=1500, hi=9000, decay=(0.002, 0.012)) -> np.ndarray:
    """Paper / gravel crackle: random micro-impulses of band-limited noise. `rate` may be an array (events/s)."""
    rate = np.broadcast_to(np.asarray(rate, float), (n,))
    out = np.zeros(n)
    p = rate / SR
    hits = np.nonzero(rng.random(n) < p)[0]
    for h in hits:
        d = rng.uniform(*decay)
        L = min(n - h, int(d * 6 * SR))
        if L < 8:
            continue
        burst = rng.normal(size=L) * np.exp(-np.arange(L) / (d * SR)) * (rng.pareto(2.5) + 0.3)
        out[h : h + L] += burst
    return filt(out, "bandpass", [lo, min(hi, SR / 2 - 100)], 2)


def chirp(dur: float, f0: float, f1: float, rng, harm=0.18) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f0 + (f1 - f0) * (t / dur) ** rng.uniform(0.6, 1.6)
    f = f * (1 + 0.012 * np.sin(2 * np.pi * rng.uniform(25, 45) * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    a = np.sin(np.pi * t / dur) ** 2
    return a * (np.sin(ph) + harm * np.sin(2 * ph))


def bird_phrase(rng, base=3200.0, notes=(2, 5), lively=False) -> np.ndarray:
    parts = []
    for _ in range(rng.integers(*notes)):
        d = rng.uniform(0.05, 0.13) if not lively else rng.uniform(0.035, 0.09)
        f0 = base * rng.uniform(0.85, 1.25)
        f1 = f0 * rng.uniform(0.8, 1.35)
        parts.append(chirp(d, f0, f1, rng))
        parts.append(np.zeros(int(rng.uniform(0.03, 0.11 if not lively else 0.06) * SR)))
    return np.concatenate(parts)


def place(buf: np.ndarray, sig: np.ndarray, at: float, gain=1.0):
    i = int(at * SR)
    L = min(len(sig), len(buf) - i)
    if L > 0:
        buf[i : i + L] += sig[:L] * gain


def pan(x: np.ndarray, p) -> np.ndarray:
    """Equal-power pan; p in [-1 (left), 1 (right)], scalar or per-sample array."""
    p = np.broadcast_to(np.asarray(p, float), x.shape)
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def write(name: str, x: np.ndarray, peak_db: float = -3.0, rms_db: float | None = None) -> None:
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    fade = int(0.004 * SR)
    x[:fade] *= np.linspace(0, 1, fade)[:, None]
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    if rms_db is not None:
        x = x * (10 ** (rms_db / 20) / (np.sqrt(np.mean(x**2)) + 1e-12))
    pk = np.max(np.abs(x)) + 1e-12
    lim = 10 ** (peak_db / 20)
    if rms_db is None or pk > lim:
        x = x * (lim / pk)
    wavfile.write(os.path.join(OUT, name), SR, (np.clip(x, -1, 1) * 32767).astype(np.int16))
    print(f"wrote {name}  {len(x) / SR:5.2f}s")


# ----------------------------------------------------------------------------- ambiences
def amb_dawn_wind(dur=46.0):
    rng = np.random.default_rng(1)
    n = int(dur * SR)
    common = pink(n, rng)
    ch = []
    for c in range(2):
        x = 0.75 * common + 0.66 * pink(n, rng)
        gust = slow(n, 0.14, rng) ** 1.6
        low = filt(x, "bandpass", [45, 260]) * (0.55 + 0.45 * slow(n, 0.06, rng))
        mid = filt(x, "bandpass", [260, 1300]) * (0.12 + 0.55 * gust)
        high = filt(x, "bandpass", [1300, 5200]) * (0.03 + 0.22 * gust**1.5)
        whistle = peak_eq(filt(x, "bandpass", [520, 760], 2), 640, 9, 12) * 0.04 * gust**2
        ch.append(low * 1.0 + mid * 0.8 + high * 0.6 + whistle)
    bed = np.stack(ch, axis=1)
    birds = np.zeros((n, 2))
    for t in (4.2, 11.5, 19.8, 27.3, 36.0, 42.5):
        ph = filt(bird_phrase(rng, base=rng.uniform(2600, 3600)), "lowpass", 5500, 2)
        ph = reverb(ph, 0.9, 0.55, rng)
        st = pan(ph, rng.uniform(-0.8, 0.8))
        i = int((t + rng.uniform(-1, 1)) * SR)
        birds[i : i + len(st)] += st[: max(0, n - i)]
    bed = bed / np.sqrt(np.mean(bed**2)) * 10 ** (-27 / 20)
    birds = birds / (np.max(np.abs(birds)) + 1e-9) * 10 ** (-30 / 20)
    write("amb_dawn_wind.wav", bed + birds, peak_db=-6, rms_db=-26)


def amb_meadow_warm(dur=16.0):
    rng = np.random.default_rng(2)
    n = int(dur * SR)
    out = []
    for c in range(2):
        x = pink(n, rng)
        gust = slow(n, 0.2, rng)
        breeze = filt(x, "bandpass", [180, 2400]) * (0.25 + 0.35 * gust)
        flick = slow(n, 22, rng, smooth=True)  # fast flicker of many small leaves
        leaves = filt(white(n, rng), "bandpass", [1600, 6000]) * (0.15 + 0.6 * gust**2) * (0.35 + 0.65 * flick) * 0.35
        leaves = filt(leaves, "lowpass", 6500, 2)
        out.append(breeze + leaves)
    bed = np.stack(out, axis=1)
    birds = np.zeros((n, 2))
    t = 0.4
    while t < dur - 1.5:
        ph = bird_phrase(rng, base=rng.uniform(3000, 5200), notes=(4, 10), lively=True)
        ph = reverb(filt(ph, "lowpass", 8000, 2), 0.6, 0.3, rng)
        st = pan(ph, rng.uniform(-0.7, 0.7))
        i = int(t * SR)
        birds[i : i + len(st)] += st[: max(0, n - i)] * rng.uniform(0.4, 1.0)
        t += rng.uniform(0.6, 1.6)
    bed = bed / np.sqrt(np.mean(bed**2)) * 10 ** (-28 / 20)
    birds = birds / (np.max(np.abs(birds)) + 1e-9) * 10 ** (-24 / 20)
    write("amb_meadow_warm.wav", bed + birds, peak_db=-6, rms_db=-25)


# ----------------------------------------------------------------------------- transitions
def whoosh(name, dur, seed, darker=False, pan_from=0.7, pan_to=-0.7):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    x = pink(n, rng)
    bands = [([60, 300], 0.42, 1.2), ([300, 1400], 0.5, 1.0), ([1400, 6000], 0.58, 0.8)]
    if darker:
        bands = [([50, 240], 0.45, 1.3), ([240, 1000], 0.52, 1.1), ([1000, 3800], 0.6, 0.9)]
    y = np.zeros(n)
    for (lo_hi, pk, w), g in zip(bands, (1.0, 0.75, 0.45 if not darker else 0.3)):
        y += filt(x, "bandpass", lo_hi) * bell(n, pk, w) * g
    y = reverb(y, 1.4, 0.35, rng)
    p = np.linspace(pan_from, pan_to, n)
    write(name, pan(y, p), peak_db=-8)


def shimmer_bloom(dur=5.5):
    rng = np.random.default_rng(7)
    n = int(dur * SR)
    t = np.arange(n) / SR
    air = filt(pink(n, rng), "bandpass", [2500, 11000]) * (np.clip(t / 1.8, 0, 1) ** 2) * np.exp(-np.clip(t - 1.8, 0, None) / 1.4)
    tones = np.zeros(n)
    partials = [587.33, 880.0, 1174.66, 1479.98, 1760.0, 2349.3]
    for k, f in enumerate(partials):
        start = 0.35 + 0.17 * k
        tt = np.clip(t - start, 0, None)
        a = (1 - np.exp(-tt / 0.35)) * np.exp(-tt / (2.6 - 0.2 * k)) * (t >= start)
        det = 1 + rng.uniform(-0.0015, 0.0015)
        tones += a * (np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * det * t + rng.uniform(0, 6))) * (0.9 ** k)
    y = air * 0.16 + tones * 0.11
    L = reverb(y, 2.8, 0.55, np.random.default_rng(71))
    R = reverb(y, 2.8, 0.55, np.random.default_rng(72))
    write("shimmer_bloom.wav", np.stack([L, R], axis=1), peak_db=-10)


# ----------------------------------------------------------------------------- foley
def paper(name, dur, seed, density, flap_at=None, snap=False, body=0.35, peak=-6):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    dens = np.interp(t, *density)
    cr = crackle(n, dens, rng, 1400, 9500, (0.0015, 0.009))
    slide = filt(white(n, rng), "bandpass", [400, 2600]) * np.interp(t, *density) / (max(density[1]) + 1e-9) * body
    y = cr + slide * 0.25
    if flap_at is not None:
        i = int(flap_at * SR)
        L = int(0.09 * SR)
        thump = filt(white(L, rng), "lowpass", 700) * np.exp(-np.arange(L) / (0.022 * SR)) * 1.8
        y[i : i + L] += thump[: n - i]
        if snap:
            L2 = int(0.03 * SR)
            s = filt(white(L2, rng), "bandpass", [2000, 5200]) * np.exp(-np.arange(L2) / (0.005 * SR)) * 1.6
            y[i + 200 : i + 200 + L2] += s[: max(0, n - i - 200)]
    y = reverb(y, 0.35, 0.12, rng)
    write(name, pan(y, rng.uniform(-0.15, 0.15)), peak_db=peak)


def paper_flutter(dur=7.0):
    rng = np.random.default_rng(31)
    n = int(dur * SR)
    t = np.arange(n) / SR
    y = np.zeros(n)
    tt = 0.3
    while tt < dur - 0.6:
        L = int(rng.uniform(0.25, 0.6) * SR)
        u = np.arange(L) / SR
        mod = 0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(11, 17) * u)
        b = filt(white(L, rng), "bandpass", [700, 4200]) * mod * np.sin(np.pi * u / u[-1]) ** 2
        b += crackle(L, 60, rng, 1500, 8000) * 0.5
        place(y, b * rng.uniform(0.4, 1.0), tt)
        tt += rng.uniform(0.6, 1.4)
    write("paper_flutter.wav", pan(y, 0.1), peak_db=-12)


def cloth(name, dur, seed, peak=-10):
    rng = np.random.default_rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    e = env(n, dur * 0.3, dur * 0.6, 1.5)
    y = filt(white(n, rng), "bandpass", [180, 2400]) * e * 0.4 + crackle(n, 25 * e + 2, rng, 400, 3500, (0.004, 0.02)) * e
    write(name, pan(filt(y, "lowpass", 4500), 0.1), peak_db=peak)


def breath_exhale(dur=1.7):
    rng = np.random.default_rng(41)
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = filt(white(n, rng), "bandpass", [220, 2600], 2)
    x = peak_eq(x, 650, 2.5, 7)
    x = peak_eq(x, 1350, 3, 5)
    e = np.clip(t / 0.18, 0, 1) ** 1.5 * np.exp(-np.clip(t - 0.18, 0, None) / 0.55)
    y = filt(x * e, "lowpass", 3800)
    write("breath_exhale.wav", y, peak_db=-12)


def footstep(name, seed, heavy=1.0):
    rng = np.random.default_rng(seed)
    dur = 0.42
    n = int(dur * SR)
    t = np.arange(n) / SR
    thud = np.sin(2 * np.pi * rng.uniform(70, 95) * t) * np.exp(-t / 0.045) * 0.9 * heavy
    thud += filt(white(n, rng), "lowpass", 380) * np.exp(-t / 0.035) * 0.8
    heel = crackle(n, np.where(t < 0.05, 500, 0) * np.exp(-t / 0.03), rng, 1000, 5200, (0.001, 0.004))
    toe_at = rng.uniform(0.09, 0.12)
    toe = crackle(n, np.where((t > toe_at) & (t < toe_at + 0.04), 380, 0), rng, 1100, 5500, (0.001, 0.004)) * 0.5
    scuff = filt(white(n, rng), "bandpass", [500, 3000]) * env(n, 0.01, 0.3, 2) * np.exp(-t / 0.12) * 0.15
    y = thud * 1.2 + filt(heel * 0.45 + toe, 'lowpass', 5000, 2) + scuff
    y = reverb(y, 0.25, 0.1, rng)
    write(name, pan(y, 0.0), peak_db=-4)


if __name__ == "__main__":
    amb_dawn_wind()
    amb_meadow_warm()
    whoosh("whoosh_mist.wav", 3.0, 11, pan_from=0.75, pan_to=-0.75)
    whoosh("whoosh_return.wav", 3.8, 12, darker=True, pan_from=0.6, pan_to=-0.8)
    shimmer_bloom()
    paper("paper_handle.wav", 1.1, 21, ([0, 0.15, 0.6, 1.1], [5, 80, 35, 0]))
    paper("paper_unfold_1.wav", 0.8, 22, ([0, 0.08, 0.35, 0.8], [10, 260, 60, 0]), flap_at=0.36)
    paper("paper_unfold_2.wav", 1.0, 23, ([0, 0.1, 0.45, 1.0], [10, 320, 80, 0]), flap_at=0.48, snap=True)
    paper_flutter()
    cloth("cloth_shift.wav", 0.9, 51)
    cloth("cloth_settle.wav", 0.7, 52, peak=-14)
    breath_exhale()
    for k in range(4):
        footstep(f"step_dirt_{k + 1}.wav", 60 + k, heavy=1.0 - 0.1 * k)
