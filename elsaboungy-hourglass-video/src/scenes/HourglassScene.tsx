import { spring } from "remotion";
import { RingPattern, SoftDots, Sunburst } from "../art/Backgrounds";
import { Bubble, BurstBubbles, RisingBubbles, Sparkle, Twinkles } from "../art/Bubbles";
import { FoamCloud, cloudShape } from "../art/Foam";
import { Hourglass } from "../art/Hourglass";
import { squash } from "../lib/anim";
import { clamp, easeOutCubic, lerp, rng } from "../lib/math";
import { HG_FLIP, hourglassSceneState } from "../state";
import { T } from "../theme";
import { PillLabel, PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

const CLOUDS = Array.from({ length: 8 }, (_, i) => cloudShape(140 + i, 180));

/**
 * 02 — the hourglass: lands with a bounce, foam swirls around it, bubbles
 * stream out of it, then it flips and bursts into bubbles.
 */
export const HourglassScene: React.FC<SceneProps> = ({ span, spans }) => {
  const { f, fps, t, p, D, exitAt } = useScene(span, spans);
  const st = hourglassSceneState(p);

  const cx = 540;
  const restY = 1150;
  const scale = 0.74;

  // entrance: zooms out of the flash, lands with squash
  const land = spring({ frame: f, fps, config: { damping: 10, stiffness: 140, mass: 0.9 } });
  const enterScale = lerp(2.2, 1, easeOutCubic(clamp(f / 14)));
  const { sx: lsx, sy: lsy } = squash(land, 2);

  // flip with a hop
  const flipStart = HG_FLIP[0] * D;
  const flipEnd = HG_FLIP[1] * D;
  const flipK = clamp((f - flipStart) / (flipEnd - flipStart));
  const hop = Math.sin(flipK * Math.PI) * 150;
  const stretch = Math.sin(flipK * Math.PI) * 0.07;
  const after = spring({ frame: f - flipEnd, fps, config: { damping: 7, stiffness: 220, mass: 0.7 } });
  const landSq = f >= flipEnd ? (1 - after) * 0.2 : 0;
  const sx = lsx * (1 - stretch + landSq) * enterScale;
  const sy = lsy * (1 + stretch - landSq) * enterScale;

  // foam swirl
  const enter = easeOutCubic(clamp((f - 4) / 30));
  const rx = lerp(1100, 470, enter);
  const ry = rx * 0.25;
  const tilt = (-10 * Math.PI) / 180;
  const clouds = CLOUDS.map((puffs, i) => {
    const a = (i / CLOUDS.length) * Math.PI * 2 + t * 1.5;
    const depth = Math.sin(a);
    const lx = Math.cos(a) * rx;
    const ly = depth * ry;
    return {
      puffs,
      x: cx + lx * Math.cos(tilt) - ly * Math.sin(tilt),
      y: restY + 30 + lx * Math.sin(tilt) + ly * Math.cos(tilt),
      depth,
      s: (0.5 + 0.26 * depth) * clamp(enter * 1.4),
      key: i,
    };
  });

  // bubbles streaming out of the top of the hourglass
  const r = rng(61);
  const stream = Array.from({ length: 14 }, (_, i) => {
    const sp = 0.55 + r() * 0.35;
    const k = (t * sp + i / 14) % 1;
    const side = r() < 0.5 ? -1 : 1;
    return {
      x: cx + side * (40 + k * (90 + r() * 260)) + Math.sin(t * 3 + i) * 18,
      y: restY - 330 - hop - k * 900,
      r: (14 + r() * 34) * Math.min(1, k * 5) * clamp(f / 12),
      key: i,
    };
  });

  const burstDt = (f - flipEnd + 1) / fps;
  const star = clamp((f - flipEnd + 1) / 7) * (1 - clamp((f - flipEnd - 6) / 10));

  return (
    <>
      <Svg>
        <Sunburst cx={cx} cy={restY - 80} inner="#4aa3ff" outer="#05246b" ray="#ffffff" rayOpacity={0.12} rays={22} rotation={t * 8} />
        <g filter="url(#blur6)">
          <SoftDots seed={14} count={18} t={t} rMin={40} rMax={130} opacity={0.65} />
        </g>
        <RingPattern seed={36} count={16} t={t} color="#ffffff" opacity={0.15} />
        <RisingBubbles seed={19} count={10} t={t} x0={20} x1={1060} y0={2050} y1={-150} rMin={12} rMax={36} speed={150} />

        {/* light beam from above */}
        <path d={`M${cx - 120},-40 L${cx + 120},-40 L${cx + 430},${restY + 500} L${cx - 430},${restY + 500} Z`} fill="#ffffff" opacity={0.08} />
        <ellipse cx={cx} cy={restY + 360} rx={340 * (1 - hop / 500)} ry={40} fill="#020d33" opacity={0.35} filter="url(#blur12)" />

        {clouds
          .filter((c) => c.depth < 0)
          .map((c) => (
            <FoamCloud key={c.key} puffs={c.puffs} x={c.x} y={c.y} scale={c.s} squish={Math.sin(t * 5 + c.key) * 0.05} />
          ))}

        <g transform={`translate(${cx} ${restY - hop}) scale(${scale * sx} ${scale * sy})`} filter="url(#shadowSoft)">
          <Hourglass top={st.top} bottom={st.bottom} flow={st.flow} t={t} spin={(2 * Math.PI) / 3 + 0.45 * Math.sin(t * 1.4) * clamp(Math.abs(f - flipEnd) / 14)} flip={st.flip} shadow={false} />
        </g>

        {stream.map((b) => (
          <Bubble key={b.key} x={b.x} y={b.y} r={b.r} />
        ))}

        {clouds
          .filter((c) => c.depth >= 0)
          .map((c) => (
            <FoamCloud key={c.key} puffs={c.puffs} x={c.x} y={c.y} scale={c.s} squish={Math.sin(t * 5 + c.key) * 0.05} />
          ))}

        <BurstBubbles seed={9} count={22} dt={burstDt} cx={cx} cy={restY - 60} spread={540} rMin={22} rMax={74} life={1.6} />
        <Sparkle x={cx} y={restY - 60} s={240 * star} rot={20} color={T.yellow} />
        <Twinkles seed={71} count={9} t={t} x0={120} x1={960} y0={560} y1={1700} size={40} />
      </Svg>
      <TextSlot top={150}>
        <PopText text={span.headline} size={178} variant="yellow" delay={8} stagger={6} exitAt={exitAt} />
      </TextSlot>
      <TextSlot top={1660}>
        <PillLabel text={span.subline} size={68} delay={20} exitAt={exitAt + 2} />
      </TextSlot>
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 220px ${T.navy}99`, pointerEvents: "none" }} />
    </>
  );
};
