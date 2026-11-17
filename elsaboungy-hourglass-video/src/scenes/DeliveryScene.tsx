import { spring } from "remotion";
import { Gradient } from "../art/Backgrounds";
import { Bubble, Sparkle, Twinkles } from "../art/Bubbles";
import { FoamCloud, cloudShape } from "../art/Foam";
import { DOOR, HouseFront, LivingRoom, Parcel, Van } from "../art/Home";
import { Bottle } from "../art/Phone";
import { squash } from "../lib/anim";
import { clamp, easeInCubic, easeInOutCubic, easeOutCubic, lerp, rng } from "../lib/math";
import { T } from "../theme";
import { PillLabel, PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

const PUFF = cloudShape(77, 160);
const SKY_CLOUDS = [cloudShape(61, 240), cloudShape(62, 200)];

/** 04 — the order arrives at the door, then a calm, cosy moment at home. */
export const DeliveryScene: React.FC<SceneProps> = ({ span, spans, brand }) => {
  const { f, fps, t, D, exitAt } = useScene(span, spans);
  const k = f / D;

  // --- beat A: the van, the parcel, the door ------------------------------
  const vanIn = spring({ frame: f, fps, config: { damping: 13, stiffness: 70, mass: 1 } });
  const vanOut = easeInCubic(clamp((f - D * 0.36) / (D * 0.16)));
  const vanX = lerp(-520, 760, vanIn) + vanOut * 1100;
  const { sx: vsx, sy: vsy } = squash(vanIn, 1.4);

  const hopStart = D * 0.2;
  const hopEnd = D * 0.32;
  const hk = clamp((f - hopStart) / (hopEnd - hopStart));
  const mat = { x: DOOR.x + DOOR.w / 2, y: DOOR.y + DOOR.h + 40 };
  const fromX = vanX - 300 * 0.9;
  const parcelX = hk <= 0 ? fromX : lerp(fromX, mat.x, easeInOutCubic(hk));
  const parcelY = hk <= 0 ? 1600 : lerp(1600, mat.y, hk) - Math.sin(hk * Math.PI) * 300;
  const pland = spring({ frame: f - hopEnd, fps, config: { damping: 8, stiffness: 240, mass: 0.6 } });
  const psq = f >= hopEnd ? (1 - pland) * 0.25 : 0;
  const puff = f >= hopEnd ? Math.sin(clamp((f - hopEnd) / 18) * Math.PI) : 0;

  const bell = clamp((f - D * 0.38) / 6) * (1 - clamp((f - D * 0.5) / 6));
  const doorOpen = easeOutCubic(clamp((f - D * 0.44) / (D * 0.08)));

  // --- through the door ---------------------------------------------------
  const dive = easeInCubic(clamp((k - 0.5) / 0.08));
  const camA = 1 + dive * 2.6;
  const flash = Math.max(0, 1 - Math.abs(k - 0.585) / 0.045);
  const interior = clamp((k - 0.575) / 0.02);
  const settle = easeOutCubic(clamp((k - 0.575) / 0.25));
  const camB = lerp(1.25, 1.02, settle) + 0.03 * clamp((k - 0.8) / 0.2);
  const boxOpen = easeOutCubic(clamp((k - 0.66) / 0.1));

  const r = rng(12);
  const boxBubbles = Array.from({ length: 12 }, (_, i) => {
    const sp = 0.35 + r() * 0.3;
    const kk = (t * sp + i / 12) % 1;
    return { x: 320 + (r() - 0.5) * 160 + Math.sin(t * 2 + i) * 30, y: 1560 - kk * 900, r: (18 + r() * 34) * boxOpen * Math.min(1, kk * 6), key: i };
  });

  return (
    <>
      {interior < 1 && (
        <Svg>
          <g transform={`translate(${mat.x} ${DOOR.y + DOOR.h / 2}) scale(${camA}) translate(${-mat.x} ${-(DOOR.y + DOOR.h / 2)})`}>
            <Gradient top="#7cc2ff" bottom="#e2f2ff" height={400} />
            {SKY_CLOUDS.map((c, i) => (
              <FoamCloud key={i} puffs={c} x={200 + i * 600 + t * 20} y={170 + i * 30} scale={0.7} outline="#b9dcff" />
            ))}
            <HouseFront doorOpen={doorOpen} bell={bell} t={t} />
            <Parcel x={parcelX} y={parcelY} s={0.82} sx={1 + psq} sy={1 - psq} rot={hk > 0 && hk < 1 ? (1 - hk) * -25 : 0} label={brand.nameAr} />
            <FoamCloud puffs={PUFF} x={mat.x - 150} y={mat.y + 10} scale={puff * 0.6} />
            <FoamCloud puffs={PUFF} x={mat.x + 160} y={mat.y + 10} scale={puff * 0.55} />
            {puff > 0 && <Sparkle x={mat.x + 120} y={mat.y - 230} s={80 * puff} rot={f * 3} color={T.yellow} />}
            <Van x={vanX} y={1880} s={0.9} sx={vsx} sy={vsy} wheelTurn={vanX / 50} bob={Math.sin(t * 18) * 2} label={brand.nameAr} />
          </g>
        </Svg>
      )}

      {interior > 0 && (
        <Svg>
          <g opacity={interior} transform={`translate(540 1300) scale(${camB}) translate(-540 -1300)`}>
            <LivingRoom t={t} boxOpen={boxOpen} label={brand.nameAr} />
            {boxOpen > 0 && (
              <g>
                <Bottle kind="spray" x={262} y={1610 - 60 * boxOpen} s={0.55} rot={-10} />
                <Bottle kind="jug" x={350} y={1615 - 70 * boxOpen} s={0.5} rot={8} />
                <FoamCloud puffs={PUFF} x={320} y={1600} scale={0.6 * boxOpen} />
              </g>
            )}
            {boxBubbles.map((b) => (
              <Bubble key={b.key} x={b.x} y={b.y} r={b.r} line={T.blueLight} />
            ))}
            <Twinkles seed={44} count={8} t={t} x0={120} x1={960} y0={500} y1={1500} size={34} color="#ffffff" />
          </g>
        </Svg>
      )}

      {/* warm flash through the door */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 60%, #ffffff 0%, #fff4c4 60%, #ffd76a 100%)",
          opacity: flash,
          pointerEvents: "none",
        }}
      />

      <TextSlot top={110}>
        <PopText text={span.headline} size={110} variant="white" delay={8} stagger={4} exitAt={Math.round(D * 0.44)} />
      </TextSlot>
      <TextSlot top={150}>
        <PillLabel text={span.subline} size={74} delay={Math.round(D * 0.62)} exitAt={exitAt} />
      </TextSlot>
    </>
  );
};
