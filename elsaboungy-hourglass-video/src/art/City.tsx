import { FONT } from "../fonts";
import { rng } from "../lib/math";
import { T } from "../theme";

/* ------------------------------------------------------------------ */
/* Skyline                                                             */
/* ------------------------------------------------------------------ */

export const Skyline: React.FC<{
  seed: number;
  baseY: number;
  color: string;
  windowOn: string;
  windowOff: string;
  minH: number;
  maxH: number;
  offsetX?: number;
  opacity?: number;
}> = ({ seed, baseY, color, windowOn, windowOff, minH, maxH, offsetX = 0, opacity = 1 }) => {
  const r = rng(seed);
  const items: { x: number; w: number; h: number; round: number; seed: number }[] = [];
  let x = -120;
  while (x < 1200) {
    const w = 110 + r() * 120;
    items.push({ x, w, h: minH + r() * (maxH - minH), round: 14 + r() * 40, seed: Math.floor(r() * 1e6) });
    x += w + 10 + r() * 20;
  }
  return (
    <g transform={`translate(${offsetX} 0)`} opacity={opacity}>
      {items.map((b, i) => {
        const wr = rng(b.seed);
        const cols = Math.max(2, Math.floor((b.w - 30) / 34));
        const rows = Math.floor((b.h - 60) / 48);
        const top = baseY - b.h;
        return (
          <g key={i}>
            <path
              d={`M${b.x},${baseY} L${b.x},${top + b.round} Q${b.x},${top} ${b.x + b.round},${top} L${b.x + b.w - b.round},${top} Q${b.x + b.w},${top} ${b.x + b.w},${top + b.round} L${b.x + b.w},${baseY} Z`}
              fill={color}
            />
            <rect x={b.x + 10} y={top + 10} width={14} height={b.h - 20} rx={7} fill="#fff" opacity={0.18} />
            {Array.from({ length: rows }, (_, ry) =>
              Array.from({ length: cols }, (_, cx) => (
                <rect
                  key={`${ry}-${cx}`}
                  x={b.x + 18 + cx * ((b.w - 36) / cols) + 4}
                  y={top + 34 + ry * 48}
                  width={(b.w - 36) / cols - 10}
                  height={26}
                  rx={7}
                  fill={wr() < 0.35 ? windowOn : windowOff}
                />
              )),
            )}
          </g>
        );
      })}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Cars                                                                */
/* ------------------------------------------------------------------ */

export const Car: React.FC<{
  x: number;
  y: number; // ground line
  scale?: number;
  color: string;
  facing?: 1 | -1;
  wheelTurn?: number; // radians
  bob?: number;
}> = ({ x, y, scale = 1, color, facing = 1, wheelTurn = 0, bob = 0 }) => {
  const ink = T.ink;
  const wheel = (wx: number) => (
    <g transform={`translate(${wx} -30)`}>
      <circle r={36} fill="#22355e" stroke={ink} strokeWidth={7} />
      <circle r={17} fill="#c9d8ee" />
      <g transform={`rotate(${(wheelTurn * 180) / Math.PI})`}>
        <rect x={-3} y={-15} width={6} height={30} rx={3} fill="#7f93b8" />
        <rect x={-15} y={-3} width={30} height={6} rx={3} fill="#7f93b8" />
      </g>
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${scale * facing} ${scale})`}>
      <ellipse cx={0} cy={4} rx={170} ry={16} fill={T.ink} opacity={0.3} filter="url(#blur6)" />
      <g transform={`translate(0 ${bob})`}>
        {/* cabin */}
        <rect x={-92} y={-176} width={170} height={110} rx={52} fill={color} stroke={ink} strokeWidth={7} />
        <rect x={-74} y={-158} width={64} height={62} rx={20} fill="#bfe3ff" stroke={ink} strokeWidth={5} />
        <rect x={0} y={-158} width={62} height={62} rx={20} fill="#bfe3ff" stroke={ink} strokeWidth={5} />
        <path d="M-64,-150 l18,0 l-26,44 l-10,0 Z" fill="#fff" opacity={0.75} />
        <path d="M10,-150 l14,0 l-22,40 l-8,0 Z" fill="#fff" opacity={0.6} />
        {/* body */}
        <rect x={-160} y={-112} width={320} height={84} rx={40} fill={color} stroke={ink} strokeWidth={7} />
        <rect x={-160} y={-112} width={320} height={84} rx={40} fill="url(#shadeDown)" />
        <rect x={-132} y={-104} width={240} height={14} rx={7} fill="#fff" opacity={0.6} />
        <line x1={-6} y1={-100} x2={-6} y2={-40} stroke={ink} strokeWidth={4} opacity={0.5} />
        <rect x={14} y={-82} width={26} height={8} rx={4} fill={ink} opacity={0.55} />
        {/* lights + bumpers */}
        <circle cx={146} cy={-80} r={15} fill="#fff6c2" stroke={ink} strokeWidth={5} />
        <rect x={-166} y={-92} width={18} height={26} rx={8} fill="#ff6b6b" stroke={ink} strokeWidth={4} />
        <rect x={120} y={-42} width={50} height={18} rx={9} fill="#dfe8f5" stroke={ink} strokeWidth={5} />
        <rect x={-170} y={-42} width={50} height={18} rx={9} fill="#dfe8f5" stroke={ink} strokeWidth={5} />
        {wheel(-92)}
        {wheel(92)}
      </g>
    </g>
  );
};

/** Speech-bubble horn: "بيب!" */
export const HornBubble: React.FC<{ x: number; y: number; s: number; text?: string; flip?: boolean }> = ({
  x,
  y,
  s,
  text = "بيب!",
  flip,
}) => {
  if (s <= 0.02) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${(flip ? -1 : 1) * s} ${s})`} filter="url(#shadowSm)">
      <path d="M-90,-70 h180 a36,36 0 0 1 36,36 v34 a36,36 0 0 1 -36,36 h-110 l-34,34 l6,-34 h-42 a36,36 0 0 1 -36,-36 v-34 a36,36 0 0 1 36,-36 Z" fill="#fff" stroke={T.ink} strokeWidth={7} />
      <text
        x={0}
        y={-2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily={FONT}
        fontWeight={800}
        fontSize={56}
        fill="#ff5a5a"
        transform={flip ? "scale(-1 1)" : undefined}
        direction="rtl"
      >
        {text}
      </text>
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Alarm clock                                                         */
/* ------------------------------------------------------------------ */

export const AlarmClock: React.FC<{
  x: number;
  y: number;
  r: number;
  minute: number; // radians
  hour: number;
  shake: number; // degrees
  ring: number; // 0..1 ring-line intensity
}> = ({ x, y, r, minute, hour, shake, ring }) => {
  const ink = T.ink;
  const bell = (side: number) => (
    <g transform={`rotate(${side * 34}) translate(0 ${-r - 28}) rotate(${side * Math.sin(shake) * 6})`}>
      <path d={`M${-r * 0.36},20 a${r * 0.36},${r * 0.34} 0 0 1 ${r * 0.72},0 Z`} fill="url(#yellowBall)" stroke={ink} strokeWidth={8} />
      <ellipse cx={-r * 0.12} cy={-r * 0.1} rx={r * 0.08} ry={r * 0.04} fill="#fff" opacity={0.85} />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) rotate(${shake})`} filter="url(#shadowSoft)">
      {/* legs */}
      {[-1, 1].map((s) => (
        <rect key={s} x={s * r * 0.62 - 16} y={r * 0.72} width={32} height={r * 0.32} rx={14} fill={T.blueDeep} stroke={ink} strokeWidth={7} transform={`rotate(${s * -28} ${s * r * 0.62} ${r * 0.72})`} />
      ))}
      {bell(-1)}
      {bell(1)}
      <rect x={-12} y={-r - 44} width={24} height={30} rx={8} fill={T.yellowDeep} stroke={ink} strokeWidth={6} />
      {/* body */}
      <circle r={r} fill="url(#blueBall)" stroke={ink} strokeWidth={9} />
      <circle r={r * 0.8} fill="#ffffff" stroke={ink} strokeWidth={6} />
      <circle r={r * 0.8} fill="url(#shadeDown)" opacity={0.6} />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const big = i % 3 === 0;
        return (
          <line
            key={i}
            x1={Math.sin(a) * r * (big ? 0.6 : 0.66)}
            y1={-Math.cos(a) * r * (big ? 0.6 : 0.66)}
            x2={Math.sin(a) * r * 0.72}
            y2={-Math.cos(a) * r * 0.72}
            stroke={big ? T.blue : "#9cc0ee"}
            strokeWidth={big ? 12 : 7}
            strokeLinecap="round"
          />
        );
      })}
      <line x1={0} y1={0} x2={Math.sin(hour) * r * 0.36} y2={-Math.cos(hour) * r * 0.36} stroke={ink} strokeWidth={16} strokeLinecap="round" />
      <line x1={0} y1={0} x2={Math.sin(minute) * r * 0.58} y2={-Math.cos(minute) * r * 0.58} stroke={T.blue} strokeWidth={11} strokeLinecap="round" />
      <circle r={r * 0.09} fill="url(#yellowBall)" stroke={ink} strokeWidth={5} />
      {/* glass glare */}
      <path d={`M${-r * 0.62},${-r * 0.2} A${r * 0.66},${r * 0.66} 0 0 1 ${-r * 0.2},${-r * 0.62}`} fill="none" stroke="#fff" strokeWidth={r * 0.07} strokeLinecap="round" opacity={0.9} />
      <path d={`M${-r * 0.86},${-r * 0.3} A${r * 0.9},${r * 0.9} 0 0 1 ${-r * 0.3},${-r * 0.86}`} fill="none" stroke="#fff" strokeWidth={r * 0.05} strokeLinecap="round" opacity={0.7} />
      {/* ring lines */}
      {ring > 0.02 &&
        [-1, 1].map((s) => (
          <g key={s} stroke="#fff" strokeWidth={10} strokeLinecap="round" opacity={ring}>
            {[0, 1, 2].map((i) => {
              const a = -Math.PI / 2 + s * (0.7 + i * 0.28);
              const r0 = r * 1.18;
              const r1 = r * (1.36 + 0.06 * ring);
              return <line key={i} x1={Math.cos(a) * r0} y1={Math.sin(a) * r0} x2={Math.cos(a) * r1} y2={Math.sin(a) * r1} />;
            })}
          </g>
        ))}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Shopping cart with bags                                              */
/* ------------------------------------------------------------------ */

export const ShoppingCart: React.FC<{ x: number; y: number; scale: number; rattle: number; wheelTurn: number }> = ({
  x,
  y,
  scale,
  rattle,
  wheelTurn,
}) => {
  const ink = T.ink;
  const bag = (bx: number, by: number, w: number, h: number, color: string, rot: number, i: number) => (
    <g key={i} transform={`translate(${bx} ${by}) rotate(${rot + Math.sin(rattle * 2 + i) * 3})`}>
      {/* goodies peeking out */}
      <rect x={-w * 0.3} y={-h - 40} width={26} height={70} rx={12} fill="#ffe08a" stroke={ink} strokeWidth={5} />
      <circle cx={w * 0.15} cy={-h - 18} r={24} fill="#7bd389" stroke={ink} strokeWidth={5} />
      <rect x={-w / 2} y={-h} width={w} height={h} rx={16} fill={color} stroke={ink} strokeWidth={7} />
      <rect x={-w / 2} y={-h} width={w} height={h} rx={16} fill="url(#shadeDown)" />
      <path d={`M${-w * 0.22},${-h} q${w * 0.22},-${h * 0.35} ${w * 0.44},0`} fill="none" stroke={ink} strokeWidth={6} />
      <rect x={-w / 2 + 12} y={-h + 12} width={10} height={h - 30} rx={5} fill="#fff" opacity={0.5} />
    </g>
  );
  return (
    <g transform={`translate(${x} ${y + Math.abs(Math.sin(rattle * 3)) * -6}) scale(${scale})`} filter="url(#shadowSoft)">
      {bag(-70, -120, 130, 150, "#fff3d6", -6, 0)}
      {bag(60, -126, 120, 170, T.yellow, 5, 1)}
      {bag(-5, -110, 110, 120, "#d9ecff", 1, 2)}
      {/* basket */}
      <path d="M-190,-150 L190,-150 L150,-10 L-150,-10 Z" fill="#e8f2ff" fillOpacity={0.55} stroke={ink} strokeWidth={9} strokeLinejoin="round" />
      {[-120, -60, 0, 60, 120].map((gx) => (
        <line key={gx} x1={gx} y1={-150} x2={gx * 0.82} y2={-10} stroke={ink} strokeWidth={5} opacity={0.7} />
      ))}
      <line x1={-175} y1={-100} x2={175} y2={-100} stroke={ink} strokeWidth={5} opacity={0.7} />
      <line x1={-160} y1={-55} x2={160} y2={-55} stroke={ink} strokeWidth={5} opacity={0.7} />
      <path d="M190,-150 L230,-210 L280,-210" fill="none" stroke={ink} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
      <rect x={258} y={-224} width={60} height={28} rx={14} fill={T.blue} stroke={ink} strokeWidth={6} />
      <path d="M-150,-10 L-140,30 L150,30" fill="none" stroke={ink} strokeWidth={9} strokeLinecap="round" />
      {[-110, 120].map((wx) => (
        <g key={wx} transform={`translate(${wx} 46) rotate(${(wheelTurn * 180) / Math.PI})`}>
          <circle r={22} fill="#22355e" stroke={ink} strokeWidth={6} />
          <rect x={-3} y={-12} width={6} height={24} rx={3} fill="#9fb2d4" />
        </g>
      ))}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Errand list sheets fluttering                                        */
/* ------------------------------------------------------------------ */

export const ListSheet: React.FC<{ x: number; y: number; rot: number; s: number; checked: number }> = ({
  x,
  y,
  rot,
  s,
  checked,
}) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} filter="url(#shadowSm)">
    <rect x={-70} y={-90} width={140} height={180} rx={18} fill="#ffffff" stroke={T.ink} strokeWidth={6} />
    <rect x={-30} y={-102} width={60} height={22} rx={8} fill={T.yellow} stroke={T.ink} strokeWidth={5} />
    {[0, 1, 2, 3].map((i) => (
      <g key={i} transform={`translate(0 ${-50 + i * 38})`}>
        <rect x={30} y={-11} width={22} height={22} rx={6} fill="none" stroke={T.blue} strokeWidth={5} />
        {i < checked && <path d="M33,0 l7,8 l12,-16" fill="none" stroke="#ff5a5a" strokeWidth={6} strokeLinecap="round" />}
        <rect x={-50} y={-5} width={68} height={10} rx={5} fill="#b8d2f2" />
      </g>
    ))}
  </g>
);
