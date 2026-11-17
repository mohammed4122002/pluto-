import { spring } from "remotion";
import { RingPattern, Sunburst } from "../art/Backgrounds";
import { BurstBubbles, RisingBubbles, Sparkle, Twinkles } from "../art/Bubbles";
import { FoamCloud, cloudShape } from "../art/Foam";
import { Hourglass } from "../art/Hourglass";
import { clamp, easeOutBack, easeOutCubic, lerp } from "../lib/math";
import { FLIP_WINDOW, foamState } from "../state";
import { PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

const CLOUDS = Array.from({ length: 9 }, (_, i) => cloudShape(100 + i, 190));

/** 03 — the hourglass flips, foam swirls around it and bubbles burst out (yellow). */
export const BurstScene: React.FC<SceneProps> = ({ span, spans }) => {
  const { f, fps, t, D, clock, exitAt } = useScene(span, spans);
  const st = foamState(clock);

  const cx = 540;
  const cy = 1130;
  const flipStart = FLIP_WINDOW[0] * D;
  const flipEnd = FLIP_WINDOW[1] * D;
  const flipK = clamp((f - flipStart) / (flipEnd - flipStart));
  const hop = Math.sin(flipK * Math.PI) * 170;
  const stretch = Math.sin(flipK * Math.PI) * 0.07;
  const land = spring({ frame: f - flipEnd, fps, config: { damping: 7, stiffness: 220, mass: 0.7 } });
  const landSquash = f >= flipEnd ? (1 - land) * 0.22 : 0;
  const sx = 1 - stretch + landSquash;
  const sy = 1 + stretch - landSquash;
  const scale = 0.76;

  // Foam swirl: clouds fly in from off-screen and orbit around the hourglass.
  const enter = easeOutCubic(clamp(f / 34));
  const leave = clamp((f - (D - 22)) / 22);
  const rx = lerp(1150, 450, enter) + leave * 600;
  const ry = rx * 0.26;
  const tilt = -12;
  const clouds = CLOUDS.map((puffs, i) => {
    const a = (i / CLOUDS.length) * Math.PI * 2 + t * 1.7;
    const depth = Math.sin(a);
    const lx = Math.cos(a) * rx;
    const ly = depth * ry;
    const rad = (tilt * Math.PI) / 180;
    return {
      puffs,
      x: cx + lx * Math.cos(rad) - ly * Math.sin(rad),
      y: cy - 40 + lx * Math.sin(rad) + ly * Math.cos(rad),
      depth,
      s: (0.55 + 0.28 * depth) * clamp(enter * 1.4),
      rot: Math.cos(a) * 12,
      key: i,
    };
  });
  const back = clouds.filter((c) => c.depth < 0);
  const front = clouds.filter((c) => c.depth >= 0);

  const burstDt = (f - flipEnd + 2) / fps;
  const star = easeOutBack(clamp((f - flipEnd + 1) / 8)) * (1 - clamp((f - flipEnd - 6) / 10));

  return (
    <>
      <Svg>
        <Sunburst cx={cx} cy={cy - 60} inner="#fff1a0" outer="#f29a00" ray="#ffffff" rayOpacity={0.32} rays={18} rotation={-t * 12} />
        <RingPattern seed={44} count={18} t={t} color="#ffffff" opacity={0.3} />
        <RisingBubbles seed={52} count={9} t={t} x0={20} x1={1060} y0={2050} y1={-150} rMin={16} rMax={52} speed={190} />

        {back.map((c) => (
          <FoamCloud key={c.key} puffs={c.puffs} x={c.x} y={c.y} scale={c.s} rot={c.rot} squish={Math.sin(t * 5 + c.key) * 0.05} />
        ))}

        <g transform={`translate(${cx} ${cy - hop}) scale(${scale * sx} ${scale * sy})`}>
          <Hourglass top={st.top} bottom={st.bottom} flow={st.flow} t={t} spin={(2 * Math.PI) / 3} flip={st.flip} shadow={false} />
        </g>
        <ellipse cx={cx} cy={cy + 430 * scale + 20} rx={300 * (1 - hop / 400)} ry={30} fill="#a85a00" opacity={0.25} filter="url(#blur12)" />

        {front.map((c) => (
          <FoamCloud key={c.key} puffs={c.puffs} x={c.x} y={c.y} scale={c.s} rot={c.rot} squish={Math.sin(t * 5 + c.key) * 0.05} />
        ))}

        <BurstBubbles seed={7} count={24} dt={burstDt} cx={cx} cy={cy - 80} spread={560} rMin={22} rMax={78} life={2.2} />
        <Sparkle x={cx} y={cy - 60} s={260 * star} rot={20} />
        <Twinkles seed={66} count={9} t={t} x0={120} x1={960} y0={560} y1={1700} size={40} />
      </Svg>
      <TextSlot top={170}>
        <PopText text={span.headline} size={176} variant="white" delay={6} exitAt={exitAt} />
      </TextSlot>
      <TextSlot top={400}>
        <PopText text={span.subline} size={104} variant="blue" delay={16} stagger={3} exitAt={exitAt + 2} />
      </TextSlot>
    </>
  );
};
