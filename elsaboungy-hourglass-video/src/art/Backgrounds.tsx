import { useId } from "react";
import { rng } from "../lib/math";

/** Classic cartoon-commercial sunburst: radial gradient + rotating rays. */
export const Sunburst: React.FC<{
  cx: number;
  cy: number;
  inner: string;
  outer: string;
  ray: string;
  rayOpacity?: number;
  rays?: number;
  rotation: number;
  width?: number;
  height?: number;
}> = ({ cx, cy, inner, outer, ray, rayOpacity = 0.22, rays = 20, rotation, width = 1080, height = 1920 }) => {
  const id = `sb${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const R = 2400;
  const wedges = Array.from({ length: rays }, (_, i) => {
    const a0 = ((i * 2) / (rays * 2)) * Math.PI * 2;
    const a1 = ((i * 2 + 1) / (rays * 2)) * Math.PI * 2;
    return `M0,0 L${Math.cos(a0) * R},${Math.sin(a0) * R} L${Math.cos(a1) * R},${Math.sin(a1) * R} Z`;
  }).join(" ");
  return (
    <g>
      <defs>
        <radialGradient id={id} cx={cx} cy={cy} r={1300} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={inner} />
          <stop offset="1" stopColor={outer} />
        </radialGradient>
        <radialGradient id={`${id}f`} cx={cx} cy={cy} r={1100} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity={1} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id={`${id}m`}>
          <rect width={width} height={height} fill={`url(#${id}f)`} />
        </mask>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
      <g mask={`url(#${id}m)`}>
        <path d={wedges} fill={ray} opacity={rayOpacity} transform={`translate(${cx} ${cy}) rotate(${rotation})`} />
      </g>
    </g>
  );
};

/** Vertical gradient fill. */
export const Gradient: React.FC<{ top: string; bottom: string; width?: number; height?: number }> = ({
  top,
  bottom,
  width = 1080,
  height = 1920,
}) => {
  const id = `gr${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${id})`} />
    </g>
  );
};

/** Big soft out-of-focus dots drifting slowly (cartoon bokeh). */
export const SoftDots: React.FC<{
  seed: number;
  count: number;
  t: number;
  rMin: number;
  rMax: number;
  drift?: number;
  opacity?: number;
  width?: number;
  height?: number;
}> = ({ seed, count, t, rMin, rMax, drift = 20, opacity = 1, width = 1080, height = 1920 }) => {
  const r = rng(seed);
  return (
    <g opacity={opacity}>
      {Array.from({ length: count }, (_, i) => {
        const x = r() * width;
        const y = r() * height;
        const rad = rMin + r() * (rMax - rMin);
        const ph = r() * Math.PI * 2;
        const sp = 0.3 + r() * 0.5;
        return (
          <circle
            key={i}
            cx={x + Math.sin(t * sp + ph) * drift}
            cy={((y - t * drift * sp * 2) % (height + 2 * rad) + height + 2 * rad) % (height + 2 * rad) - rad}
            r={rad}
            fill="url(#softDot)"
          />
        );
      })}
    </g>
  );
};

/** Little rings scattered as a playful pattern. */
export const RingPattern: React.FC<{ seed: number; count: number; t: number; color: string; opacity?: number }> = ({
  seed,
  count,
  t,
  color,
  opacity = 0.25,
}) => {
  const r = rng(seed);
  return (
    <g opacity={opacity}>
      {Array.from({ length: count }, (_, i) => {
        const x = r() * 1080;
        const y = r() * 1920;
        const rad = 10 + r() * 26;
        const ph = r() * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={x + Math.sin(t * 0.8 + ph) * 10}
            cy={y + Math.cos(t * 0.7 + ph) * 10}
            r={rad}
            fill="none"
            stroke={color}
            strokeWidth={5}
          />
        );
      })}
    </g>
  );
};
