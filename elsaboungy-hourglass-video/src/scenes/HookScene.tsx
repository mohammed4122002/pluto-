import { spring } from "remotion";
import { Sunburst, RingPattern, SoftDots } from "../art/Backgrounds";
import { RisingBubbles, Twinkles } from "../art/Bubbles";
import { FoamCloud, cloudShape } from "../art/Foam";
import { Hourglass } from "../art/Hourglass";
import { squash } from "../lib/anim";
import { clamp, easeInCubic, easeOutCubic, lerp } from "../lib/math";
import { foamState, spinAt } from "../state";
import { T } from "../theme";
import { PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

const puffL = cloudShape(3, 220);
const puffR = cloudShape(8, 200);

/** 01 — the hourglass drops in and bounces on a blue sunburst. */
export const HookScene: React.FC<SceneProps> = ({ span, spans }) => {
  const { f, fps, t, p, clock, exitAt } = useScene(span, spans);
  const st = foamState(clock);

  const drop = spring({ frame: f - 2, fps, config: { damping: 9, stiffness: 120, mass: 1 } });
  const restY = 1150;
  const y = lerp(-650, restY, drop);
  const { sx, sy } = squash(drop, 3);
  const scale = 0.9;

  // landing puffs of foam on both sides of the base
  const land = clamp((f - 12) / 16);
  const puff = land <= 0 ? 0 : Math.sin(Math.min(1, land * 1.6) * Math.PI * 0.5) * (1 - easeInCubic(clamp((f - 34) / 14)));

  // camera pushes into the neck for the zoom transition
  const push = easeInCubic(clamp((p - 0.8) / 0.2));
  const cam = lerp(1, 4.4, push);

  const spin = spinAt(t) + (1 - Math.min(drop, 1)) * 2.6;

  return (
    <>
      <Svg>
        <Sunburst cx={540} cy={1050} inner="#3b95ff" outer="#062a78" ray="#ffffff" rayOpacity={0.13} rotation={t * 9} />
        <SoftDots seed={4} count={14} t={t} rMin={40} rMax={120} opacity={0.6} />
        <RingPattern seed={9} count={16} t={t} color="#ffffff" opacity={0.14} />
        <g transform={`translate(540 ${restY}) scale(${cam}) translate(-540 ${-restY})`}>
          <RisingBubbles seed={12} count={10} t={t} x0={40} x1={1040} y0={2050} y1={-120} rMin={16} rMax={58} speed={170} appear={clamp(f / 24)} />
          <g transform={`translate(540 ${y}) scale(${scale * sx} ${scale * sy})`}>
            <Hourglass top={st.top} bottom={st.bottom} flow={st.flow} t={t} spin={spin} />
          </g>
          <FoamCloud puffs={puffL} x={540 - 330} y={restY + 455} scale={puff * 0.9} squish={0.05} />
          <FoamCloud puffs={puffR} x={540 + 340} y={restY + 460} scale={puff * 0.85} squish={0.05} />
          <g opacity={clamp((f - 16) / 8)}>
            <Twinkles seed={21} count={8} t={t} x0={190} x1={890} y0={700} y1={1520} size={38} />
          </g>
        </g>
      </Svg>
      <TextSlot top={210}>
        <PopText text={span.headline} size={190} variant="white" delay={14} exitAt={exitAt} />
      </TextSlot>
      {/* the opening sweep of light across the sunburst */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(115deg, transparent ${lerp(-30, 120, easeOutCubic(clamp(f / 40)))}%, rgba(255,255,255,0.18) ${lerp(-20, 130, easeOutCubic(clamp(f / 40)))}%, transparent ${lerp(-10, 140, easeOutCubic(clamp(f / 40)))}%)`,
          mixBlendMode: "screen",
        }}
      />
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 220px ${T.navy}88` }} />
    </>
  );
};
