import React from 'react';
import {staticFile} from 'remotion';
import {tones} from '../config/palette';
import {hash} from '../engine/noise';
import {Mode, paint} from '../character/spec';
import {mapArtGeometry} from '../worlds/imagined';

/**
 * THE PAPER MAP — "the plan".
 * Map-local units: 2400 × 1600 (a 60 × 40 cm sheet folded in 3 × 2 panels).
 * The drawing is authored so that local = screen + OFFSET at the moment of the Scene 03 match cut:
 * the ink route, hills and the olive-tree glyph sit exactly where the real path, hills and tree
 * appear in the imagined world. No words anywhere on the map.
 */
export const MAP_W = 2400;
export const MAP_H = 1600;
export const OFFSET: [number, number] = [240, 260];

const geo = mapArtGeometry();
const off = (p: [number, number]): [number, number] => [p[0] + OFFSET[0], p[1] + OFFSET[1]];
const poly = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${off(p)[0].toFixed(1)} ${off(p)[1].toFixed(1)}`).join('');

const smoothPoly = (pts: [number, number][]) => {
  if (pts.length < 3) return poly(pts);
  const o = pts.map(off);
  let d = `M${o[0][0].toFixed(1)} ${o[0][1].toFixed(1)}`;
  for (let i = 1; i < o.length - 1; i++) {
    const mx = (o[i][0] + o[i + 1][0]) / 2, my = (o[i][1] + o[i + 1][1]) / 2;
    d += `Q${o[i][0].toFixed(1)} ${o[i][1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const l = o[o.length - 1];
  return d + `L${l[0].toFixed(1)} ${l[1].toFixed(1)}`;
};

/** Short downward hatch strokes under a ridgeline (old pictorial-map hill shading). */
const hatches = (pts: [number, number][], seed: number, every = 3, len = 26) => {
  let d = '';
  for (let i = 1; i < pts.length - 1; i += every) {
    const [x, y] = off(pts[i]);
    if (hash(i, seed) < 0.35) continue;
    const l = len * (0.5 + hash(i, seed + 1) * 0.6);
    d += `M${x.toFixed(1)} ${(y + 6).toFixed(1)}l${(-l * 0.25).toFixed(1)} ${l.toFixed(1)}`;
  }
  return d;
};

/** Union outline of the canopy lobes: farthest lobe hit along rays from the canopy centre. */
const canopyOutline = (lobes: [number, number, number][]) => {
  const cx0 = 0.1, cy0 = 4.4, N = 160;
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    let best = 0;
    for (const [cx, cy, r] of lobes) {
      const rx = r, ry = r * 0.68;
      // solve |(c0 + t d − c) / (rx, ry)| = 1 for the far root t
      const ox = (cx0 - cx) / rx, oy = (cy0 - cy) / ry, ux = dx / rx, uy = dy / ry;
      const A = ux * ux + uy * uy, B = 2 * (ox * ux + oy * uy), C = ox * ox + oy * oy - 1;
      const disc = B * B - 4 * A * C;
      if (disc >= 0) best = Math.max(best, (-B + Math.sqrt(disc)) / (2 * A));
    }
    pts.push(`${(cx0 + dx * best).toFixed(3)} ${(cy0 + dy * best).toFixed(3)}`);
  }
  return `M${pts.join('L')}Z`;
};

/** Pictorial olive-tree glyph in ink, sized to the real tree (s = px per metre at the match). */
const TreeGlyph: React.FC<{x: number; y: number; s: number; ink: string; w?: number}> = ({x, y, s, ink, w = 1}) => {
  const [ox, oy] = off([x, y]);
  const lobes: [number, number, number][] = [
    [-2.6, 3.6, 1.25], [-1.2, 4.5, 1.45], [0.3, 5.0, 1.5], [1.7, 4.6, 1.4], [2.8, 3.8, 1.15], [0.1, 3.7, 1.3], [-0.4, 5.8, 0.9],
  ];
  return (
    <g transform={`translate(${ox} ${oy}) scale(${s} ${-s})`} fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round">
      <path d="M-0.5 0 C-0.3 0.8 -0.4 1.5 -0.9 2.2 C-1.2 2.7 -1.6 3.1 -1.9 3.4 M0.6 0 C0.4 0.9 0.5 1.5 0.9 2.0 C1.2 2.6 1.4 3.1 1.5 3.5 M-0.05 1.9 C0 2.6 0 3.2 0 3.9" strokeWidth={(4 * w) / s} />
      <path d={canopyOutline(lobes)} strokeWidth={(3.4 * w) / s} opacity={0.92} />
      {[...Array(9)].map((_, i) => (
        <path key={`h${i}`} d={`M${-2.6 + i * 0.6} ${3.3 + (i % 3) * 0.3} l0.3 -0.5`} strokeWidth={2.2 / s} opacity={0.6} />
      ))}
      <path d="M-3.4 0 C-1.5 -0.25 1.6 -0.25 3.6 0" strokeWidth={3 / s} opacity={0.7} />
    </g>
  );
};

const Compass: React.FC<{x: number; y: number; r: number; ink: string}> = ({x, y, r, ink}) => (
  <g transform={`translate(${x} ${y})`} stroke={ink} fill="none" strokeLinecap="round">
    <circle r={r} strokeWidth={3} opacity={0.8} />
    <circle r={r * 0.82} strokeWidth={1.5} opacity={0.6} />
    <path d={`M0 ${-r * 1.25} L${r * 0.16} 0 L0 ${r * 1.25} L${-r * 0.16} 0 Z`} fill={ink} fillOpacity={0.75} strokeWidth={1.5} />
    <path d={`M${-r * 1.25} 0 L0 ${r * 0.16} L${r * 1.25} 0 L0 ${-r * 0.16} Z`} strokeWidth={1.8} opacity={0.7} />
    {[45, 135, 225, 315].map((a) => (
      <path key={a} d={`M0 0 L${Math.cos((a * Math.PI) / 180) * r * 0.7} ${Math.sin((a * Math.PI) / 180) * r * 0.7}`} strokeWidth={1.4} opacity={0.55} />
    ))}
  </g>
);

/** The full map artwork in map-local units. */
export const MapArt: React.FC<{mode: Mode; ink?: number; paper?: number; detail?: number; inkScale?: number}> = ({mode, ink = 1, paper = 1, detail = 1, inkScale = 1}) => {
  if (mode !== 'color') return <rect width={MAP_W} height={MAP_H} fill={paint(mode, '#000')} />;
  const I = tones.ink;
  const route = geo.route;
  const start = off(route[0]);
  const stipple: React.ReactNode[] = [];
  if (detail > 0.5) {
    for (let i = 0; i < 160; i++) {
      const k = Math.floor(hash(i, 3) * (route.length - 1));
      const [rx, ry] = off(route[k]);
      const side = hash(i, 4) < 0.5 ? -1 : 1;
      const dist = 40 + hash(i, 5) * 260 * (ry / 1300);
      stipple.push(<circle key={i} cx={rx + side * dist} cy={ry + (hash(i, 6) - 0.5) * 30} r={2.2 + hash(i, 7) * 1.6} fill={I} opacity={0.35} />);
    }
  }
  const smallTrees: React.ReactNode[] = [];
  if (detail > 0.5) {
    const r = geo.ridges[1];
    for (let i = 0; i < 14; i++) {
      const p = r[Math.floor(hash(i, 9) * (r.length - 2)) + 1];
      const [x, y] = off(p);
      const yy = y + 10 + hash(i, 10) * 40;
      smallTrees.push(
        <g key={i} stroke={I} fill="none" strokeWidth={2} opacity={0.6}>
          <path d={`M${x} ${yy} l0 -12`} />
          <ellipse cx={x} cy={yy - 18} rx={8} ry={7} />
        </g>,
      );
    }
  }
  return (
    <g>
      <rect width={MAP_W} height={MAP_H} fill={tones.paper} opacity={paper} />
      <image href={staticFile('textures/paper.jpg')} width={MAP_W} height={MAP_H} preserveAspectRatio="none" opacity={paper} />
      <g opacity={ink}>
        <rect x={70} y={70} width={MAP_W - 140} height={MAP_H - 140} fill="none" stroke={I} strokeWidth={4} opacity={0.55} />
        <rect x={88} y={88} width={MAP_W - 176} height={MAP_H - 176} fill="none" stroke={I} strokeWidth={1.6} opacity={0.45} strokeDasharray="2 10" />
        <Compass x={330} y={340} r={70} ink={I} />
        {geo.ridges.map((r, i) => (
          <g key={i}>
            <path d={smoothPoly(r)} fill="none" stroke={I} strokeWidth={(3.2 - i * 0.5) * inkScale} strokeLinecap="round" opacity={0.8 - i * 0.12} />
            <path d={hatches(r, 20 + i, 2 + i, 30 - i * 6)} stroke={I} strokeWidth={1.6} opacity={0.4} strokeLinecap="round" />
          </g>
        ))}
        {smallTrees}
        {stipple}
        {detail > 0.5 && (
          <g stroke={I} fill="none" strokeLinecap="round">
            {/* a river winding out of the left hills */}
            <path d="M180 1520 C380 1420 300 1280 520 1180 C700 1100 640 980 820 900 C900 868 980 860 1040 850" strokeWidth={3.2} opacity={0.6} />
            <path d="M228 1532 C420 1440 352 1300 560 1206 C740 1126 688 1006 860 928 C934 896 1000 888 1050 880" strokeWidth={2.2} opacity={0.5} />
            {/* ploughed fields */}
            {[[560, 1280, 10], [2020, 1060, -10], [430, 980, 8], [2060, 1400, 4]].map(([x, y, a], i) => (
              <g key={i} transform={`translate(${x} ${y}) rotate(${a})`} opacity={0.42}>
                <rect x={-90} y={-46} width={180} height={92} strokeWidth={2} />
                {[...Array(7)].map((_, j) => (
                  <path key={j} d={`M${-80 + j * 26} -38 l0 76`} strokeWidth={1.4} />
                ))}
              </g>
            ))}
            <path d="M120 760 C420 742 700 770 1000 748 C1300 726 1700 760 2280 736" strokeWidth={1.6} strokeDasharray="3 12" opacity={0.4} />
          </g>
        )}
        <path d={smoothPoly(route)} fill="none" stroke={I} strokeWidth={7 * inkScale} strokeDasharray={`${26 * Math.sqrt(inkScale)} ${18 * Math.sqrt(inkScale)}`} strokeLinecap="round" opacity={0.92} />
        <circle cx={start[0]} cy={start[1] - 20} r={20} fill="none" stroke={I} strokeWidth={4.5} />
        <circle cx={start[0]} cy={start[1] - 20} r={6} fill={I} />
        <TreeGlyph x={geo.tree.x} y={geo.tree.y} s={geo.tree.s} ink={I} w={inkScale} />
      </g>
    </g>
  );
};

// ---------------------------------------------------------------------------
// Folding: 3 columns × 2 rows. The right column is the anchored panel (held in his right... the
// near hand); the other columns swing open accordion-style to the left, the bottom row unfolds down.
// ---------------------------------------------------------------------------
const PW = MAP_W / 3, PH = MAP_H / 2;

export const MapPanels: React.FC<{
  mode: Mode;
  id: string;
  rowOpen: number; // 0 folded → 1 open
  colOpen1: number;
  colOpen0: number;
  flutter?: number;
  ink?: number;
  crease?: number;
  detail?: number;
  inkScale?: number;
}> = ({mode, id, rowOpen, colOpen1, colOpen0, flutter = 0, ink = 1, crease = 1, detail = 1, inkScale = 1}) => {
  const cr = Math.cos(Math.PI * (1 - rowOpen));
  const c1 = Math.cos(Math.PI * (1 - colOpen1));
  const c0 = Math.cos(Math.PI * (1 - colOpen0));
  const colM = (c: number): [number, number] => {
    if (c === 2) return [1, 0];
    const a1 = c1, e1 = 2 * PW * (1 - c1);
    if (c === 1) return [a1, e1];
    const a0 = c0, e0 = PW * (1 - c0);
    return [a1 * a0, a1 * e0 + e1];
  };
  const panels: React.ReactNode[] = [];
  for (const r of [1, 0]) {
    for (const c of [2, 1, 0]) {
      const [a, e] = colM(c);
      const d = r === 1 ? cr : 1;
      const f = r === 1 ? PH * (1 - cr) : 0;
      // flutter: the free column bends about its own hinge, so creases stay continuous
      const k = c === 0 ? flutter * 0.03 : 0;
      const front = a * d > 0;
      const edgeOn = 1 - Math.min(1, Math.abs(a * d));
      const x0 = c * PW, y0 = r * PH;
      panels.push(
        <g key={`${r}${c}`} transform={`matrix(${a} ${d * k} 0 ${d} ${e} ${f - PW * d * k})`}>
          <clipPath id={`${id}-c${r}${c}`}>
            <rect x={x0 - 0.5} y={y0 - 0.5} width={PW + 1} height={PH + 1} />
          </clipPath>
          {front ? (
            <g clipPath={`url(#${id}-c${r}${c})`}>
              <MapArt mode={mode} ink={ink} detail={detail} inkScale={inkScale} />
            </g>
          ) : (
            <rect x={x0} y={y0} width={PW} height={PH} fill={paint(mode, tones.paperBack)} />
          )}
          {mode === 'color' && (
            <>
              <rect x={x0} y={y0} width={PW} height={PH} fill="#5A4A3C" opacity={0.05 + edgeOn * 0.35 + (c === 1 ? 0.03 : 0)} />
              <rect x={x0} y={y0} width={PW} height={PH} fill={`url(#${id}-fold${c % 2})`} opacity={crease} />
            </>
          )}
        </g>,
      );
    }
  }
  return (
    <g>
      {mode === 'color' && (
        <defs>
          <linearGradient id={`${id}-fold0`} x1={0} y1={0} x2={1} y2={0}>
            <stop offset={0} stopColor="#000" stopOpacity={0.1} />
            <stop offset={0.12} stopColor="#000" stopOpacity={0} />
            <stop offset={0.88} stopColor="#fff" stopOpacity={0} />
            <stop offset={1} stopColor="#fff" stopOpacity={0.12} />
          </linearGradient>
          <linearGradient id={`${id}-fold1`} x1={0} y1={0} x2={1} y2={0}>
            <stop offset={0} stopColor="#fff" stopOpacity={0.14} />
            <stop offset={0.15} stopColor="#fff" stopOpacity={0} />
            <stop offset={0.85} stopColor="#000" stopOpacity={0} />
            <stop offset={1} stopColor="#000" stopOpacity={0.12} />
          </linearGradient>
        </defs>
      )}
      {panels}
      {mode === 'color' && rowOpen > 0.98 && colOpen0 > 0.98 && (
        <g stroke="#6B5A49" strokeWidth={3} opacity={0.35 * crease}>
          <path d={`M${PW} 0 L${PW} ${MAP_H} M${2 * PW} 0 L${2 * PW} ${MAP_H} M0 ${PH} L${MAP_W} ${PH}`} />
        </g>
      )}
    </g>
  );
};
