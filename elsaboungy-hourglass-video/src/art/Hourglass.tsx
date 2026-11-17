import { useId, useMemo } from "react";
import { clamp, rng } from "../lib/math";
import { T } from "../theme";

/**
 * Cartoon hourglass, drawn around (0,0). Total height ≈ 1000 units:
 * glass from y = -H..H, caps centred at ±CAP_Y.
 */
export const H = 372;
const CAP_Y = 402;
const CAP_HW = 370; // cap half width
const CAP_HH = 40; // cap half height
const PILLAR_R = 328;
const TOP_FILL_U = 0.84; // upper bulb is "full" at this height
const BOTTOM_FILL_U = 0.92;

/** Glass half-width at u = |y| / H (0 = neck, 1 = cap): two round, chubby bulbs. */
const NECK = 26;
const W_MAX = 292;
export const halfWidth = (u: number) => {
  const k = Math.min(1, Math.max(0, (u - 0.035) / 0.965));
  const d = Math.abs((k - 0.54) / 0.54);
  const e = k < 0.54 ? 1.7 : 2.3; // softer funnel into the neck, round shoulders
  const shape = Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, d), e)), 1 / e);
  return NECK + (W_MAX - NECK) * shape;
};

const glassPath = (() => {
  const N = 140;
  const right: string[] = [];
  const left: string[] = [];
  for (let i = 0; i <= N; i++) {
    const y = -H + (2 * H * i) / N;
    const w = halfWidth(Math.abs(y) / H);
    right.push(`${w.toFixed(1)},${y.toFixed(1)}`);
    left.unshift(`${(-w).toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${right.join(" L")} L${left.join(" L")} Z`;
})();

// Area tables so foam "amounts" look volume-correct.
const STEPS = 240;
const areaTop: number[] = [0];
for (let i = 1; i <= STEPS; i++) {
  const u = i / STEPS;
  areaTop.push(areaTop[i - 1] + halfWidth(u) / STEPS);
}
const areaUpTo = (u: number) => areaTop[Math.round(clamp(u) * STEPS)];
const solve = (target: number, f: (u: number) => number) => {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
};
/** Upper bulb: surface height u for a fill amount. */
const topSurfaceU = (amount: number) =>
  solve(clamp(amount) * areaUpTo(TOP_FILL_U), (u) => areaUpTo(u));
/** Lower bulb: pile depth d (from the base) for a fill amount. */
const bottomDepth = (amount: number) =>
  solve(clamp(amount) * (areaUpTo(1) - areaUpTo(1 - BOTTOM_FILL_U)), (d) => areaUpTo(1) - areaUpTo(1 - d));

type Dot = { x: number; y: number; r: number };
const buildTexture = (): Dot[] => {
  const r = rng(77);
  const out: Dot[] = [];
  for (let i = 0; i < 90; i++) {
    const y = (r() * 2 - 1) * (H - 20);
    const w = halfWidth(Math.abs(y) / H) - 22;
    if (w < 10) continue;
    out.push({ x: (r() * 2 - 1) * w, y, r: 7 + r() * 13 });
  }
  return out;
};

const bumpsAlong = (
  y: (x: number) => number,
  halfW: number,
  seed: number,
  step = 34,
): Dot[] => {
  const r = rng(seed);
  const out: Dot[] = [];
  for (let x = -halfW - 10; x <= halfW + 10; x += step) {
    const jx = x + (r() - 0.5) * 10;
    out.push({ x: jx, y: y(jx) + 6, r: 21 + r() * 12 });
  }
  return out;
};

export type HourglassProps = {
  top: number;
  bottom: number;
  flow: number;
  /** seconds (drives stream + shimmer) */
  t: number;
  /** 2.5D spin of the pillars, radians */
  spin?: number;
  /** 0..1 diagonal shine sweep across the glass (-1 = off) */
  shine?: number;
  /** draw the soft floor shadow */
  shadow?: boolean;
  /** outline colour */
  ink?: string;
  /** flip rotation in degrees (0..180). Lighting stays put, the body turns. */
  flip?: number;
};

const Pillar: React.FC<{ x: number; depth: number; ink: string }> = ({ x, depth, ink }) => {
  const sx = 0.82 + 0.18 * ((depth + 1) / 2);
  const len = CAP_Y - CAP_HH + 4;
  return (
    <g transform={`translate(${x} 0) scale(${sx} 1)`} opacity={depth < 0 ? 0.92 : 1}>
      <rect x={-18} y={-len} width={36} height={len * 2} rx={18} fill="url(#pillarYellow)" stroke={ink} strokeWidth={7} />
      <rect x={-5} y={-len + 30} width={8} height={len * 2 - 60} rx={4} fill="#fff" opacity={0.6} />
      {[-1, 1].map((s) => (
        <ellipse key={s} cx={0} cy={s * (len - 34)} rx={27} ry={11} fill={T.yellowDeep} stroke={ink} strokeWidth={6} />
      ))}
      <circle r={30} fill="url(#yellowBall)" stroke={ink} strokeWidth={7} />
    </g>
  );
};

/** Cap body (symmetric top/bottom so a 180° flip lines up perfectly). */
const CapBody: React.FC<{ y: number; spin: number; ink: string; clip: string }> = ({ y, spin, ink, clip }) => {
  const span = 2 * CAP_HW + 160;
  const sx = ((((spin * 260) % span) + span) % span) - CAP_HW - 80;
  return (
    <g transform={`translate(0 ${y})`}>
      <clipPath id={clip}>
        <rect x={-CAP_HW} y={-CAP_HH} width={CAP_HW * 2} height={CAP_HH * 2} rx={CAP_HH} />
      </clipPath>
      <rect x={-CAP_HW} y={-CAP_HH} width={CAP_HW * 2} height={CAP_HH * 2} rx={CAP_HH} fill={T.blue} />
      <g clipPath={`url(#${clip})`}>
        <rect x={-CAP_HW} y={-7} width={CAP_HW * 2} height={14} fill={T.yellow} />
        <rect x={sx} y={-CAP_HH - 10} width={46} height={CAP_HH * 2 + 20} fill="#fff" opacity={0.22} transform="skewX(-22)" />
      </g>
      <rect x={-CAP_HW} y={-CAP_HH} width={CAP_HW * 2} height={CAP_HH * 2} rx={CAP_HH} fill="none" stroke={ink} strokeWidth={8} />
      <circle cx={0} cy={(y < 0 ? -1 : 1) * (CAP_HH + 16)} r={26} fill="url(#yellowBall)" stroke={ink} strokeWidth={7} />
    </g>
  );
};

/** Lighting on a cap — lives in the "light" layer, which never turns upside down. */
const CapLight: React.FC<{ y: number }> = ({ y }) => (
  <g transform={`translate(0 ${y})`}>
    <rect x={-CAP_HW + 6} y={-CAP_HH + 4} width={CAP_HW * 2 - 12} height={CAP_HH - 4} rx={(CAP_HH - 4) / 2} fill="#7cbcff" opacity={0.55} />
    <rect x={-CAP_HW + 34} y={-CAP_HH + 10} width={CAP_HW * 2 - 68} height={17} rx={8.5} fill="#fff" opacity={0.6} />
    <rect x={-CAP_HW + 10} y={6} width={CAP_HW * 2 - 20} height={CAP_HH - 12} rx={(CAP_HH - 12) / 2} fill="#062b7a" opacity={0.28} />
  </g>
);

export const Hourglass: React.FC<HourglassProps> = ({
  top,
  bottom,
  flow,
  t,
  spin = 0,
  shine = -1,
  shadow = true,
  ink = T.ink,
  flip = 0,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clipId = `hg-glass-${uid}`;
  const texture = useMemo(buildTexture, []);

  // ---- upper foam -----------------------------------------------------
  const hasTop = top > 0.004;
  const uS = topSurfaceU(top);
  const surfY = -uS * H;
  const wS = halfWidth(uS);
  const dip = 30 * clamp(flow) * clamp(top * 4);
  const topSurf = (x: number) => surfY + dip * Math.max(0, 1 - (x / (0.65 * wS)) ** 2);
  const topBumps = hasTop ? bumpsAlong(topSurf, wS, 5) : [];
  const topFloor = topBumps.length ? Math.min(0, Math.max(...topBumps.map((b) => b.y)) + 10) : 0;

  // ---- lower pile -----------------------------------------------------
  const hasBottom = bottom > 0.004;
  const d = bottomDepth(bottom);
  const baseY = H - d * H;
  const wB = halfWidth(clamp(1 - d));
  const mound = Math.min(64, 18 + d * H * 0.35);
  const botSurf = (x: number) => baseY - mound * Math.max(0, 1 - (x / Math.max(wB, 60)) ** 2);
  const botBumps = hasBottom ? bumpsAlong(botSurf, wB, 9) : [];
  const peakY = hasBottom ? botSurf(0) : H - 10;

  // ---- stream ---------------------------------------------------------
  const streamOn = clamp(flow) * (hasTop ? 1 : 0);
  const sy0 = -20;
  const sy1 = peakY - 6;
  const streamDots = Array.from({ length: 16 }, (_, i) => {
    const u = (i / 16 + t * 1.5) % 1;
    const gate = ((i * 7919) % 100) / 100;
    return {
      x: Math.sin(t * 7 + i * 1.7) * 3.5,
      y: sy0 + (sy1 - sy0) * u,
      r: (7 + ((i * 37) % 6)) * (gate < streamOn ? 1 : 0),
    };
  });
  const splash = Array.from({ length: 5 }, (_, i) => {
    const u = (t * 1.4 + i / 5) % 1;
    const dir = i % 2 === 0 ? 1 : -1;
    return {
      x: dir * (14 + u * (36 + i * 6)),
      y: peakY - Math.sin(Math.PI * u) * (26 + i * 5),
      r: (6 + (i % 3) * 2) * (1 - u * 0.6) * (streamOn > 0.4 && hasBottom ? 1 : 0),
    };
  });

  // ---- pillars (2.5D) -------------------------------------------------
  const pillars = [0, 1, 2].map((i) => {
    const a = spin + Math.PI / 3 + (i * 2 * Math.PI) / 3;
    return { x: PILLAR_R * Math.sin(a), depth: Math.cos(a), key: i };
  });
  const back = pillars.filter((p) => p.depth < 0);
  const front = pillars.filter((p) => p.depth >= 0).sort((a, b) => a.depth - b.depth);

  // glass highlight streaks (left = big, right = small)
  const streak = (u0: number, u1: number, sign: number, side: number, inset: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= 16; i++) {
      const u = u0 + ((u1 - u0) * i) / 16;
      pts.push(`${(side * (halfWidth(u) - inset)).toFixed(1)},${(sign * u * H).toFixed(1)}`);
    }
    return `M${pts.join(" L")}`;
  };

  const shineX = shine >= 0 ? -420 + shine * 840 : -9999;

  // Lighting turns with the body until 90°, then jumps (invisibly, at zero
  // opacity) so it is upright again when the flip lands.
  const lightRot = flip <= 90 ? flip : flip - 180;
  const lightOpacity = Math.abs(Math.cos((flip * Math.PI) / 180)) ** 1.5;

  return (
    <g>
      {shadow && (
        <ellipse cx={0} cy={CAP_Y + CAP_HH + 34} rx={400} ry={36} fill={T.ink} opacity={0.28} filter="url(#blur12)" />
      )}
      <g transform={`rotate(${flip})`}>
        {back.map((p) => (
          <Pillar key={p.key} x={p.x} depth={p.depth} ink={ink} />
        ))}

        {/* glass body tint */}
        <path d={glassPath} fill="url(#glassFill)" />

        <clipPath id={clipId}>
          <path d={glassPath} />
        </clipPath>
        <g clipPath={`url(#${clipId})`}>
          {/* upper foam */}
          {hasTop && (
            <g>
              {topBumps.map((b, i) => (
                <circle key={`o${i}`} cx={b.x} cy={b.y} r={b.r + 5} fill={T.foamLine} />
              ))}
              {topBumps.map((b, i) => (
                <rect key={`f${i}`} x={b.x - b.r} y={b.y} width={b.r * 2} height={Math.max(0, 2 - b.y)} fill="#fff" />
              ))}
              <rect x={-360} y={topFloor} width={720} height={Math.max(0, 2 - topFloor)} fill="url(#foamBody)" />
              {topBumps.map((b, i) => (
                <circle key={`b${i}`} cx={b.x} cy={b.y} r={b.r} fill="url(#foamBall)" />
              ))}
              {texture
                .filter((d) => d.y < -6 && d.y > topSurf(d.x) + d.r + 14)
                .map((d, i) => (
                  <g key={`t${i}`}>
                    <circle cx={d.x} cy={d.y} r={d.r} fill="none" stroke={T.foamLine} strokeWidth={3} />
                    <circle cx={d.x - d.r * 0.35} cy={d.y - d.r * 0.35} r={d.r * 0.22} fill="#fff" />
                  </g>
                ))}
            </g>
          )}

          {/* stream */}
          {streamOn > 0.02 && (
            <g>
              <line x1={0} y1={sy0} x2={0} y2={sy1} stroke="#fff" strokeWidth={9 * streamOn} strokeLinecap="round" opacity={0.9} />
              {streamDots.map((s, i) => (
                <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="url(#foamBall)" stroke={T.foamLine} strokeWidth={2.5} />
              ))}
            </g>
          )}

          {/* lower pile */}
          {hasBottom && (
            <g>
              {botBumps.map((b, i) => (
                <circle key={`o${i}`} cx={b.x} cy={b.y} r={b.r + 5} fill={T.foamLine} />
              ))}
              {/* fill under the curved surface */}
              {botBumps.map((b, i) => (
                <rect key={`f${i}`} x={b.x - b.r} y={b.y} width={b.r * 2} height={H - b.y + 10} fill="#fff" />
              ))}
              <rect x={-360} y={Math.max(...botBumps.map((b) => b.y)) + 10} width={720} height={H + 40} fill="url(#foamBody)" />
              {botBumps.map((b, i) => (
                <circle key={`b${i}`} cx={b.x} cy={b.y} r={b.r} fill="url(#foamBall)" />
              ))}
              {texture
                .filter((d) => d.y > 6 && d.y > botSurf(d.x) + d.r + 14)
                .map((d, i) => (
                  <g key={`t${i}`}>
                    <circle cx={d.x} cy={d.y} r={d.r} fill="none" stroke={T.foamLine} strokeWidth={3} />
                    <circle cx={d.x - d.r * 0.35} cy={d.y - d.r * 0.35} r={d.r * 0.22} fill="#fff" />
                  </g>
                ))}
              {splash.map((s, i) =>
                s.r > 0 ? <circle key={`s${i}`} cx={s.x} cy={s.y} r={s.r} fill="#fff" stroke={T.foamLine} strokeWidth={2.5} /> : null,
              )}
            </g>
          )}
        </g>
      </g>

      {/* glass lighting (screen-fixed) */}
      <g transform={`rotate(${lightRot})`} opacity={lightOpacity}>
        <g clipPath={`url(#${clipId})`}>
          <rect x={-360} y={-H} width={720} height={2 * H} fill="url(#glassSheen)" />
          {shine >= 0 && (
            <rect x={shineX} y={-H - 60} width={120} height={2 * H + 120} fill="url(#shineBand)" transform="skewX(-18)" />
          )}
        </g>
        <path d={streak(0.36, 0.86, -1, -1, 42)} fill="none" stroke="#fff" strokeWidth={20} strokeLinecap="round" opacity={0.9} />
        <path d={streak(0.4, 0.82, 1, -1, 42)} fill="none" stroke="#fff" strokeWidth={16} strokeLinecap="round" opacity={0.75} />
        <path d={streak(0.56, 0.72, -1, 1, 40)} fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" opacity={0.6} />
        <path d={streak(0.5, 0.64, 1, 1, 40)} fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" opacity={0.5} />
        <circle cx={-(halfWidth(0.93) - 52)} cy={-0.93 * H} r={9} fill="#fff" opacity={0.9} />
        <circle cx={-(halfWidth(0.25) - 18)} cy={0.25 * H} r={7} fill="#fff" opacity={0.8} />
      </g>

      <g transform={`rotate(${flip})`}>
        <path d={glassPath} fill="none" stroke={ink} strokeWidth={8} strokeLinejoin="round" />
        {front.map((p) => (
          <Pillar key={p.key} x={p.x} depth={p.depth} ink={ink} />
        ))}
        <CapBody y={-CAP_Y} spin={spin} ink={ink} clip={`${clipId}-ct`} />
        <CapBody y={CAP_Y} spin={spin + 1.3} ink={ink} clip={`${clipId}-cb`} />
      </g>
      <g transform={`rotate(${lightRot})`} opacity={lightOpacity}>
        <CapLight y={-CAP_Y} />
        <CapLight y={CAP_Y} />
      </g>
      <g transform={`rotate(${flip})`}>
        {[-1, 1].map((s) => (
          <rect key={s} x={-CAP_HW} y={s * CAP_Y - CAP_HH} width={CAP_HW * 2} height={CAP_HH * 2} rx={CAP_HH} fill="none" stroke={ink} strokeWidth={8} />
        ))}
      </g>
    </g>
  );
};

/** Vertical extent of the drawing (for layout). */
export const HOURGLASS_TOP = -CAP_Y - CAP_HH - 42;
export const HOURGLASS_BOTTOM = CAP_Y + CAP_HH + 28;
