import { rng } from "../lib/math";
import { T } from "../theme";

export type Puff = { x: number; y: number; r: number };

/** Cloud-like cluster of foam puffs, relative to (0,0), roughly `size` wide. */
export const cloudShape = (seed: number, size: number): Puff[] => {
  const r = rng(seed);
  const out: Puff[] = [];
  const n = 5 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1) - 0.5; // -0.5..0.5 across
    const hump = 1 - Math.abs(k) * 1.4;
    out.push({
      x: k * size * 0.95 + (r() - 0.5) * size * 0.08,
      y: -hump * size * 0.18 + (r() - 0.5) * size * 0.06,
      r: size * (0.17 + hump * 0.12 + r() * 0.05),
    });
  }
  // a couple on top for a fluffy crown
  out.push({ x: -size * 0.12, y: -size * 0.3, r: size * 0.2 });
  out.push({ x: size * 0.14, y: -size * 0.26, r: size * 0.17 });
  return out;
};

/**
 * Cartoon foam: outline layer, cool shade layer, glossy white puffs, sparkle dots.
 */
export const FoamCloud: React.FC<{
  puffs: Puff[];
  x?: number;
  y?: number;
  scale?: number;
  rot?: number;
  outline?: string;
  outlineW?: number;
  opacity?: number;
  squish?: number;
}> = ({ puffs, x = 0, y = 0, scale = 1, rot = 0, outline = T.foamLine, outlineW = 7, opacity = 1, squish = 0 }) => {
  if (scale <= 0.01) return null;
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale * (1 + squish)} ${scale * (1 - squish)})`}
      opacity={opacity}
    >
      {puffs.map((p, i) => (
        <circle key={`o${i}`} cx={p.x} cy={p.y} r={p.r + outlineW / scale} fill={outline} />
      ))}
      {puffs.map((p, i) => (
        <circle key={`s${i}`} cx={p.x + p.r * 0.06} cy={p.y + p.r * 0.1} r={p.r} fill={T.foamShade} />
      ))}
      {puffs.map((p, i) => (
        <circle key={`w${i}`} cx={p.x - p.r * 0.05} cy={p.y - p.r * 0.07} r={p.r * 0.9} fill="url(#foamBall)" />
      ))}
      {puffs.map((p, i) =>
        i % 2 === 0 ? (
          <ellipse
            key={`h${i}`}
            cx={p.x - p.r * 0.38}
            cy={p.y - p.r * 0.42}
            rx={p.r * 0.2}
            ry={p.r * 0.12}
            fill="#fff"
            transform={`rotate(-35 ${p.x - p.r * 0.38} ${p.y - p.r * 0.42})`}
          />
        ) : null,
      )}
    </g>
  );
};

/**
 * A horizontal wall of foam (used by the foam-wipe transition): solid white
 * body with a bubbly top and bottom edge.
 */
export const FoamWall: React.FC<{ y: number; height: number; width: number; seed: number }> = ({
  y,
  height,
  width,
  seed,
}) => {
  const r = rng(seed);
  const edge = (yy: number, flip: number) =>
    Array.from({ length: Math.ceil(width / 70) + 2 }, (_, i) => ({
      x: -40 + i * 70 + (r() - 0.5) * 20,
      y: yy + flip * (r() * 30),
      r: 60 + r() * 45,
    }));
  const topEdge = edge(y, -1);
  const botEdge = edge(y + height, 1);
  const inner = Array.from({ length: 26 }, () => ({
    x: r() * width,
    y: y + 80 + r() * (height - 160),
    r: 14 + r() * 40,
  }));
  return (
    <g>
      {[...topEdge, ...botEdge].map((p, i) => (
        <circle key={`o${i}`} cx={p.x} cy={p.y} r={p.r + 8} fill={T.foamLine} />
      ))}
      <rect x={-50} y={y} width={width + 100} height={height} fill="url(#foamBody)" />
      {[...topEdge, ...botEdge].map((p, i) => (
        <circle key={`w${i}`} cx={p.x} cy={p.y} r={p.r} fill="url(#foamBall)" />
      ))}
      {inner.map((p, i) => (
        <g key={`i${i}`}>
          <circle cx={p.x} cy={p.y} r={p.r} fill="none" stroke={T.foamLine} strokeWidth={4} />
          <circle cx={p.x - p.r * 0.35} cy={p.y - p.r * 0.35} r={p.r * 0.2} fill="#fff" />
        </g>
      ))}
      {topEdge.map((p, i) =>
        i % 2 ? (
          <ellipse key={`h${i}`} cx={p.x - p.r * 0.35} cy={p.y - p.r * 0.4} rx={p.r * 0.22} ry={p.r * 0.12} fill="#fff" />
        ) : null,
      )}
    </g>
  );
};
