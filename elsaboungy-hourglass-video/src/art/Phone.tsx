import { FONT } from "../fonts";
import { T } from "../theme";

/* ------------------------------------------------------------------ */
/* Generic cartoon cleaning-product bottles (no real packaging).        */
/* Drawn around (0,0) = bottom centre, ~200 units tall.                 */
/* ------------------------------------------------------------------ */

export type BottleKind = "jug" | "spray" | "dish" | "tub";

export const Bottle: React.FC<{ kind: BottleKind; x?: number; y?: number; s?: number; rot?: number }> = ({
  kind,
  x = 0,
  y = 0,
  s = 1,
  rot = 0,
}) => {
  const ink = T.ink;
  const label = (lx: number, ly: number, w: number, h: number, bg: string) => (
    <g>
      <rect x={lx} y={ly} width={w} height={h} rx={14} fill={bg} stroke={ink} strokeWidth={5} />
      <circle cx={lx + w * 0.34} cy={ly + h * 0.45} r={h * 0.2} fill="#fff" stroke={T.blueLight} strokeWidth={4} />
      <circle cx={lx + w * 0.6} cy={ly + h * 0.6} r={h * 0.13} fill="#fff" stroke={T.blueLight} strokeWidth={4} />
      <circle cx={lx + w * 0.56} cy={ly + h * 0.28} r={h * 0.09} fill="#fff" stroke={T.blueLight} strokeWidth={3} />
    </g>
  );
  let body: React.ReactNode;
  if (kind === "jug") {
    body = (
      <g>
        <rect x={-30} y={-232} width={60} height={34} rx={10} fill={T.yellow} stroke={ink} strokeWidth={6} />
        <path d="M-80,0 L-80,-150 Q-80,-200 -30,-206 L50,-206 Q86,-200 86,-160 L86,0 Z" fill={T.blue} stroke={ink} strokeWidth={7} strokeLinejoin="round" />
        <path d="M20,-190 q46,0 46,40 l0,30 q0,14 -14,14 l-18,0 q-14,0 -14,-14 Z" fill="#cfe4ff" stroke={ink} strokeWidth={5} />
        {label(-62, -110, 128, 86, "#ffffff")}
        <rect x={-66} y={-186} width={14} height={150} rx={7} fill="#fff" opacity={0.5} />
      </g>
    );
  } else if (kind === "spray") {
    body = (
      <g>
        <path d="M-34,-200 L40,-200 L60,-236 L-24,-246 Z" fill={T.blue} stroke={ink} strokeWidth={6} strokeLinejoin="round" />
        <path d="M-40,-200 L40,-200 L46,-186 L-46,-186 Z" fill={T.blueDeep} stroke={ink} strokeWidth={5} />
        <path d="M30,-198 q22,10 18,40" fill="none" stroke={ink} strokeWidth={7} strokeLinecap="round" />
        <path d="M-60,0 L-60,-130 Q-60,-186 -26,-188 L26,-188 Q60,-186 60,-130 L60,0 Z" fill={T.yellow} stroke={ink} strokeWidth={7} strokeLinejoin="round" />
        {label(-46, -120, 92, 80, "#ffffff")}
        <rect x={-48} y={-170} width={12} height={150} rx={6} fill="#fff" opacity={0.55} />
      </g>
    );
  } else if (kind === "dish") {
    body = (
      <g>
        <rect x={-14} y={-262} width={28} height={30} rx={8} fill={T.blue} stroke={ink} strokeWidth={5} />
        <rect x={-30} y={-240} width={60} height={30} rx={10} fill={T.blue} stroke={ink} strokeWidth={6} />
        <path d="M-50,0 L-50,-170 Q-50,-212 -18,-214 L18,-214 Q50,-212 50,-170 L50,0 Z" fill="#9fd4ff" stroke={ink} strokeWidth={7} strokeLinejoin="round" />
        {label(-38, -130, 76, 90, T.yellow)}
        <rect x={-40} y={-196} width={11} height={170} rx={5} fill="#fff" opacity={0.6} />
      </g>
    );
  } else {
    body = (
      <g>
        <rect x={-86} y={-150} width={172} height={34} rx={14} fill={T.yellow} stroke={ink} strokeWidth={6} />
        <path d="M-78,0 L-82,-120 L82,-120 L78,0 Z" fill="#ffffff" stroke={ink} strokeWidth={7} strokeLinejoin="round" />
        {label(-58, -100, 116, 74, T.blue)}
        <rect x={-70} y={-112} width={12} height={100} rx={6} fill="#dceeff" />
      </g>
    );
  }
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <ellipse cx={0} cy={6} rx={84} ry={12} fill={T.ink} opacity={0.22} filter="url(#blur6)" />
      {body}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Phone shell                                                          */
/* ------------------------------------------------------------------ */

export const PHONE_W = 560;
export const PHONE_H = 1080;
export const SCREEN_INSET = 26;

/** Glossy cartoon phone; children are drawn in screen coordinates (0,0 = top-left of the screen). */
export const Phone: React.FC<{ x: number; y: number; scale: number; rot: number; children: React.ReactNode; clipId: string }> = ({
  x,
  y,
  scale,
  rot,
  children,
  clipId,
}) => {
  const ink = T.ink;
  const sw = PHONE_W - SCREEN_INSET * 2;
  const sh = PHONE_H - SCREEN_INSET * 2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale}) translate(${-PHONE_W / 2} ${-PHONE_H / 2})`}>
      <rect x={30} y={60} width={PHONE_W} height={PHONE_H} rx={86} fill="#020d33" opacity={0.35} filter="url(#blur24)" />
      {/* thickness */}
      <rect x={16} y={16} width={PHONE_W} height={PHONE_H} rx={86} fill={T.blueDeep} stroke={ink} strokeWidth={9} />
      <rect x={PHONE_W + 4} y={260} width={20} height={110} rx={9} fill={T.yellow} stroke={ink} strokeWidth={6} />
      <rect x={0} y={0} width={PHONE_W} height={PHONE_H} rx={86} fill="url(#capBlue)" stroke={ink} strokeWidth={9} />
      <rect x={20} y={14} width={PHONE_W - 40} height={30} rx={15} fill="#fff" opacity={0.35} />
      <clipPath id={clipId}>
        <rect x={SCREEN_INSET} y={SCREEN_INSET} width={sw} height={sh} rx={62} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <rect x={SCREEN_INSET} y={SCREEN_INSET} width={sw} height={sh} fill="#f3f8ff" />
        <g transform={`translate(${SCREEN_INSET} ${SCREEN_INSET})`}>{children}</g>
        <rect x={SCREEN_INSET} y={SCREEN_INSET} width={sw} height={sh} fill="url(#screenGlare)" />
      </g>
      <rect x={SCREEN_INSET} y={SCREEN_INSET} width={sw} height={sh} rx={62} fill="none" stroke={ink} strokeWidth={6} />
      <rect x={PHONE_W / 2 - 70} y={SCREEN_INSET + 14} width={140} height={34} rx={17} fill={ink} />
    </g>
  );
};

/** Small helpers for on-screen UI text. */
export const UiText: React.FC<{
  x: number;
  y: number;
  size: number;
  fill: string;
  children: React.ReactNode;
  anchor?: "start" | "middle" | "end";
  rtl?: boolean;
  weight?: number;
}> = ({ x, y, size, fill, children, anchor = "middle", rtl = true, weight = 800 }) => (
  <text
    x={x}
    y={y}
    fontFamily={FONT}
    fontWeight={weight}
    fontSize={size}
    fill={fill}
    textAnchor={anchor}
    dominantBaseline="middle"
    direction={rtl ? "rtl" : "ltr"}
  >
    {children}
  </text>
);
