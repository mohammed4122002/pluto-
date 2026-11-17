import { Gradient } from "../art/Backgrounds";
import { AlarmClock, Car, HornBubble, ListSheet, ShoppingCart, Skyline } from "../art/City";
import { FoamCloud, cloudShape } from "../art/Foam";
import { pop } from "../lib/anim";
import { clamp, easeInCubic, easeOutCubic, lerp, rng } from "../lib/math";
import { T } from "../theme";
import { PillLabel, PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

const CLOUDS = [cloudShape(901, 260), cloudShape(902, 200), cloudShape(903, 230)];
const ROAD_TOP = 1290;
const CLOCK = { x: 540, y: 820, r: 175 };

const BACK_ROW = [
  { x: -60, color: "#ff8a65" },
  { x: 300, color: T.yellow },
  { x: 660, color: "#ffffff" },
  { x: 1020, color: "#7ad3c0" },
];
const FRONT_ROW = [
  { x: 120, color: T.blue },
  { x: 560, color: "#ff6b6b" },
  { x: 1000, color: T.yellow },
];

/** Stop-and-go creep: moves a little, then waits. */
const creep = (t: number, phase: number) => {
  const cyc = (t * 0.9 + phase) % 1;
  const move = clamp((cyc - 0.55) / 0.3);
  return (Math.floor(t * 0.9 + phase) + easeOutCubic(move)) * 26;
};

/** 01 — rush hour: traffic, errands, shopping bags, the clock racing. */
export const RushScene: React.FC<SceneProps> = ({ span, spans }) => {
  const { f, fps, t, p, exitAt } = useScene(span, spans);

  const cam = 1 + 0.05 * p + easeInCubic(clamp((p - 0.84) / 0.16)) * 3.4; // slow push, then dive into the clock
  const shakeX = Math.sin(t * 37) * 2.2 * clamp(p * 3);
  const clockIn = pop(f, fps, 6, 150, 8);
  const ringing = 0.6 + 0.4 * Math.sin(t * 9);
  const clockShake = Math.sin(t * 46) * 5 * clockIn;
  const cartIn = easeOutCubic(clamp((f - 10) / 26));
  const r = rng(5);
  const sheets = [0, 1, 2].map((i) => {
    const sp = 0.16 + r() * 0.1;
    const k = (t * sp + i * 0.36) % 1;
    return {
      x: lerp(-120, 1200, k) + Math.sin(t * 2 + i) * 40,
      y: 560 + i * 120 + Math.sin(t * 3 + i * 2) * 50,
      rot: Math.sin(t * 2.4 + i) * 30 + k * 160,
      s: 0.75 + r() * 0.3,
      checked: 1 + (i % 3),
    };
  });

  return (
    <>
      <Svg>
        <g transform={`translate(${CLOCK.x + shakeX} ${CLOCK.y}) scale(${cam}) translate(${-CLOCK.x} ${-CLOCK.y})`}>
          {/* sky */}
          <Gradient top="#6fbaff" bottom="#d9efff" height={ROAD_TOP + 20} />
          <circle cx={880} cy={300} r={170} fill="url(#warmLight)" opacity={0.85} />
          <circle cx={880} cy={300} r={78} fill="url(#yellowBall)" />
          {CLOUDS.map((c, i) => (
            <FoamCloud key={i} puffs={c} x={((i * 420 + t * (26 + i * 10)) % 1500) - 200} y={460 + i * 150} scale={0.75} outline="#b9dcff" />
          ))}

          {/* city, two depth layers */}
          <g filter="url(#blur6)">
            <Skyline seed={3} baseY={ROAD_TOP} color="#a9d0fb" windowOn="#fff2b3" windowOff="#c7e1fd" minH={300} maxH={560} offsetX={-t * 6} />
          </g>
          <Skyline seed={8} baseY={ROAD_TOP} color="#5d9ef3" windowOn="#ffe27a" windowOff="#8dbdf7" minH={170} maxH={380} offsetX={-30 - t * 12} />

          {sheets.map((s, i) => (
            <ListSheet key={i} {...s} />
          ))}

          {/* the clock */}
          <g transform={`translate(${CLOCK.x} ${CLOCK.y}) scale(${clockIn}) translate(${-CLOCK.x} ${-CLOCK.y})`}>
            <circle cx={CLOCK.x} cy={CLOCK.y} r={CLOCK.r * 1.7} fill="url(#softGlow)" opacity={0.55} />
            <AlarmClock x={CLOCK.x} y={CLOCK.y} r={CLOCK.r} minute={t * 9} hour={t * 0.9 + 1} shake={clockShake} ring={ringing * clockIn} />
          </g>

          {/* road */}
          <rect x={-200} y={ROAD_TOP} width={1480} height={40} fill="#cfe2f7" />
          <rect x={-200} y={ROAD_TOP + 40} width={1480} height={720} fill="#46618f" />
          <rect x={-200} y={ROAD_TOP + 40} width={1480} height={720} fill="url(#shadeDown)" opacity={0.5} />
          {Array.from({ length: 9 }, (_, i) => (
            <rect key={i} x={-160 + i * 160 - ((t * 20) % 160)} y={1530} width={90} height={16} rx={8} fill="#ffffff" opacity={0.85} />
          ))}

          {/* back row (heading right) */}
          {BACK_ROW.map((c, i) => {
            const dx = creep(t, i * 0.23);
            return (
              <Car key={i} x={c.x + dx} y={1470} scale={0.78} color={c.color} wheelTurn={dx / 30} bob={Math.sin(t * 22 + i) * 1.6} />
            );
          })}
          <HornBubble x={420 + creep(t, 0.23)} y={1240} s={pop(f, fps, 30, 180, 8) * (1 - clamp((f - 70) / 8))} />

          {/* front row (heading left) */}
          {FRONT_ROW.map((c, i) => {
            const dx = creep(t, 0.5 + i * 0.31);
            return (
              <Car key={i} x={c.x - dx} y={1745} scale={1.05} color={c.color} facing={-1} wheelTurn={-dx / 30} bob={Math.sin(t * 20 + i * 2) * 2} />
            );
          })}
          <HornBubble x={700 - creep(t, 0.81)} y={1480} s={pop(f, fps, 58, 180, 8) * (1 - clamp((f - 100) / 8))} flip />

          {/* exhaust puffs */}
          {[0, 1, 2, 3].map((i) => {
            const k = (t * 0.8 + i * 0.25) % 1;
            return (
              <circle key={i} cx={210 + 180 * 1.05 + k * 60} cy={1705 - k * 70} r={14 + k * 26} fill="#e2ebf7" opacity={0.75 * (1 - k)} />
            );
          })}

          <ShoppingCart x={lerp(-260, 250, cartIn) + Math.sin(t * 2) * 6} y={1890} scale={0.95} rattle={t * 3} wheelTurn={cartIn * 8 + t * 0.4} />
        </g>
      </Svg>
      <TextSlot top={130}>
        <PopText text={span.headline} size={140} variant="white" delay={4} stagger={6} exitAt={exitAt - 8} />
      </TextSlot>
      <TextSlot top={360}>
        <PillLabel text={span.subline} size={78} delay={24} exitAt={exitAt - 6} />
      </TextSlot>
      <div style={{ position: "absolute", inset: 0, boxShadow: `inset 0 0 200px ${T.blueDeep}66`, pointerEvents: "none" }} />
    </>
  );
};
