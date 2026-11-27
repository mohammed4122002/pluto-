"""Deeply Rooted — Episode 01 ambience beds (procedural, seamless 30 s loops, stereo 48 kHz).
rain · wind (open land) · dawn lake (lapping + soft air + rare distant birds). The pilot's night-lake bed is reused.
python3 scripts/episode01/generate_ambience.py"""
import os
import wave

import numpy as np

SR, DUR = 48000, 30.0
N = int(SR * DUR)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "audio", "ep01")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)


def lp(x, fc):
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):  # one-pole (fine for 30 s)
        acc = (1 - a) * x[i] + a * acc
        y[i] = acc
    return y


def lp_fast(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / (1 + (f / fc) ** 2), len(x))


def hp_fast(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * (f / fc) ** 2 / (1 + (f / fc) ** 2), len(x))


def slow(n, rate, seed):
    r = np.random.default_rng(seed)
    k = int(DUR * rate) + 2
    pts = r.random(k)
    return np.interp(np.linspace(0, k - 1, n), np.arange(k), pts)


def loopable(x, fade=1.5):
    m = int(SR * fade)
    w = np.linspace(0, 1, m)
    y = x[: len(x) - m].copy()
    y[:m] = x[len(x) - m :] * (1 - w) + x[:m] * w
    return y


def write(name, L, R, rms_db):
    st = np.stack([L, R], 1)
    st = st / (np.sqrt(np.mean(st**2)) + 1e-12) * 10 ** (rms_db / 20)
    st = np.clip(st, -1, 1)
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype(np.int16).tobytes())
    print("wrote", name)


# rain: a steady hiss (band-limited noise) + thousands of tiny droplets, decorrelated per channel
def rain():
    out = []
    for ch in range(2):
        n = rng.normal(0, 1, N)
        hiss = hp_fast(lp_fast(n, 7000), 900) * (0.85 + 0.15 * slow(N, 0.4, 10 + ch))
        drops = np.zeros(N)
        for t in rng.integers(0, N - 2000, 9000):
            L = int(rng.uniform(80, 400))
            env = np.exp(-np.linspace(0, 6, L))
            drops[t : t + L] += rng.normal(0, 1, L) * env * rng.uniform(0.2, 1.0)
        drops = hp_fast(drops, 1500)
        out.append(loopable(hiss * 0.7 + drops * 0.5))
    write("amb_rain.wav", out[0], out[1], -27)


# wind over open land: low rumble with slow gusts + grass rustle that follows the gusts
def wind():
    out = []
    for ch in range(2):
        g = 0.55 + 0.45 * slow(N, 0.18, 20 + ch) ** 1.5
        low = lp_fast(rng.normal(0, 1, N), 320) * g
        rustle = hp_fast(lp_fast(rng.normal(0, 1, N), 5000), 1800) * g**2 * 0.35
        out.append(loopable(low + rustle))
    write("amb_wind.wav", out[0], out[1], -29)


# dawn lake: gentle lapping (filtered noise bursts), soft air, a few distant bird calls
def dawn():
    out = []
    for ch in range(2):
        air = lp_fast(rng.normal(0, 1, N), 600) * (0.6 + 0.4 * slow(N, 0.15, 30 + ch)) * 0.5
        lap = np.zeros(N)
        t = 0
        while t < N - SR:
            L = int(rng.uniform(0.25, 0.7) * SR)
            env = np.sin(np.linspace(0, np.pi, L)) ** 2
            lap[t : t + L] += rng.normal(0, 1, L) * env * rng.uniform(0.4, 1.0)
            t += int(rng.uniform(0.6, 2.2) * SR)
        lap = lp_fast(hp_fast(lap, 120), 1400)
        birds = np.zeros(N)
        for k in range(7):
            t0 = int(rng.uniform(1, DUR - 2) * SR)
            for j in range(int(rng.integers(2, 5))):
                L = int(0.09 * SR)
                tt = np.arange(L) / SR
                f0 = rng.uniform(2600, 3600)
                chirp = np.sin(2 * np.pi * (f0 * tt + rng.uniform(-900, 900) * tt**2 / 0.09 * 0.5)) * np.sin(np.pi * tt / 0.09) ** 2
                s = t0 + j * int(0.16 * SR)
                birds[s : s + L] += chirp * 0.12
        out.append(loopable(air + lap * 0.8 + birds * (0.8 if ch == k % 2 else 0.5)))
    write("amb_dawn_lake.wav", out[0], out[1], -29)


if __name__ == "__main__":
    rain()
    wind()
    dawn()
