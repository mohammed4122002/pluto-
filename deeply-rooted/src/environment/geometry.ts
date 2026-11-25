import {Cam, project, NEAR} from '../engine/camera';
import {noise1} from '../engine/noise';
import {PathDef} from './types';

/** Catmull–Rom resample of a polyline. */
export const catmull = (pts: [number, number][], per = 10): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};

/** Ground-plane ribbon polygon (x, z) around a path centreline. */
export const ribbon = (p: PathDef, widthMul = 1, offset = 0, per = 10): [number, number][] => {
  const c = catmull(p.pts, per);
  const L: [number, number][] = [], R: [number, number][] = [];
  for (let i = 0; i < c.length; i++) {
    const a = c[Math.max(0, i - 1)], b = c[Math.min(c.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    const nx = -tz, nz = tx;
    const t = i / (c.length - 1);
    const w = (p.width * widthMul * (1 + 0.16 * noise1(i * 0.37, p.seed)) * (1 - 0.25 * t)) / 2;
    const ox = c[i][0] + nx * offset, oz = c[i][1] + nz * offset;
    L.push([ox + nx * w, oz + nz * w]);
    R.push([ox - nx * w, oz - nz * w]);
  }
  return [...L, ...R.reverse()];
};

/** Sutherland–Hodgman clip of a ground polygon against the camera's near plane. */
export const clipNear = (poly: [number, number][], zMin: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ina = a[1] >= zMin, inb = b[1] >= zMin;
    if (ina) out.push(a);
    if (ina !== inb) {
      const t = (zMin - a[1]) / (b[1] - a[1]);
      out.push([a[0] + (b[0] - a[0]) * t, zMin]);
    }
  }
  return out;
};

export const groundPolyToSvg = (cam: Cam, poly: [number, number][]) => {
  const clipped = clipNear(poly, cam.z + NEAR + 0.05);
  if (clipped.length < 3) return '';
  return (
    clipped
      .map(([x, z], i) => {
        const p = project(cam, x, 0, z)!;
        return `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join('') + 'Z'
  );
};

/** Distance from a ground point to the nearest path centreline (for keeping grass off paths). */
export const distToPaths = (x: number, z: number, paths: PathDef[]) => {
  let best = Infinity;
  for (const p of paths) {
    const c = catmull(p.pts, 6);
    for (let i = 0; i < c.length - 1; i++) {
      const [ax, az] = c[i], [bx, bz] = c[i + 1];
      const dx = bx - ax, dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - p.width / 2);
    }
  }
  return best;
};

/** Point and heading at arc length `dist` along a path (for walking characters). */
export const alongPath = (p: PathDef, dist: number) => {
  const c = catmull(p.pts, 16);
  let acc = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const seg = Math.hypot(c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1]);
    if (acc + seg >= dist) {
      const t = (dist - acc) / seg;
      return {x: c[i][0] + (c[i + 1][0] - c[i][0]) * t, z: c[i][1] + (c[i + 1][1] - c[i][1]) * t};
    }
    acc += seg;
  }
  const l = c[c.length - 1];
  return {x: l[0], z: l[1]};
};

/** Arc length position on a path closest to a given z (first crossing). */
export const distAtZ = (p: PathDef, z: number) => {
  const c = catmull(p.pts, 16);
  let acc = 0;
  for (let i = 0; i < c.length - 1; i++) {
    const seg = Math.hypot(c[i + 1][0] - c[i][0], c[i + 1][1] - c[i][1]);
    if ((c[i][1] - z) * (c[i + 1][1] - z) <= 0) return acc + seg * ((z - c[i][1]) / (c[i + 1][1] - c[i][1] || 1));
    acc += seg;
  }
  return acc;
};
