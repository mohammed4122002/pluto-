import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Bubble, PopBurst, Sparkle } from "../art/Bubbles";
import { FoamWall } from "../art/Foam";
import type { SceneSpan } from "../config/timing";
import { clamp, easeInCubic, easeOutCubic, lerp, rng } from "../lib/math";
import { T } from "../theme";

/**
 * Every transition is centred on the cut and fully covers the frame on the
 * frames either side of it, so scenes simply switch underneath.
 * k runs 0 → 1 across the transition window; the cut is at k = 0.5.
 */
const cover = (k: number, inEnd: number, holdEnd: number, from: number, mid0: number, mid1: number, to: number) => {
  if (k < inEnd) return lerp(from, mid0, easeOutCubic(k / inEnd));
  if (k < holdEnd) return lerp(mid0, mid1, (k - inEnd) / (holdEnd - inEnd));
  return lerp(mid1, to, easeInCubic((k - holdEnd) / (1 - holdEnd)));
};

const SvgLayer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill>
    <svg width="100%" height="100%" viewBox="0 0 1080 1920" style={{ position: "absolute", inset: 0 }}>
      {children}
    </svg>
  </AbsoluteFill>
);

const ZoomFlash: React.FC<{ k: number }> = ({ k }) => {
  const o = clamp(1 - (Math.abs(k - 0.5) - 0.07) / 0.43) ** 1.4;
  const ring = easeOutCubic(clamp(k / 0.5));
  return (
    <>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 43%, #ffffff 0%, #ffffff ${30 + 50 * o}%, rgba(207,230,255,${o}) 100%)`,
          opacity: o,
        }}
      />
      <SvgLayer>
        <circle cx={540} cy={820} r={80 + ring * 900} fill="none" stroke="#ffffff" strokeWidth={30 * (1 - ring) + 4} opacity={1 - clamp((k - 0.5) * 2)} />
        <Sparkle x={540} y={820} s={220 * Math.sin(clamp(k) * Math.PI)} rot={k * 120} color={T.yellow} />
      </SvgLayer>
    </>
  );
};

const FoamWipe: React.FC<{ k: number }> = ({ k }) => {
  const h = 2350;
  const y = cover(k, 0.44, 0.56, 2000, -190, -330, -2600);
  const r = rng(4);
  return (
    <SvgLayer>
      <FoamWall y={y} height={h} width={1080} seed={11} />
      {Array.from({ length: 12 }, (_, i) => {
        const bx = r() * 1080;
        const lag = 120 + r() * 380;
        return <Bubble key={i} x={bx} y={y + h + lag - 40} r={18 + r() * 36} line="#ffffff" />;
      })}
    </SvgLayer>
  );
};

const BlobSwipe: React.FC<{ k: number }> = ({ k }) => {
  const w = 2300;
  const x = cover(k, 0.45, 0.55, 1180, -60, -1100, -2700); // left edge, moving right → left
  const r = rng(8);
  const edge = (xx: number) =>
    Array.from({ length: 16 }, (_, i) => ({ x: xx + (r() - 0.5) * 60, y: -60 + i * 135, r: 90 + r() * 60 }));
  const lead = edge(x);
  const trail = edge(x + w);
  return (
    <SvgLayer>
      <defs>
        <linearGradient id="blobFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4fa3ff" />
          <stop offset="1" stopColor="#0b47b8" />
        </linearGradient>
      </defs>
      {[...lead, ...trail].map((p, i) => (
        <circle key={`o${i}`} cx={p.x} cy={p.y} r={p.r + 9} fill={T.ink} />
      ))}
      <rect x={x} y={-100} width={w} height={2120} fill="url(#blobFill)" />
      {[...lead, ...trail].map((p, i) => (
        <circle key={`c${i}`} cx={p.x} cy={p.y} r={p.r} fill="url(#blueBall)" />
      ))}
      {lead.map((p, i) =>
        i % 2 ? <ellipse key={`h${i}`} cx={p.x - p.r * 0.35} cy={p.y - p.r * 0.4} rx={p.r * 0.22} ry={p.r * 0.12} fill="#fff" opacity={0.8} /> : null,
      )}
      {Array.from({ length: 14 }, (_, i) => (
        <Bubble key={`b${i}`} x={x + 200 + r() * (w - 400)} y={r() * 1920} r={24 + r() * 60} line="#ffffff" />
      ))}
      <rect x={x + 150} y={-100} width={60} height={2120} fill="#ffffff" opacity={0.15} />
    </SvgLayer>
  );
};

const Iris: React.FC<{ k: number }> = ({ k }) => {
  const R = k < 0.5 ? lerp(1250, 0, easeInCubic(clamp(k / 0.46))) : lerp(0, 1250, easeOutCubic(clamp((k - 0.54) / 0.46)));
  const cx = 540;
  const cy = 940;
  const star = Math.sin(clamp((k - 0.3) / 0.4) * Math.PI);
  return (
    <SvgLayer>
      <path
        d={`M-50,-50 H1130 V1970 H-50 Z M${cx + R},${cy} A${R},${R} 0 1 0 ${cx - R},${cy} A${R},${R} 0 1 0 ${cx + R},${cy} Z`}
        fill={T.blue}
        fillRule="evenodd"
      />
      {R > 2 && (
        <>
          <circle cx={cx} cy={cy} r={R + 14} fill="none" stroke={T.ink} strokeWidth={10} />
          <circle cx={cx} cy={cy} r={R + 4} fill="none" stroke={T.yellow} strokeWidth={22} />
          <circle cx={cx} cy={cy} r={R - 8} fill="none" stroke="#ffffff" strokeWidth={6} opacity={0.8} />
        </>
      )}
      <Sparkle x={cx} y={cy} s={180 * star} rot={k * 180} color={T.yellow} />
      <Sparkle x={cx + 160} y={cy - 140} s={70 * star} rot={-k * 200} color="#ffffff" />
      <Sparkle x={cx - 170} y={cy + 120} s={56 * star} rot={k * 160} color="#ffffff" />
    </SvgLayer>
  );
};

const BubblePop: React.FC<{ k: number }> = ({ k }) => {
  const grow = easeInCubic(clamp(k / 0.5));
  const r = lerp(500, 1500, grow);
  const white = k < 0.5 ? clamp((k - 0.2) / 0.28) : 1 - easeOutCubic(clamp((k - 0.56) / 0.44));
  const popK = clamp((k - 0.5) / 0.45);
  return (
    <>
      {k < 0.52 && (
        <SvgLayer>
          <Bubble x={540} y={900} r={r} line="#ffffff" />
        </SvgLayer>
      )}
      <AbsoluteFill style={{ background: "#ffffff", opacity: white }} />
      <SvgLayer>
        <PopBurst x={540} y={900} r={420} k={popK} color={T.yellow} />
        <PopBurst x={540} y={900} r={300} k={popK} color={T.blueLight} />
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          const d = 200 + popK * 900;
          return (
            <Bubble key={i} x={540 + Math.cos(a) * d} y={900 + Math.sin(a) * d} r={(34 - i * 1.5) * (1 - popK) * (popK > 0 ? 1 : 0)} line={T.blueLight} />
          );
        })}
      </SvgLayer>
    </>
  );
};

export const TransitionLayer: React.FC<{ spans: SceneSpan[] }> = ({ spans }) => {
  const frame = useCurrentFrame();
  return (
    <>
      {spans.slice(0, -1).map((s) => {
        const L = s.transitionOut.frames;
        if (!L || s.transitionOut.type === "none") return null;
        const cut = s.from + s.durationInFrames;
        const k = (frame - (cut - L / 2)) / L;
        if (k < 0 || k > 1) return null;
        switch (s.transitionOut.type) {
          case "zoomFlash":
            return <ZoomFlash key={s.id} k={k} />;
          case "foamWipe":
            return <FoamWipe key={s.id} k={k} />;
          case "blobSwipe":
            return <BlobSwipe key={s.id} k={k} />;
          case "iris":
            return <Iris key={s.id} k={k} />;
          case "bubblePop":
            return <BubblePop key={s.id} k={k} />;
          default:
            return null;
        }
      })}
    </>
  );
};
