import { Gradient, RingPattern, SoftDots } from "../art/Backgrounds";
import { RisingBubbles, Twinkles } from "../art/Bubbles";
import { Hourglass } from "../art/Hourglass";
import { clamp, easeOutCubic, easeInOutSine, lerp } from "../lib/math";
import { foamState } from "../state";
import { T } from "../theme";
import { PillLabel, PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

/** 02 — macro close-up: foam pours through the neck and piles up below. */
export const FlowScene: React.FC<SceneProps> = ({ span, spans }) => {
  const { f, t, p, clock, exitAt } = useScene(span, spans);
  const st = foamState(clock);

  // Camera: lands from the zoom-in, then slowly cranes down & pulls back.
  const intro = easeOutCubic(clamp(f / 16));
  const crane = easeInOutSine(p);
  const scale = lerp(3.0, 1.78, intro) - 0.2 * crane;
  const neckY = lerp(860, 610, intro) - 40 * crane;

  return (
    <>
      <Svg>
        <Gradient top="#4aa3ff" bottom="#0b47b8" />
        <g transform={`rotate(-24 540 960)`}>
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={-400 + i * 520 + ((t * 60) % 520)}
              y={-600}
              width={120 + i * 40}
              height={3200}
              fill="#ffffff"
              opacity={0.07}
            />
          ))}
        </g>
        <SoftDots seed={31} count={22} t={t} rMin={50} rMax={150} drift={28} opacity={0.75} />
        <RingPattern seed={17} count={14} t={t} color="#ffffff" opacity={0.16} />
        <RisingBubbles seed={41} count={8} t={t} x0={0} x1={1080} y0={2050} y1={-150} rMin={14} rMax={34} speed={120} />

        <g transform={`translate(540 ${neckY}) scale(${scale})`}>
          <Hourglass top={st.top} bottom={st.bottom} flow={st.flow} t={t} spin={(2 * Math.PI) / 3 + Math.sin(t * 1.2) * 0.25} shadow={false} />
        </g>
        <Twinkles seed={5} count={7} t={t} x0={250} x1={830} y0={neckY - 150} y1={neckY + 700} size={34} />

        {/* big foreground bubbles drifting past the lens */}
        <RisingBubbles seed={77} count={5} t={t + 2} x0={-40} x1={1120} y0={2300} y1={-300} rMin={70} rMax={140} speed={330} sway={50} />
      </Svg>
      <TextSlot top={1430}>
        <PopText text={span.headline} size={150} variant="yellow" delay={10} exitAt={exitAt} />
      </TextSlot>
      <TextSlot top={1650}>
        <PillLabel text={span.subline} size={74} delay={22} exitAt={exitAt + 3} />
      </TextSlot>
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 200px ${T.blueDeep}99` }} />
    </>
  );
};
