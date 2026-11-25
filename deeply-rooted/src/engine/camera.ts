// A real perspective camera for a 2.5D world.
// World units are metres: X right, Y up, Z forward (away from the camera). Ground is Y = 0.
// The camera never pitches; framing is done with a vertical lens shift (`horizon`), which keeps
// verticals vertical like a tilt-shift / cinema lens and keeps the horizon line stable.
import {W, H} from '../config/production';

export interface Cam {
  x: number; // camera position (m)
  y: number; // camera height (m)
  z: number; // camera position along depth (m)
  f: number; // focal length in pixels (2637 ≈ 50mm full-frame at 1920px)
  horizon: number; // screen y of the horizon line (lens shift), px
  focus: number; // focus distance (m)
  aperture: number; // depth-of-field strength (px of blur per 1/m of defocus)
}

export interface Projected {
  x: number;
  y: number;
  d: number; // distance along view axis (m)
  s: number; // pixels per metre at this depth
}

export const NEAR = 0.25;

export const project = (c: Cam, X: number, Y: number, Z: number): Projected | null => {
  const d = Z - c.z;
  if (d < NEAR) return null;
  const s = c.f / d;
  return {x: W / 2 + (X - c.x) * s, y: c.horizon - (Y - c.y) * s, d, s};
};

/** Screen-space blur radius (px) for an object at distance d. */
export const blurAt = (c: Cam, d: number) => (d <= 0 ? 0 : c.aperture * Math.abs(1 / d - 1 / c.focus));

/** Screen y of a ground point at distance d. */
export const groundY = (c: Cam, d: number) => c.horizon + (c.y * c.f) / d;
/** Distance of the ground point that projects to screen y. */
export const groundDepthAtY = (c: Cam, y: number) => (y <= c.horizon ? Infinity : (c.y * c.f) / (y - c.horizon));

export const W_ = W;
export const H_ = H;
