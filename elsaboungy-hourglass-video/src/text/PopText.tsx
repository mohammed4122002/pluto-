import { useCurrentFrame, useVideoConfig } from "remotion";
import { FONT } from "../fonts";
import { pop, popOut } from "../lib/anim";
import { T } from "../theme";

export type TextVariant = "white" | "yellow" | "blue" | "navyOnLight";

const VARIANTS: Record<
  TextVariant,
  { top: string; bottom: string; outline: string; extrude: string; gloss: number }
> = {
  white: { top: "#ffffff", bottom: "#d6eaff", outline: T.ink, extrude: "#061d52", gloss: 0.0 },
  yellow: { top: "#fff1a8", bottom: T.yellow, outline: T.ink, extrude: "#061d52", gloss: 0.55 },
  blue: { top: "#5fb0ff", bottom: T.blue, outline: "#ffffff", extrude: T.ink, gloss: 0.5 },
  navyOnLight: { top: "#2f86ff", bottom: "#0b47b8", outline: "#ffffff", extrude: "#0a2a6b", gloss: 0.45 },
};

/**
 * Glossy, outlined, extruded cartoon lettering. Each word pops in with a
 * bouncy spring (in reading order, right → left), floats gently, and can pop
 * out at `exitAt`.
 */
export const PopText: React.FC<{
  text: string;
  size: number;
  variant?: TextVariant;
  delay?: number;
  stagger?: number;
  exitAt?: number;
  stroke?: number;
  depth?: number;
  style?: React.CSSProperties;
}> = ({ text, size, variant = "white", delay = 0, stagger = 4, exitAt, stroke, depth, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const v = VARIANTS[variant];
  const sw = stroke ?? Math.round(size * 0.13);
  const dz = depth ?? Math.round(size * 0.07);
  const words = text.split(" ").filter(Boolean);
  if (!words.length) return null;

  const shadow = [
    ...Array.from({ length: dz }, (_, i) => `0 ${i + 1}px 0 ${v.extrude}`),
    `0 ${dz + 10}px ${Math.round(size * 0.18)}px rgba(4, 20, 60, 0.35)`,
  ].join(", ");

  const common: React.CSSProperties = {
    fontFamily: FONT,
    fontWeight: 800,
    fontSize: size,
    lineHeight: 1.25,
    whiteSpace: "nowrap",
    padding: `${size * 0.12}px ${size * 0.08}px ${size * 0.18}px`,
    display: "inline-block",
  };

  return (
    <div
      dir="rtl"
      style={{
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "wrap",
        gap: `0 ${size * 0.08}px`,
        ...style,
      }}
    >
      {words.map((w, i) => {
        const s = pop(frame, fps, delay + i * stagger, 190, 8.5);
        const out = exitAt !== undefined ? popOut(frame, exitAt + i * 2, 9) : 1;
        const scale = (0.25 + 0.75 * s) * out;
        const ty = (1 - s) * size * 0.55 + Math.sin((frame + i * 9) / 11) * size * 0.025;
        const rot = (1 - s) * (i % 2 ? 10 : -10) + Math.sin((frame + i * 13) / 17) * 1.2;
        const opacity = Math.min(1, s * 2.5) * (out > 0.02 ? 1 : 0);
        // a white shine band sliding across the word
        const shineX = ((frame * 2.2 - i * 25) % 260) - 80;
        return (
          <span
            key={i}
            style={{
              position: "relative",
              display: "inline-block",
              transform: `translateY(${ty}px) rotate(${rot}deg) scale(${scale})`,
              opacity,
            }}
          >
            <span
              style={{
                ...common,
                color: v.outline,
                WebkitTextStroke: `${sw}px ${v.outline}`,
                textShadow: shadow,
              }}
            >
              {w}
            </span>
            <span
              aria-hidden
              style={{
                ...common,
                position: "absolute",
                inset: 0,
                color: "transparent",
                backgroundImage: `linear-gradient(180deg, ${v.top} 18%, ${v.bottom} 82%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
              }}
            >
              {w}
            </span>
            <span
              aria-hidden
              style={{
                ...common,
                position: "absolute",
                inset: 0,
                color: "transparent",
                backgroundImage: `linear-gradient(180deg, rgba(255,255,255,${0.55 + v.gloss * 0.3}) 0%, rgba(255,255,255,0.0) 52%), linear-gradient(105deg, transparent ${shineX}%, rgba(255,255,255,0.85) ${shineX + 8}%, transparent ${shineX + 16}%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                opacity: 0.75,
              }}
            >
              {w}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Rounded yellow label with blue text — used for sublines. */
export const PillLabel: React.FC<{
  text: string;
  size: number;
  delay?: number;
  exitAt?: number;
  bg?: string;
  color?: string;
  style?: React.CSSProperties;
}> = ({ text, size, delay = 0, exitAt, bg = T.yellow, color = T.blueDeep, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!text) return null;
  const s = pop(frame, fps, delay, 160, 9);
  const out = exitAt !== undefined ? popOut(frame, exitAt, 9) : 1;
  return (
    <div style={{ display: "flex", justifyContent: "center", ...style }}>
      <div
        dir="rtl"
        style={{
          position: "relative",
          transform: `scale(${(0.3 + 0.7 * s) * out}) rotate(${(1 - s) * -8 - 1.5}deg)`,
          opacity: Math.min(1, s * 2.5) * (out > 0.02 ? 1 : 0),
          background:
            bg === T.yellow
              ? `linear-gradient(180deg, #fff0a0 0%, ${bg} 55%, ${T.yellowDeep} 100%)`
              : bg === T.blue
                ? `linear-gradient(180deg, #6db6ff 0%, ${bg} 58%, #0a3f9e 100%)`
                : bg,
          border: `${Math.round(size * 0.1)}px solid ${T.ink}`,
          borderRadius: 999,
          padding: `${size * 0.05}px ${size * 0.55}px ${size * 0.12}px`,
          boxShadow: `0 ${Math.round(size * 0.14)}px 0 ${T.ink}, 0 ${Math.round(size * 0.3)}px ${Math.round(size * 0.4)}px rgba(4,20,60,0.35)`,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: size,
          lineHeight: 1.35,
          color,
          whiteSpace: "nowrap",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "6%",
            right: "6%",
            top: "8%",
            height: "30%",
            borderRadius: 999,
            background: "rgba(255,255,255,0.55)",
          }}
        />
        <span style={{ position: "relative" }}>{text}</span>
      </div>
    </div>
  );
};
