import brand from "./config/brand.json";

const c = brand.colors;

/** Cartoon palette built around the brand's yellow / blue / white. */
export const T = {
  yellow: c.yellow,
  yellowDeep: c.yellowDeep,
  yellowLight: "#FFE58A",
  blue: c.blue,
  blueDeep: c.blueDeep,
  blueLight: "#4FA3FF",
  navy: c.navy,
  sky: c.sky,
  white: c.white,
  /** Cartoon outline colour used on every drawn element. */
  ink: "#0A2A6B",
  inkSoft: "#1B4C9E",
  foamShade: "#D3E8FF",
  foamLine: "#A9D0FF",
} as const;
