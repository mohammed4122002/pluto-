// Colour utilities: everything on screen is mixed from the approved palette.

const toRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');

/** Linear mix of two hex colours, t in [0,1]. */
export const mix = (a: string, b: string, t: number) => {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
};

/** Multiply brightness (>1 lighter, <1 darker). */
export const shade = (c: string, k: number) => {
  const [r, g, b] = toRgb(c);
  return toHex(r * k, g * k, b * k);
};

export const rgba = (c: string, a: number) => {
  const [r, g, b] = toRgb(c);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
};
