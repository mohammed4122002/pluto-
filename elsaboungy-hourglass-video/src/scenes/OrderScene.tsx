import { RingPattern, SoftDots, Sunburst } from "../art/Backgrounds";
import { Bubble, BurstBubbles, RisingBubbles, Sparkle, Twinkles } from "../art/Bubbles";
import { Bottle, Phone, PHONE_W, SCREEN_INSET, UiText, type BottleKind } from "../art/Phone";
import { pop } from "../lib/anim";
import { clamp, easeInOutCubic, easeOutBack, easeOutCubic, lerp } from "../lib/math";
import { T } from "../theme";
import { PillLabel, PopText } from "../text/PopText";
import { Svg, TextSlot, useScene, type SceneProps } from "./common";

const SW = PHONE_W - SCREEN_INSET * 2; // 508
const PRODUCTS: { kind: BottleKind; col: number; row: number }[] = [
  { kind: "jug", col: 1, row: 0 },
  { kind: "spray", col: 0, row: 0 },
  { kind: "dish", col: 1, row: 1 },
  { kind: "tub", col: 0, row: 1 },
];
const CARD_W = 214;
const CARD_H = 250;
const cardX = (col: number) => 26 + col * (CARD_W + 28);
const cardY = (row: number) => 330 + row * (CARD_H + 26);
const CART = { x: 70, y: 98 };

/** Floating 2.5D icons around the phone. */
const FloatIcon: React.FC<{ x: number; y: number; s: number; kind: "cart" | "bag" | "heart" }> = ({ x, y, s, kind }) => {
  if (s <= 0.02) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#shadowSm)">
      <circle r={62} fill="#ffffff" stroke={T.ink} strokeWidth={7} />
      <circle r={62} fill="url(#shadeDown)" />
      {kind === "cart" && (
        <g fill="none" stroke={T.blue} strokeWidth={9} strokeLinecap="round" strokeLinejoin="round">
          <path d="M-34,-22 L-24,-22 L-12,18 L26,18 L34,-10 L-18,-10" />
          <circle cx={-6} cy={32} r={5} fill={T.blue} />
          <circle cx={20} cy={32} r={5} fill={T.blue} />
        </g>
      )}
      {kind === "bag" && (
        <g>
          <rect x={-26} y={-16} width={52} height={46} rx={10} fill={T.yellow} stroke={T.ink} strokeWidth={6} />
          <path d="M-12,-16 q12,-26 24,0" fill="none" stroke={T.ink} strokeWidth={6} />
        </g>
      )}
      {kind === "heart" && <path d="M0,28 C-40,0 -34,-30 -14,-30 C-4,-30 0,-20 0,-16 C0,-20 4,-30 14,-30 C34,-30 40,0 0,28 Z" fill="#ff6b8a" stroke={T.ink} strokeWidth={6} />}
    </g>
  );
};

/** 03 — ordering cleaning products on a cartoon phone. */
export const OrderScene: React.FC<SceneProps> = ({ span, spans, brand }) => {
  const { f, fps, t, D, exitAt } = useScene(span, spans);

  const phoneIn = pop(f, fps, 0, 120, 10);
  const phoneY = lerp(1500, 1110, phoneIn);
  const rot = lerp(-18, -4, phoneIn) + Math.sin(t * 1.6) * 1.2;

  // taps on "+" — each product flies to the cart
  const taps = [38, 54, 70].map((tf, i) => ({ tf, p: PRODUCTS[i] }));
  const count = taps.filter((tp) => f >= tp.tf + 12).length;
  const badge = pop(f, fps, (taps[Math.max(0, count - 1)]?.tf ?? 0) + 12, 260, 7);
  const orderTap = Math.round(D * 0.6);
  const success = clamp((f - orderTap - 4) / 10);
  const successPop = pop(f, fps, orderTap + 6, 160, 8);

  const tapAt = (tf: number) => {
    const k = clamp((f - tf) / 12);
    return k > 0 && k < 1 ? k : 0;
  };

  const screen = (
    <g>
      {/* header */}
      <rect x={0} y={0} width={SW} height={170} fill={T.blue} />
      <rect x={0} y={0} width={SW} height={170} fill="url(#shadeDown)" />
      <UiText x={SW - 40} y={108} size={52} fill="#ffffff" anchor="start">
        {brand.nameAr}
      </UiText>
      <g transform={`translate(${CART.x} ${CART.y})`}>
        <circle r={40} fill="#ffffff" stroke={T.ink} strokeWidth={5} />
        <g fill="none" stroke={T.blue} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" transform="scale(0.8)">
          <path d="M-34,-22 L-24,-22 L-12,18 L26,18 L34,-10 L-18,-10" />
        </g>
        {count > 0 && (
          <g transform={`translate(28 -26) scale(${0.4 + 0.6 * badge})`}>
            <circle r={22} fill={T.yellow} stroke={T.ink} strokeWidth={5} />
            <UiText x={0} y={3} size={30} fill={T.ink} rtl={false}>
              {count}
            </UiText>
          </g>
        )}
      </g>
      {/* address chip */}
      <rect x={30} y={196} width={SW - 60} height={60} rx={30} fill="#ffffff" stroke="#c9dcf5" strokeWidth={4} />
      <circle cx={70} cy={226} r={13} fill="none" stroke={T.blue} strokeWidth={5} />
      <UiText x={SW / 2 + 12} y={229} size={32} fill={T.blueDeep} rtl={false} weight={700}>
        {brand.contact.website}
      </UiText>
      <UiText x={SW - 30} y={296} size={34} fill={T.ink} anchor="start">
        منظفات البيت
      </UiText>

      {/* product cards */}
      {PRODUCTS.map((pr, i) => {
        const cin = easeOutBack(clamp((f - 12 - i * 4) / 14));
        const x = cardX(pr.col);
        const y = cardY(pr.row) + (1 - cin) * 220;
        const tap = taps.find((tp) => tp.p === pr);
        const pressed = tap ? tapAt(tap.tf) : 0;
        const plus = 1 - Math.sin(pressed * Math.PI) * 0.25;
        return (
          <g key={i} opacity={clamp(cin * 2)}>
            <rect x={x} y={y + 8} width={CARD_W} height={CARD_H} rx={30} fill="#9db8dc" opacity={0.45} />
            <rect x={x} y={y} width={CARD_W} height={CARD_H} rx={30} fill="#ffffff" stroke="#c9dcf5" strokeWidth={4} />
            <rect x={x + 14} y={y + 14} width={CARD_W - 28} height={150} rx={22} fill="#e8f3ff" />
            <Bottle kind={pr.kind} x={x + CARD_W / 2} y={y + 160} s={0.58} rot={Math.sin(t * 2 + i) * 2} />
            <rect x={x + 22} y={y + 186} width={110} height={14} rx={7} fill="#c9dcf5" />
            <rect x={x + 22} y={y + 212} width={70} height={14} rx={7} fill="#e1ecfa" />
            <g transform={`translate(${x + CARD_W - 44} ${y + CARD_H - 44}) scale(${plus})`}>
              <circle r={30} fill="url(#yellowBall)" stroke={T.ink} strokeWidth={5} />
              <path d="M-12,0 h24 M0,-12 v24" stroke={T.ink} strokeWidth={7} strokeLinecap="round" />
            </g>
          </g>
        );
      })}

      {/* order button */}
      <g transform={`translate(${SW / 2} ${cardY(2) + 70}) scale(${1 - Math.sin(tapAt(orderTap) * Math.PI) * 0.08})`}>
        <rect x={-210} y={-50} width={420} height={100} rx={50} fill="#0a3a9e" />
        <rect x={-210} y={-56} width={420} height={100} rx={50} fill={T.blue} stroke={T.ink} strokeWidth={6} />
        <rect x={-180} y={-46} width={360} height={24} rx={12} fill="#fff" opacity={0.35} />
        <UiText x={0} y={-2} size={46} fill="#ffffff">
          اطلب الآن
        </UiText>
      </g>

      {/* products flying to the cart */}
      {taps.map(({ tf, p: pr }, i) => {
        const k = clamp((f - tf - 2) / 12);
        if (k <= 0 || k >= 1) return null;
        const sx = cardX(pr.col) + CARD_W / 2;
        const sy = cardY(pr.row) + 120;
        const e = easeInOutCubic(k);
        const x = lerp(sx, CART.x, e);
        const y = lerp(sy, CART.y, e) - Math.sin(k * Math.PI) * 160;
        return <Bottle key={i} kind={pr.kind} x={x} y={y + 40} s={0.4 * (1 - k * 0.6)} rot={k * 40} />;
      })}

      {/* tap ripples */}
      {[...taps.map((tp) => ({ tf: tp.tf, x: cardX(tp.p.col) + CARD_W - 44, y: cardY(tp.p.row) + CARD_H - 44 })), { tf: orderTap, x: SW / 2, y: cardY(2) + 64 }].map((tp, i) => {
        const k = tapAt(tp.tf);
        if (!k) return null;
        return (
          <g key={i} opacity={1 - k}>
            <circle cx={tp.x} cy={tp.y} r={20 + k * 70} fill="none" stroke={T.blue} strokeWidth={8} />
            <circle cx={tp.x} cy={tp.y} r={26 * (1 - k)} fill={T.ink} opacity={0.35} />
          </g>
        );
      })}

      {/* success */}
      {success > 0 && (
        <g>
          <rect x={0} y={0} width={SW} height={1100} fill={T.blue} opacity={success} />
          <g transform={`translate(${SW / 2} 470) scale(${successPop})`}>
            <circle r={130} fill="#ffffff" opacity={0.25} />
            <circle r={104} fill="#ffffff" stroke={T.ink} strokeWidth={7} />
            <path d="M-46,4 L-12,38 L52,-34" fill="none" stroke={T.blue} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g opacity={clamp((f - orderTap - 10) / 6)}>
            <UiText x={SW / 2} y={680} size={66} fill="#ffffff">
              تم الطلب!
            </UiText>
          </g>
          <BurstBubbles seed={4} count={14} dt={(f - orderTap - 6) / fps} cx={SW / 2} cy={470} spread={300} rMin={14} rMax={40} life={1.4} />
        </g>
      )}
    </g>
  );

  const icons = [
    { x: 150, y: 760, kind: "cart" as const, d: 14 },
    { x: 940, y: 900, kind: "bag" as const, d: 20 },
    { x: 960, y: 1480, kind: "heart" as const, d: 26 },
  ];

  return (
    <>
      <Svg>
        <Sunburst cx={540} cy={1050} inner="#fff1a0" outer="#f29a00" ray="#ffffff" rayOpacity={0.3} rays={20} rotation={-t * 10} />
        <g filter="url(#blur6)">
          <SoftDots seed={47} count={14} t={t} rMin={40} rMax={110} opacity={0.7} />
        </g>
        <RingPattern seed={27} count={16} t={t} color="#ffffff" opacity={0.3} />
        <RisingBubbles seed={33} count={9} t={t} x0={20} x1={1060} y0={2050} y1={-150} rMin={14} rMax={44} speed={160} line="#ffffff" />

        <Phone x={540} y={phoneY} scale={0.95} rot={rot} clipId="order-phone">
          {screen}
        </Phone>

        {icons.map((ic, i) => (
          <FloatIcon key={i} x={ic.x + Math.sin(t * 1.5 + i) * 14} y={ic.y + Math.cos(t * 1.8 + i) * 18} s={pop(f, fps, ic.d, 170, 8)} kind={ic.kind} />
        ))}
        {[0, 1, 2].map((i) => (
          <Bubble key={i} x={130 + i * 410 + Math.sin(t * 2 + i) * 20} y={1700 - ((t * 120 + i * 200) % 600)} r={30 + i * 8} line="#ffffff" />
        ))}
        <Sparkle x={820} y={640} s={60 * Math.abs(Math.sin(t * 2.2))} rot={t * 90} />
        <Sparkle x={240} y={1300} s={48 * Math.abs(Math.sin(t * 2.6 + 1))} rot={-t * 80} />
        {success > 0 && <Sparkle x={800} y={700} s={130 * easeOutCubic(success) * (1 - clamp((f - orderTap - 14) / 12))} rot={f * 2} color="#ffffff" />}
        <Twinkles seed={81} count={8} t={t} x0={60} x1={1020} y0={500} y1={1800} size={34} />
      </Svg>
      <TextSlot top={120}>
        <PopText text={span.headline} size={128} variant="white" delay={6} stagger={5} exitAt={exitAt} />
      </TextSlot>
      <TextSlot top={1700}>
        <PillLabel text={span.subline} size={66} delay={22} exitAt={exitAt + 2} bg={T.blue} color="#ffffff" />
      </TextSlot>
    </>
  );
};
