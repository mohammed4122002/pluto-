import { RingPattern, SoftDots, Sunburst } from "../art/Backgrounds";
import { RisingBubbles, Sparkle, Twinkles } from "../art/Bubbles";
import { Hourglass } from "../art/Hourglass";
import { LogoMark } from "../art/LogoMark";
import { OrbitRibbon } from "../art/Ribbon";
import { pop } from "../lib/anim";
import { clamp, easeInCubic, easeOutBack } from "../lib/math";
import { foamState, spinAt } from "../state";
import { T } from "../theme";
import { Svg, useScene, type SceneProps } from "./common";

const BX = 540;
const BY = 900;
const BR = 380;

const RIBBONS = [
  { rx: 560, ry: 250, tilt: -10, speed: 1.5, len: 2.5, width: 30, color: T.yellow, edge: T.ink, phase: 0.6 },
  { rx: 520, ry: 270, tilt: 12, speed: -1.2, len: 2.1, width: 22, color: "#ffffff", edge: T.blue, phase: 2.6 },
];

/** 05 — a big glossy bubble pops in with the logo inside; ribbons wrap around it. */
export const BrandScene: React.FC<SceneProps> = ({ span, spans }) => {
  const { f, fps, t, p, clock } = useScene(span, spans);
  const st = foamState(clock);

  const bub = pop(f, fps, 2, 120, 8);
  const grow = 1 + easeInCubic(clamp((p - 0.86) / 0.14)) * 0.35; // swells before it pops
  const r = BR * bub * grow;
  const wob = Math.sin(t * 5) * 0.025 * bub;
  const logo = pop(f, fps, 12, 150, 9);
  const reveal = clamp((f - 8) / 28);
  const ring = easeOutBack(clamp((f - 14) / 14));

  const ribbon = (layer: "back" | "front") =>
    RIBBONS.map((rb, i) => (
      <OrbitRibbon
        key={i}
        cx={BX}
        cy={BY}
        rx={rb.rx * grow}
        ry={rb.ry * grow}
        tilt={rb.tilt}
        head={rb.phase + t * rb.speed}
        length={rb.len}
        width={rb.width}
        color={rb.color}
        edge={rb.edge}
        layer={layer}
        reveal={reveal}
      />
    ));

  return (
    <>
      <Svg>
        <Sunburst cx={BX} cy={BY} inner="#2f86ff" outer="#04185a" ray="#ffffff" rayOpacity={0.09} rays={24} rotation={t * 7} />
        <SoftDots seed={58} count={16} t={t} rMin={30} rMax={110} opacity={0.5} />
        <RingPattern seed={23} count={14} t={t} color={T.yellow} opacity={0.22} />
        <RisingBubbles seed={88} count={12} t={t} x0={20} x1={1060} y0={2050} y1={-150} rMin={12} rMax={40} speed={150} appear={clamp(f / 20)} />

        {/* soft halo */}
        <circle cx={BX} cy={BY} r={r * 1.35} fill="url(#softGlow)" opacity={0.35 * bub} />
        {ribbon("back")}

        {/* bubble body */}
        <g transform={`translate(${BX} ${BY}) scale(${1 + wob} ${1 - wob})`}>
          <circle r={r} fill="url(#bubbleBody)" />
          <circle r={r * 0.97} fill="#ffffff" opacity={0.1} />
        </g>
      </Svg>

      {/* logo sits inside the bubble, never distorted */}
      <div
        style={{
          position: "absolute",
          left: BX - 330,
          top: BY - 210,
          width: 660,
          height: 420,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${logo * grow}) translateY(${Math.sin(t * 2.4) * 6}px)`,
          opacity: clamp(logo * 3),
        }}
      >
        <LogoMark width={600} height={360} />
      </div>

      <Svg>
        {/* bubble front: rim, iridescence and highlights over the logo */}
        <g transform={`translate(${BX} ${BY}) scale(${1 + wob} ${1 - wob})`}>
          <circle r={r * 0.95} fill="none" stroke="url(#bubbleIris)" strokeWidth={r * 0.05} opacity={0.6} />
          <circle r={r} fill="none" stroke="#ffffff" strokeWidth={10} />
          <circle r={r + 7} fill="none" stroke={T.ink} strokeWidth={5} opacity={0.35} />
          <path
            d={`M ${-r * 0.78} ${-r * 0.22} A ${r * 0.82} ${r * 0.82} 0 0 1 ${-r * 0.2} ${-r * 0.78}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth={r * 0.07}
            strokeLinecap="round"
            opacity={0.9}
          />
          <circle cx={-r * 0.05} cy={-r * 0.84} r={r * 0.04} fill="#fff" />
          <path
            d={`M ${r * 0.72} ${r * 0.3} A ${r * 0.78} ${r * 0.78} 0 0 1 ${r * 0.32} ${r * 0.7}`}
            fill="none"
            stroke="#ffffff"
            strokeWidth={r * 0.04}
            strokeLinecap="round"
            opacity={0.65}
          />
        </g>
        {ribbon("front")}
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2 + 0.4;
          return (
            <Sparkle
              key={i}
              x={BX + Math.cos(a) * (BR + 70) * ring}
              y={BY + Math.sin(a) * (BR + 70) * ring}
              s={46 * ring * (1 - clamp((f - 34) / 14))}
              rot={f * 4}
              color={i % 2 ? T.yellow : "#ffffff"}
            />
          );
        })}
        <Twinkles seed={12} count={10} t={t} x0={80} x1={1000} y0={300} y1={1500} size={36} color="#ffffff" />

        {/* the hourglass keeps ticking below */}
        <g transform={`translate(${BX} ${1560 + Math.sin(t * 3) * 10}) scale(${0.3 * pop(f, fps, 18, 140, 9)})`}>
          <Hourglass top={st.top} bottom={st.bottom} flow={st.flow} t={t} spin={spinAt(t)} />
        </g>
      </Svg>
    </>
  );
};
