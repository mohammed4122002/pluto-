import { clamp, rng } from "../lib/math";
import { T } from "../theme";

/** One glossy cartoon soap bubble. */
export const Bubble: React.FC<{
  x: number;
  y: number;
  r: number;
  opacity?: number;
  /** outline colour: white on dark/colour backgrounds, blue on light ones */
  line?: string;
  squish?: number;
}> = ({ x, y, r, opacity = 1, line = "#ffffff", squish = 0 }) => {
  if (r <= 0.5) return null;
  const sx = 1 + squish;
  const sy = 1 - squish;
  return (
    <g transform={`translate(${x} ${y}) scale(${sx} ${sy})`} opacity={opacity}>
      <circle r={r} fill="url(#bubbleBody)" />
      <circle r={r * 0.94} fill="none" stroke="url(#bubbleIris)" strokeWidth={Math.max(1.5, r * 0.07)} opacity={0.55} />
      <circle r={r} fill="none" stroke={line} strokeWidth={Math.max(2.5, r * 0.055)} opacity={0.95} />
      <ellipse
        cx={-r * 0.36}
        cy={-r * 0.4}
        rx={r * 0.3}
        ry={r * 0.15}
        fill="#fff"
        transform={`rotate(-40 ${-r * 0.36} ${-r * 0.4})`}
      />
      <circle cx={-r * 0.02} cy={-r * 0.64} r={r * 0.065} fill="#fff" />
      <path
        d={`M ${r * 0.62} ${r * 0.18} A ${r * 0.66} ${r * 0.66} 0 0 1 ${r * 0.2} ${r * 0.62}`}
        fill="none"
        stroke="#fff"
        strokeWidth={Math.max(2, r * 0.06)}
        strokeLinecap="round"
        opacity={0.7}
      />
    </g>
  );
};

/** Little "pop!" — radiating dashes and droplets. */
export const PopBurst: React.FC<{ x: number; y: number; r: number; k: number; color?: string }> = ({
  x,
  y,
  r,
  k,
  color = "#ffffff",
}) => {
  if (k <= 0 || k >= 1) return null;
  const n = 8;
  return (
    <g transform={`translate(${x} ${y})`} opacity={1 - k}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.3;
        const r0 = r * (0.6 + k * 0.9);
        const r1 = r * (0.85 + k * 1.2);
        return (
          <line
            key={i}
            x1={Math.cos(a) * r0}
            y1={Math.sin(a) * r0}
            x2={Math.cos(a) * r1}
            y2={Math.sin(a) * r1}
            stroke={color}
            strokeWidth={Math.max(3, r * 0.12) * (1 - k * 0.5)}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
};

export type RisingOpts = {
  seed: number;
  count: number;
  t: number; // seconds
  x0: number;
  x1: number;
  y0: number; // spawn line (bottom)
  y1: number; // top
  rMin: number;
  rMax: number;
  speed: number; // px / s
  line?: string;
  /** frame-based appear (pop-in) progress 0..1 */
  appear?: number;
  sway?: number;
};

/** Endless stream of bubbles rising and swaying, deterministic per frame. */
export const RisingBubbles: React.FC<RisingOpts> = ({
  seed,
  count,
  t,
  x0,
  x1,
  y0,
  y1,
  rMin,
  rMax,
  speed,
  line,
  appear = 1,
  sway = 26,
}) => {
  const r = rng(seed);
  const items = Array.from({ length: count }, () => ({
    x: x0 + r() * (x1 - x0),
    phase: r(),
    size: rMin + r() ** 1.5 * (rMax - rMin),
    sp: 0.7 + r() * 0.6,
    wob: r() * Math.PI * 2,
    delay: r(),
  }));
  const span = y0 - y1;
  return (
    <g>
      {items.map((b, i) => {
        const travel = (b.phase * span + t * speed * b.sp) % (span + b.size * 2);
        const y = y0 + b.size - travel;
        const x = b.x + Math.sin(t * 1.6 + b.wob) * sway;
        const a = clamp((appear - b.delay * 0.5) * 2);
        const sc = a < 1 ? Math.sin(a * Math.PI * 0.5) * (1 + 0.25 * Math.sin(a * Math.PI)) : 1;
        const squish = Math.sin(t * 3 + b.wob) * 0.05;
        return <Bubble key={i} x={x} y={y} r={b.size * sc} line={line} squish={squish} />;
      })}
    </g>
  );
};

/** Bubbles exploding outward from a point, drifting up, then popping. */
export const BurstBubbles: React.FC<{
  seed: number;
  count: number;
  /** seconds since the burst (negative = not yet) */
  dt: number;
  cx: number;
  cy: number;
  spread: number;
  rMin: number;
  rMax: number;
  life?: number;
  line?: string;
}> = ({ seed, count, dt, cx, cy, spread, rMin, rMax, life = 2.4, line }) => {
  if (dt < 0) return null;
  const r = rng(seed);
  const items = Array.from({ length: count }, () => {
    const a = r() * Math.PI * 2;
    return {
      a,
      dist: spread * (0.45 + r() * 0.75),
      size: rMin + r() ** 1.4 * (rMax - rMin),
      lifeK: 0.65 + r() * 0.5,
      rise: 60 + r() * 140,
      wob: r() * Math.PI * 2,
    };
  });
  return (
    <g>
      {items.map((b, i) => {
        const lf = life * b.lifeK;
        const k = clamp(dt / lf);
        const out = 1 - Math.exp(-dt * 4.2);
        const x = cx + Math.cos(b.a) * b.dist * out + Math.sin(dt * 2 + b.wob) * 12;
        const y = cy + Math.sin(b.a) * b.dist * out * 0.8 - b.rise * dt;
        const grow = clamp(dt * 6);
        const sc = grow < 1 ? grow * (1 + 0.3 * Math.sin(grow * Math.PI)) : 1;
        if (k >= 1) {
          const pk = clamp((dt - lf) / 0.22);
          return <PopBurst key={i} x={x} y={y} r={b.size} k={pk} color={line ?? "#fff"} />;
        }
        return <Bubble key={i} x={x} y={y} r={b.size * sc} line={line} squish={Math.sin(dt * 8 + b.wob) * 0.06 * (1 - k)} />;
      })}
    </g>
  );
};

/** 4-point twinkle star. */
export const Sparkle: React.FC<{ x: number; y: number; s: number; rot?: number; color?: string; opacity?: number }> = ({
  x,
  y,
  s,
  rot = 0,
  color = "#ffffff",
  opacity = 1,
}) => {
  if (s <= 0.3) return null;
  const q = s * 0.2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} opacity={opacity}>
      <circle r={s * 0.9} fill="url(#softGlow)" opacity={0.6} />
      <path
        d={`M0,${-s} Q${q},${-q} ${s},0 Q${q},${q} 0,${s} Q${-q},${q} ${-s},0 Q${-q},${-q} 0,${-s} Z`}
        fill={color}
      />
    </g>
  );
};

/** A field of sparkles twinkling at their own pace. */
export const Twinkles: React.FC<{
  seed: number;
  count: number;
  t: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  size: number;
  color?: string;
}> = ({ seed, count, t, x0, x1, y0, y1, size, color = T.white }) => {
  const r = rng(seed);
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const x = x0 + r() * (x1 - x0);
        const y = y0 + r() * (y1 - y0);
        const ph = r();
        const sp = 0.6 + r() * 0.8;
        const sz = size * (0.5 + r() * 0.7);
        const k = (t * sp + ph) % 1;
        const s = Math.max(0, Math.sin(k * Math.PI)) ** 2;
        return <Sparkle key={i} x={x} y={y} s={sz * s} rot={k * 90} color={color} />;
      })}
    </g>
  );
};
