import { Gradient, RingPattern } from "../art/Backgrounds";
import { Bubble, Sparkle } from "../art/Bubbles";
import { FoamCloud, cloudShape } from "../art/Foam";
import { Hourglass } from "../art/Hourglass";
import { clamp, lerp, rng } from "../lib/math";
import { foamState, spinAt } from "../state";
import { T } from "../theme";
import { PillLabel, PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

const HORIZON = 1330;
const VP = { x: 540, y: 560 };
const SLANT = 0.32; // wave tilt: x shift per px of depth
const ROLLER = Array.from({ length: 6 }, (_, i) => cloudShape(300 + i, 260));
const SMUDGES = (() => {
  const r = rng(13);
  return Array.from({ length: 16 }, () => ({
    x: r() * 1080,
    y: HORIZON + 30 + r() * 560,
    rx: 50 + r() * 90,
    ry: 14 + r() * 26,
  }));
})();
const FLOOR_SPARKS = (() => {
  const r = rng(29);
  return Array.from({ length: 14 }, () => ({ x: 60 + r() * 960, y: HORIZON + 50 + r() * 520, s: 22 + r() * 26, ph: r() }));
})();

const Tiles: React.FC<{ line: string; lineOpacity: number }> = ({ line, lineOpacity }) => {
  const rows = Array.from({ length: 9 }, (_, k) => HORIZON + (1920 - HORIZON) * (k / 8) ** 1.7);
  const cols = Array.from({ length: 15 }, (_, k) => -1260 + k * 260);
  return (
    <g stroke={line} strokeWidth={4} opacity={lineOpacity}>
      {rows.map((y, i) => (
        <line key={`r${i}`} x1={0} y1={y} x2={1080} y2={y} />
      ))}
      {cols.map((x, i) => {
        // line from the vanishing point through (x, 1920), clipped at the horizon
        const k = (HORIZON - VP.y) / (1920 - VP.y);
        return <line key={`c${i}`} x1={VP.x + (x - VP.x) * k} y1={HORIZON} x2={x} y2={1920} />;
      })}
    </g>
  );
};

/** 04 — a wave of foam cleans the floor into a mirror shine. */
export const ShineScene: React.FC<SceneProps> = ({ span, spans }) => {
  const { f, fps, t, D, clock, exitAt } = useScene(span, spans);
  const st = foamState(clock);

  const hx = 540;
  const hy = 1010;
  const scale = 0.76;
  const baseY = hy + 458 * scale; // where the hourglass stands

  // wave sweeps right → left
  const wk = clamp((f - 2) / (D * 0.72));
  const waveX = lerp(1250, -520, wk * (0.85 + 0.15 * wk));
  const xAt = (y: number) => waveX + (y - HORIZON) * SLANT;

  const cleanClip = `M${xAt(HORIZON)},${HORIZON} L2000,${HORIZON} L2000,1920 L${xAt(1920)},1920 Z`;
  const passedHourglass = xAt(baseY) < hx - 120;
  const shine = clamp((f - D * 0.62) / (D * 0.28));

  // bubbles shed by the wave
  const shed = Array.from({ length: 16 }, (_, i) => {
    const te = 6 + i * 4.2; // frame emitted
    const dt = (f - te) / fps;
    if (dt < 0) return null;
    const ewk = clamp((te - 2) / (D * 0.72));
    const ex = lerp(1250, -520, ewk * (0.85 + 0.15 * ewk));
    const ey = HORIZON + 80 + ((i * 97) % 480);
    const x = ex + (ey - HORIZON) * SLANT + 60 + Math.sin(dt * 3 + i) * 18;
    const y = ey - dt * 260 - 40;
    const r = (16 + ((i * 31) % 26)) * clamp(dt * 5);
    return { x, y, r, key: i };
  }).filter(Boolean) as { x: number; y: number; r: number; key: number }[];

  return (
    <>
      <Svg>
        {/* wall */}
        <Gradient top="#f4faff" bottom="#c4defc" height={HORIZON + 10} />
        <g opacity={0.55}>
          <path d="M650,120 L960,120 L860,880 L560,880 Z" fill="#ffffff" />
          <path d="M140,200 L380,200 L300,820 L70,820 Z" fill="#ffffff" opacity={0.6} />
        </g>
        <RingPattern seed={71} count={12} t={t} color={T.blueLight} opacity={0.18} />
        <rect x={0} y={HORIZON - 26} width={1080} height={30} fill="#9ec7f5" />
        <rect x={0} y={HORIZON - 30} width={1080} height={8} fill="#ffffff" opacity={0.8} />

        {/* dull floor */}
        <rect x={0} y={HORIZON} width={1080} height={1920 - HORIZON} fill="#a9b9cc" />
        <Tiles line="#8c9db3" lineOpacity={0.8} />
        {SMUDGES.map((s, i) => (
          <ellipse key={i} cx={s.x} cy={s.y} rx={s.rx} ry={s.ry} fill="#7f8ea3" opacity={0.45} filter="url(#blur6)" />
        ))}

        {/* clean, shiny floor revealed behind the wave */}
        <clipPath id="shine-clean">
          <path d={cleanClip} />
        </clipPath>
        <g clipPath="url(#shine-clean)">
          <Gradient top="#ffffff" bottom="#cfe6ff" />
          <Tiles line="#b8d6f7" lineOpacity={0.9} />
          {/* reflection */}
          <g opacity={0.24} transform={`translate(${hx} ${2 * baseY - hy}) scale(${scale} ${-scale})`}>
            <Hourglass top={st.top} bottom={st.bottom} flow={st.flow} t={t} spin={spinAt(t)} shadow={false} />
          </g>
          {[0, 1, 2].map((i) => (
            <path
              key={i}
              d={`M${120 + i * 330},${HORIZON + 40} l120,0 l-170,560 l-120,0 Z`}
              fill="#ffffff"
              opacity={0.5}
            />
          ))}
          {FLOOR_SPARKS.map((s, i) => {
            const k = (t * 0.9 + s.ph) % 1;
            return <Sparkle key={i} x={s.x} y={s.y} s={s.s * Math.sin(k * Math.PI) ** 2} rot={k * 90} color="#ffffff" />;
          })}
        </g>

        {/* hourglass */}
        <ellipse cx={hx} cy={baseY + 14} rx={250} ry={26} fill={T.ink} opacity={0.22} filter="url(#blur12)" />
        <g transform={`translate(${hx} ${hy}) scale(${scale})`}>
          <Hourglass top={st.top} bottom={st.bottom} flow={st.flow} t={t} spin={spinAt(t)} shine={shine > 0 && shine < 1 ? shine : -1} shadow={false} />
        </g>
        {passedHourglass && (
          <Sparkle x={hx - 120} y={hy - 170} s={70 * Math.sin(clamp((f - D * 0.6) / 14) * Math.PI)} rot={f * 3} />
        )}

        {/* the foam roller */}
        {ROLLER.map((puffs, i) => {
          const y = HORIZON + 20 + i * 120;
          const depth = (y - HORIZON) / (1920 - HORIZON);
          return (
            <FoamCloud
              key={i}
              puffs={puffs}
              x={xAt(y) + Math.sin(t * 6 + i) * 10}
              y={y}
              scale={0.45 + depth * 0.75}
              rot={Math.sin(t * 4 + i) * 8}
              squish={Math.sin(t * 7 + i * 2) * 0.06}
            />
          );
        })}
        {shed.map((b) => (
          <Bubble key={b.key} x={b.x} y={b.y} r={b.r} line={T.blueLight} />
        ))}
      </Svg>
      <TextSlot top={180}>
        <PopText text={span.headline} size={176} variant="navyOnLight" delay={8} exitAt={exitAt} />
      </TextSlot>
      <TextSlot top={430}>
        <PillLabel text={span.subline} size={70} delay={20} exitAt={exitAt + 3} />
      </TextSlot>
    </>
  );
};
