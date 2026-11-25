// Deterministic noise used for wind, breathing irregularity, hand-made wobble and scatter.

const fract = (x: number) => x - Math.floor(x);
export const hash = (n: number, seed = 0) => fract(Math.sin(n * 127.1 + seed * 311.7 + 74.7) * 43758.5453123);
export const hash2 = (x: number, y: number, seed = 0) => fract(Math.sin(x * 127.1 + y * 269.5 + seed * 113.3) * 43758.5453123);

/** Smooth 1D value noise in [-1, 1]. */
export const noise1 = (x: number, seed = 0) => {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * f * (f * (f * 6 - 15) + 10);
  return (hash(i, seed) * (1 - u) + hash(i + 1, seed) * u) * 2 - 1;
};

export const fbm1 = (x: number, seed = 0, octaves = 4) => {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let o = 0; o < octaves; o++) {
    s += a * noise1(x * f, seed + o * 17);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
};

/** Seeded PRNG (mulberry32) for scattering objects deterministically. */
export const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
