/**
 * A glossy ribbon "comet" running around an elliptical orbit. The part of the
 * orbit facing the viewer is drawn in the front layer and the far side in the
 * back layer, which gives a cheap 2.5D wrap around whatever sits between.
 */
export const OrbitRibbon: React.FC<{
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  tilt: number; // degrees
  head: number; // radians, position of the ribbon head
  length: number; // radians
  width: number;
  color: string;
  edge: string;
  layer: "back" | "front";
  reveal?: number; // 0..1 grows the ribbon
}> = ({ cx, cy, rx, ry, tilt, head, length, width, color, edge, layer, reveal = 1 }) => {
  const len = length * reveal;
  if (len <= 0.01) return null;
  const N = 60;
  const rad = (tilt * Math.PI) / 180;
  const pts = Array.from({ length: N + 1 }, (_, i) => {
    const a = head - len + (len * i) / N;
    const lx = Math.cos(a) * rx;
    const ly = Math.sin(a) * ry;
    return {
      x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
      y: cy + lx * Math.sin(rad) + ly * Math.cos(rad),
      front: Math.sin(a) >= 0,
    };
  });
  // split into runs of the same side
  const runs: { pts: typeof pts; front: boolean }[] = [];
  for (const p of pts) {
    const last = runs[runs.length - 1];
    if (!last || last.front !== p.front) {
      runs.push({ pts: last ? [last.pts[last.pts.length - 1], p] : [p], front: p.front });
    } else last.pts.push(p);
  }
  const want = layer === "front";
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {runs
        .filter((r) => r.front === want && r.pts.length > 1)
        .map((r, i) => {
          const d = `M${r.pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L")}`;
          return (
            <g key={i} opacity={want ? 1 : 0.8}>
              <path d={d} stroke={edge} strokeWidth={width + 12} />
              <path d={d} stroke={color} strokeWidth={width} />
              <path d={d} stroke="#ffffff" strokeWidth={width * 0.22} opacity={0.75} transform={`translate(0 ${-width * 0.18})`} />
            </g>
          );
        })}
    </g>
  );
};
