import { useCurrentFrame, useVideoConfig } from "remotion";
import { Gradient, RingPattern, SoftDots, Sunburst } from "../art/Backgrounds";
import { BurstBubbles, RisingBubbles, Twinkles } from "../art/Bubbles";
import { FoamCloud, cloudShape } from "../art/Foam";
import { IconBadge, type IconKind } from "../art/Icons";
import { LogoMark } from "../art/LogoMark";
import { FONT } from "../fonts";
import { pop } from "../lib/anim";
import { clamp } from "../lib/math";
import { T } from "../theme";
import { PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

const CLOUD_L = cloudShape(501, 420);
const CLOUD_R = cloudShape(502, 400);
const BANK = Array.from({ length: 6 }, (_, i) => cloudShape(520 + i, 360));

const ContactPill: React.FC<{ icon: IconKind; text: string; tag?: string; ltr?: boolean; delay: number; top: number; index: number }> = ({
  icon,
  text,
  tag,
  ltr,
  delay,
  top,
  index,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(frame, fps, delay, 170, 9);
  const shineX = ((frame - delay) * 3.2 - index * 40) % 340 - 120;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top,
        display: "flex",
        justifyContent: "center",
        transform: `translateY(${(1 - s) * 80 + Math.sin((frame + index * 20) / 14) * 3}px) scale(${0.3 + 0.7 * s})`,
        opacity: clamp(s * 2.5),
      }}
    >
      <div
        dir="rtl"
        style={{
          position: "relative",
          width: 800,
          height: 116,
          borderRadius: 999,
          background: "linear-gradient(180deg, #ffffff 0%, #eaf4ff 60%, #cfe4ff 100%)",
          border: `7px solid ${T.ink}`,
          boxShadow: `0 12px 0 ${T.ink}, 0 26px 36px rgba(2,14,48,0.4)`,
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: 40, right: 40, top: 8, height: 26, borderRadius: 999, background: "rgba(255,255,255,0.9)" }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(105deg, transparent ${shineX}%, rgba(255,255,255,0.95) ${shineX + 6}%, transparent ${shineX + 12}%)`,
          }}
        />
        <div style={{ position: "relative", marginRight: 6, marginLeft: 10, display: "flex" }}>
          <IconBadge kind={icon} size={104} />
        </div>
        <div
          dir={ltr ? "ltr" : "rtl"}
          style={{
            position: "relative",
            flex: 1,
            textAlign: "center",
            paddingLeft: tag ? 0 : 60,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: ltr ? 62 : 66,
            letterSpacing: ltr ? 1 : 0,
            color: T.blueDeep,
            lineHeight: 1,
            marginTop: 6,
          }}
        >
          {text}
        </div>
        {tag && (
          <div
            dir="rtl"
            style={{
              position: "relative",
              marginLeft: 22,
              padding: "2px 18px 8px",
              borderRadius: 999,
              background: T.blue,
              border: `5px solid ${T.ink}`,
              color: "#fff",
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 34,
              lineHeight: 1.2,
            }}
          >
            {tag}
          </div>
        )}
      </div>
    </div>
  );
};

/** 06 — end card: logo, official slogan, website / phone / city. */
export const EndCardScene: React.FC<SceneProps> = ({ span, spans, brand }) => {
  const { f, fps, t } = useScene(span, spans);
  const logo = pop(f, fps, 3, 140, 9);
  const clouds = pop(f, fps, 20, 120, 10);
  const logoFoam = pop(f, fps, 6, 140, 9);

  return (
    <>
      <Svg>
        <Gradient top="#3b95ff" bottom="#0a3a9e" />
        <Sunburst cx={540} cy={380} inner="#5aaaff" outer="#0a3a9e" ray="#ffffff" rayOpacity={0.1} rays={22} rotation={t * 6} height={1920} />
        <SoftDots seed={91} count={16} t={t} rMin={40} rMax={120} opacity={0.5} />
        <RingPattern seed={19} count={14} t={t} color="#ffffff" opacity={0.14} />
        <RisingBubbles seed={95} count={14} t={t} x0={20} x1={1060} y0={2050} y1={-150} rMin={12} rMax={44} speed={130} appear={clamp(f / 16)} />
        <Twinkles seed={33} count={10} t={t} x0={60} x1={1020} y0={140} y1={1800} size={30} />

        {/* foam bank along the bottom */}
        {BANK.map((c, i) => (
          <FoamCloud key={i} puffs={c} x={-60 + i * 240} y={1890 + (i % 2) * 30} scale={clouds * (0.9 + (i % 3) * 0.12)} squish={Math.sin(t * 3 + i) * 0.03} />
        ))}
        {/* foam cushion under the logo */}
        <FoamCloud puffs={CLOUD_L} x={300} y={490} scale={logoFoam * 0.42} squish={Math.sin(t * 3) * 0.04} />
        <FoamCloud puffs={CLOUD_R} x={790} y={495} scale={logoFoam * 0.4} squish={Math.sin(t * 3 + 1) * 0.04} />
        <BurstBubbles seed={17} count={16} dt={(f - 8) / fps} cx={540} cy={420} spread={480} rMin={16} rMax={46} life={2.6} />
      </Svg>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 170,
          display: "flex",
          justifyContent: "center",
          transform: `scale(${0.2 + 0.8 * logo}) translateY(${Math.sin(t * 2) * 5}px)`,
          opacity: clamp(logo * 3),
        }}
      >
        <LogoMark width={560} height={330} />
      </div>

      <TextSlot top={520}>
        <PopText text={brand.slogan.line1} size={124} variant="white" delay={12} stagger={4} />
      </TextSlot>
      <TextSlot top={690}>
        <PopText text={brand.slogan.line2} size={104} variant="yellow" delay={22} stagger={4} />
      </TextSlot>

      <ContactPill icon="globe" text={brand.contact.website} ltr delay={36} top={930} index={0} />
      <ContactPill icon="chat" text={brand.contact.phone} tag={brand.contact.whatsappLabel} ltr delay={43} top={1072} index={1} />
      <ContactPill icon="pin" text={brand.contact.city} delay={50} top={1214} index={2} />
    </>
  );
};
