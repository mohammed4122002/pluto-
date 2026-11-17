import { FONT } from "../fonts";
import { T } from "../theme";

const ink = T.ink;

/* ------------------------------------------------------------------ */
/* Delivery van (side view, facing right, (0,0) = ground centre)        */
/* ------------------------------------------------------------------ */

export const Van: React.FC<{ x: number; y: number; s: number; wheelTurn: number; bob: number; label: string; sx?: number; sy?: number }> = ({
  x,
  y,
  s,
  wheelTurn,
  bob,
  label,
  sx = 1,
  sy = 1,
}) => {
  const wheel = (wx: number) => (
    <g transform={`translate(${wx} -40)`}>
      <circle r={50} fill="#22355e" stroke={ink} strokeWidth={8} />
      <circle r={24} fill="#d2deef" />
      <g transform={`rotate(${(wheelTurn * 180) / Math.PI})`}>
        {[0, 60, 120].map((a) => (
          <rect key={a} x={-4} y={-22} width={8} height={44} rx={4} fill="#8ea3c7" transform={`rotate(${a})`} />
        ))}
      </g>
    </g>
  );
  return (
    <g transform={`translate(${x} ${y}) scale(${s * sx} ${s * sy})`}>
      <ellipse cx={0} cy={6} rx={320} ry={22} fill={ink} opacity={0.3} filter="url(#blur12)" />
      <g transform={`translate(0 ${bob})`}>
        {/* cargo box */}
        <rect x={-300} y={-330} width={400} height={280} rx={40} fill="#ffffff" stroke={ink} strokeWidth={8} />
        <rect x={-300} y={-330} width={400} height={280} rx={40} fill="url(#shadeDown)" />
        <rect x={-300} y={-150} width={400} height={44} fill={T.blue} />
        <rect x={-300} y={-106} width={400} height={14} fill={T.yellow} />
        <rect x={-270} y={-312} width={340} height={20} rx={10} fill="#fff" opacity={0.8} />
        <text x={-100} y={-222} textAnchor="middle" dominantBaseline="middle" fontFamily={FONT} fontWeight={800} fontSize={74} fill={T.blue} direction="rtl" stroke={ink} strokeWidth={0}>
          {label}
        </text>
        {[0, 1, 2].map((i) => (
          <circle key={i} cx={-250 + i * 34} cy={-262 + (i % 2) * 20} r={12 + i * 3} fill="none" stroke={T.blueLight} strokeWidth={4} />
        ))}
        {/* cabin */}
        <path d="M100,-50 L100,-270 Q100,-290 122,-290 L190,-290 Q222,-290 240,-260 L290,-170 Q300,-150 300,-130 L300,-70 Q300,-50 280,-50 Z" fill={T.blue} stroke={ink} strokeWidth={8} strokeLinejoin="round" />
        <path d="M130,-170 L130,-252 Q130,-262 140,-262 L182,-262 Q200,-262 210,-246 L254,-170 Z" fill="#bfe3ff" stroke={ink} strokeWidth={6} strokeLinejoin="round" />
        <path d="M150,-250 l18,0 l-30,64 l-10,0 Z" fill="#fff" opacity={0.7} />
        <rect x={110} y={-280} width={14} height={180} rx={7} fill="#fff" opacity={0.35} />
        <circle cx={292} cy={-110} r={16} fill="#fff6c2" stroke={ink} strokeWidth={5} />
        <rect x={140} y={-140} width={34} height={10} rx={5} fill={ink} opacity={0.6} />
        {/* bumpers */}
        <rect x={250} y={-70} width={70} height={26} rx={12} fill="#dfe8f5" stroke={ink} strokeWidth={6} />
        <rect x={-320} y={-70} width={60} height={26} rx={12} fill="#dfe8f5" stroke={ink} strokeWidth={6} />
        {wheel(-170)}
        {wheel(180)}
      </g>
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Branded parcel (2.5D), (0,0) = bottom centre                         */
/* ------------------------------------------------------------------ */

export const Parcel: React.FC<{ x: number; y: number; s: number; sx?: number; sy?: number; rot?: number; open?: number; label: string }> = ({
  x,
  y,
  s,
  sx = 1,
  sy = 1,
  rot = 0,
  open = 0,
  label,
}) => {
  const w = 220;
  const h = 170;
  const d = 60; // depth offset for the top/side faces
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s * sx} ${s * sy})`}>
      <ellipse cx={20} cy={4} rx={160} ry={16} fill={ink} opacity={0.28} filter="url(#blur6)" />
      {/* side */}
      <path d={`M${w / 2},0 L${w / 2 + d},${-d * 0.6} L${w / 2 + d},${-h - d * 0.6} L${w / 2},${-h} Z`} fill="#d6e6fa" stroke={ink} strokeWidth={6} strokeLinejoin="round" />
      {/* top */}
      {open <= 0 ? (
        <path d={`M${-w / 2},${-h} L${-w / 2 + d},${-h - d * 0.6} L${w / 2 + d},${-h - d * 0.6} L${w / 2},${-h} Z`} fill="#ffffff" stroke={ink} strokeWidth={6} strokeLinejoin="round" />
      ) : (
        <g>
          <path d={`M${-w / 2},${-h} L${-w / 2 + d},${-h - d * 0.6} L${w / 2 + d},${-h - d * 0.6} L${w / 2},${-h} Z`} fill="#8fb4e6" stroke={ink} strokeWidth={6} />
          <path d={`M${-w / 2},${-h} L${-w / 2 - 50 * open},${-h - 70 * open} L${w / 2 - 50 * open},${-h - 70 * open} L${w / 2},${-h} Z`} fill="#ffffff" stroke={ink} strokeWidth={6} strokeLinejoin="round" />
          <path d={`M${-w / 2 + d},${-h - d * 0.6} L${-w / 2 + d + 30 * open},${-h - d * 0.6 - 90 * open} L${w / 2 + d + 30 * open},${-h - d * 0.6 - 90 * open} L${w / 2 + d},${-h - d * 0.6} Z`} fill="#eef5ff" stroke={ink} strokeWidth={6} strokeLinejoin="round" />
        </g>
      )}
      {/* front */}
      <rect x={-w / 2} y={-h} width={w} height={h} rx={8} fill="#ffffff" stroke={ink} strokeWidth={7} />
      <rect x={-w / 2} y={-h} width={w} height={h} rx={8} fill="url(#shadeDown)" />
      <rect x={-18} y={-h} width={36} height={h} fill={T.blue} opacity={0.9} />
      <rect x={-w / 2 + 18} y={-h + 50} width={w - 36} height={62} rx={14} fill={T.yellow} stroke={ink} strokeWidth={5} />
      <text x={0} y={-h + 84} textAnchor="middle" dominantBaseline="middle" fontFamily={FONT} fontWeight={800} fontSize={40} fill={T.blueDeep} direction="rtl">
        {label}
      </text>
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* House front                                                          */
/* ------------------------------------------------------------------ */

export const DOOR = { x: 375, y: 880, w: 330, h: 620 };

export const HouseFront: React.FC<{ doorOpen: number; bell: number; t: number }> = ({ doorOpen, bell, t }) => {
  const { x, y, w, h } = DOOR;
  const openX = 1 - 0.82 * doorOpen;
  const windowAt = (wx: number) => (
    <g transform={`translate(${wx} 600)`}>
      <rect x={-12} y={-12} width={234} height={314} rx={36} fill="#ffffff" stroke={ink} strokeWidth={8} />
      <rect x={0} y={0} width={210} height={290} rx={26} fill="#bfe3ff" stroke={ink} strokeWidth={6} />
      <path d="M30,20 l40,0 l-70,140 l0,-80 Z" fill="#fff" opacity={0.6} />
      <line x1={105} y1={0} x2={105} y2={290} stroke={ink} strokeWidth={6} />
      <line x1={0} y1={145} x2={210} y2={145} stroke={ink} strokeWidth={6} />
      <path d={`M0,0 Q40,${120 + Math.sin(t * 2) * 6} 10,290 L0,290 Z`} fill={T.yellow} stroke={ink} strokeWidth={5} />
      <path d={`M210,0 Q170,${120 + Math.sin(t * 2 + 1) * 6} 200,290 L210,290 Z`} fill={T.yellow} stroke={ink} strokeWidth={5} />
      <rect x={-30} y={292} width={270} height={30} rx={14} fill={T.blue} stroke={ink} strokeWidth={6} />
      {[20, 80, 140, 200].map((fx, i) => (
        <circle key={fx} cx={fx} cy={284 - (i % 2) * 10} r={22} fill={i % 2 ? "#ff8fb0" : "#7bd389"} stroke={ink} strokeWidth={5} />
      ))}
    </g>
  );
  return (
    <g>
      {/* wall */}
      <rect x={0} y={330} width={1080} height={1240} fill="#fdf7ec" />
      <rect x={0} y={330} width={1080} height={1240} fill="url(#shadeDown)" opacity={0.5} />
      {Array.from({ length: 10 }, (_, i) => (
        <line key={i} x1={0} y1={480 + i * 110} x2={1080} y2={480 + i * 110} stroke="#efe3cc" strokeWidth={4} />
      ))}
      {/* roof */}
      <path d="M-40,250 L1120,250 L1120,380 Q540,420 -40,380 Z" fill={T.blue} stroke={ink} strokeWidth={9} />
      <path d="M-40,250 L1120,250 L1120,290 L-40,290 Z" fill="#4fa3ff" />
      {Array.from({ length: 12 }, (_, i) => (
        <path key={i} d={`M${-40 + i * 100},380 q50,40 100,0`} fill={T.blue} stroke={ink} strokeWidth={7} />
      ))}
      {windowAt(60)}
      {windowAt(810)}

      {/* door frame + interior light */}
      <rect x={x - 30} y={y - 30} width={w + 60} height={h + 30} rx={30} fill={T.yellow} stroke={ink} strokeWidth={8} />
      <rect x={x} y={y} width={w} height={h} rx={14} fill="#ffe9a8" />
      <rect x={x} y={y} width={w} height={h} rx={14} fill="url(#warmLight)" opacity={doorOpen} />
      {/* door panel, hinged on the left */}
      <g transform={`translate(${x} 0) scale(${openX} 1) translate(${-x} 0)`}>
        <rect x={x} y={y} width={w} height={h} rx={14} fill={T.blue} stroke={ink} strokeWidth={8} />
        <rect x={x} y={y} width={w} height={h} rx={14} fill="url(#shadeDown)" />
        <rect x={x + 40} y={y + 50} width={w - 80} height={220} rx={24} fill="#3f8cff" stroke={ink} strokeWidth={6} />
        <rect x={x + 40} y={y + 320} width={w - 80} height={240} rx={24} fill="#3f8cff" stroke={ink} strokeWidth={6} />
        <rect x={x + 56} y={y + 64} width={18} height={190} rx={9} fill="#fff" opacity={0.5} />
        <circle cx={x + w - 50} cy={y + h * 0.55} r={20} fill="url(#yellowBall)" stroke={ink} strokeWidth={6} />
        <rect x={x} y={y} width={w} height={h} rx={14} fill="#06205a" opacity={doorOpen * 0.35} />
      </g>
      {/* awning */}
      <path d={`M${x - 70},${y - 40} L${x + w + 70},${y - 40} L${x + w + 40},${y - 120} L${x - 40},${y - 120} Z`} fill="#ffffff" stroke={ink} strokeWidth={8} strokeLinejoin="round" />
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} d={`M${x - 70 + i * 78},${y - 40} q39,46 78,0`} fill={i % 2 ? "#ffffff" : T.blue} stroke={ink} strokeWidth={7} />
      ))}
      {/* doorbell */}
      <circle cx={x + w + 70} cy={y + 250} r={18} fill="url(#yellowBall)" stroke={ink} strokeWidth={6} />
      {bell > 0.02 &&
        [1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M${x + w + 100 + i * 22},${y + 210} q22,40 0,80`}
            fill="none"
            stroke={T.blue}
            strokeWidth={8}
            strokeLinecap="round"
            opacity={bell * (1 - i * 0.2)}
          />
        ))}
      {/* lamp */}
      <g transform={`translate(${x - 90} ${y + 120})`}>
        <circle r={70} fill="url(#warmLight)" opacity={0.7} />
        <rect x={-26} y={-40} width={52} height={74} rx={18} fill="#fff6c2" stroke={ink} strokeWidth={6} />
        <rect x={-34} y={-54} width={68} height={20} rx={8} fill={T.blue} stroke={ink} strokeWidth={6} />
      </g>
      {/* plants */}
      {[x - 150, x + w + 150].map((px, i) => (
        <g key={px} transform={`translate(${px} 1500) rotate(${Math.sin(t * 1.5 + i) * 2})`}>
          {[-40, 0, 40].map((lx, j) => (
            <ellipse key={lx} cx={lx * 0.8} cy={-170 - (j === 1 ? 40 : 0)} rx={34} ry={80} fill={j === 1 ? "#5cc77a" : "#7bd389"} stroke={ink} strokeWidth={6} transform={`rotate(${lx * 0.6} ${lx * 0.8} -110)`} />
          ))}
          <path d="M-70,-110 L70,-110 L54,0 L-54,0 Z" fill={T.yellow} stroke={ink} strokeWidth={7} strokeLinejoin="round" />
          <rect x={-78} y={-128} width={156} height={30} rx={12} fill={T.yellowDeep} stroke={ink} strokeWidth={6} />
        </g>
      ))}
      {/* step + mat */}
      <rect x={x - 80} y={y + h} width={w + 160} height={60} rx={16} fill="#cfe0f5" stroke={ink} strokeWidth={7} />
      <rect x={x + 20} y={y + h + 8} width={w - 40} height={38} rx={14} fill={T.yellow} stroke={ink} strokeWidth={5} />
      {doorOpen > 0 && (
        <path d={`M${x},${y + h} L${x + w},${y + h} L${x + w + 120},${y + h + 140} L${x - 120},${y + h + 140} Z`} fill="url(#warmLight)" opacity={doorOpen * 0.6} />
      )}
      {/* sidewalk + street */}
      <rect x={0} y={1560} width={1080} height={160} fill="#e3eefb" />
      <rect x={0} y={1560} width={1080} height={14} fill="#ffffff" />
      <rect x={0} y={1720} width={1080} height={220} fill="#46618f" />
      {Array.from({ length: 6 }, (_, i) => (
        <rect key={i} x={20 + i * 200} y={1840} width={100} height={14} rx={7} fill="#fff" opacity={0.8} />
      ))}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Cosy living room                                                     */
/* ------------------------------------------------------------------ */

export const Cat: React.FC<{ x: number; y: number; s: number; breathe: number }> = ({ x, y, s, breathe }) => (
  <g transform={`translate(${x} ${y}) scale(${s} ${s * (1 + breathe * 0.04)})`}>
    <path d="M110,10 q70,-10 40,-60" fill="none" stroke={ink} strokeWidth={30} strokeLinecap="round" />
    <path d="M110,10 q70,-10 40,-60" fill="none" stroke="#ffffff" strokeWidth={18} strokeLinecap="round" />
    <ellipse cx={0} cy={-40} rx={150} ry={74} fill="#ffffff" stroke={ink} strokeWidth={8} />
    <ellipse cx={30} cy={-80} rx={60} ry={26} fill="#ffd8a8" opacity={0.9} />
    <ellipse cx={-40} cy={-70} rx={90} ry={18} fill="#fff" opacity={0.6} />
    <g transform="translate(-110 -50)">
      <path d="M-40,-30 L-34,-88 L-4,-52 Z" fill="#ffffff" stroke={ink} strokeWidth={7} strokeLinejoin="round" />
      <path d="M20,-50 L44,-92 L54,-32 Z" fill="#ffffff" stroke={ink} strokeWidth={7} strokeLinejoin="round" />
      <path d="M-30,-60 L-28,-78 L-14,-58 Z" fill="#ffb3c4" />
      <ellipse cx={0} cy={-12} rx={66} ry={54} fill="#ffffff" stroke={ink} strokeWidth={8} />
      <path d="M-34,-14 q12,10 24,0" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" />
      <path d="M8,-14 q12,10 24,0" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" />
      <ellipse cx={-1} cy={6} rx={8} ry={5} fill="#ff8fa8" />
      <circle cx={-44} cy={8} r={12} fill="#ffc2d1" opacity={0.7} />
      <circle cx={40} cy={8} r={12} fill="#ffc2d1" opacity={0.7} />
    </g>
    <path d="M-60,20 q80,30 170,-6" fill="none" stroke={ink} strokeWidth={8} strokeLinecap="round" />
  </g>
);

export const TeaCup: React.FC<{ x: number; y: number; s: number; t: number }> = ({ x, y, s, t }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {[0, 1, 2].map((i) => {
      const k = (t * 0.6 + i / 3) % 1;
      return (
        <path
          key={i}
          d={`M${-20 + i * 20},-80 q${16 * Math.sin(t * 3 + i)},-30 0,-60 q-16,-30 0,-60`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={12}
          strokeLinecap="round"
          opacity={0.85 * Math.sin(k * Math.PI)}
          transform={`translate(0 ${-k * 40})`}
        />
      );
    })}
    <ellipse cx={0} cy={0} rx={110} ry={22} fill={T.yellow} stroke={ink} strokeWidth={7} />
    <path d="M-70,-90 L70,-90 Q66,-10 0,-6 Q-66,-10 -70,-90 Z" fill="#ffffff" stroke={ink} strokeWidth={8} strokeLinejoin="round" />
    <path d="M66,-70 q50,0 40,34 q-8,22 -46,20" fill="none" stroke={ink} strokeWidth={10} />
    <ellipse cx={0} cy={-90} rx={70} ry={14} fill="#c98a4b" stroke={ink} strokeWidth={6} />
    <rect x={-52} y={-74} width={12} height={50} rx={6} fill={T.sky} />
  </g>
);

export const LivingRoom: React.FC<{ t: number; boxOpen: number; label: string }> = ({ t, boxOpen, label }) => {
  return (
    <g>
      <rect x={0} y={0} width={1080} height={1440} fill="#dcefff" />
      <rect x={0} y={0} width={1080} height={1440} fill="url(#shadeDown)" opacity={0.5} />
      {/* window + light beams */}
      <g transform="translate(90 330)">
        <rect x={-14} y={-14} width={318} height={418} rx={40} fill="#ffffff" stroke={ink} strokeWidth={8} />
        <rect x={0} y={0} width={290} height={390} rx={30} fill="#9fd6ff" stroke={ink} strokeWidth={6} />
        <circle cx={210} cy={90} r={50} fill="url(#yellowBall)" />
        <line x1={145} y1={0} x2={145} y2={390} stroke={ink} strokeWidth={6} />
        <path d={`M-20,-20 Q60,${190 + Math.sin(t * 1.5) * 8} 20,410 L-20,410 Z`} fill={T.yellow} stroke={ink} strokeWidth={6} />
      </g>
      <path d="M380,330 L600,330 L1080,1300 L700,1440 Z" fill="#ffffff" opacity={0.18} />
      {/* wall clock — calm */}
      <g transform="translate(860 460)" filter="url(#shadowSm)">
        <circle r={96} fill="#ffffff" stroke={ink} strokeWidth={9} />
        <circle r={96} fill="url(#shadeDown)" opacity={0.5} />
        {[0, 1, 2, 3].map((i) => (
          <circle key={i} cx={Math.sin((i * Math.PI) / 2) * 70} cy={-Math.cos((i * Math.PI) / 2) * 70} r={8} fill={T.blue} />
        ))}
        <line x1={0} y1={0} x2={Math.sin(t * 0.3 + 2) * 40} y2={-Math.cos(t * 0.3 + 2) * 40} stroke={ink} strokeWidth={12} strokeLinecap="round" />
        <line x1={0} y1={0} x2={Math.sin(t * 0.9) * 62} y2={-Math.cos(t * 0.9) * 62} stroke={T.blue} strokeWidth={8} strokeLinecap="round" />
        <circle r={10} fill="url(#yellowBall)" />
      </g>
      {/* framed picture: a little house and bubbles */}
      <g transform="translate(560 640) rotate(-3)" filter="url(#shadowSm)">
        <rect x={-130} y={-100} width={260} height={200} rx={26} fill={T.yellow} stroke={ink} strokeWidth={8} />
        <rect x={-104} y={-74} width={208} height={148} rx={16} fill="#ffffff" stroke={ink} strokeWidth={5} />
        <path d="M-50,50 L-50,0 L0,-40 L50,0 L50,50 Z" fill={T.blue} stroke={ink} strokeWidth={5} strokeLinejoin="round" />
        <rect x={-14} y={16} width={28} height={34} rx={6} fill={T.yellow} stroke={ink} strokeWidth={4} />
        <circle cx={66} cy={-40} r={16} fill="none" stroke={T.blueLight} strokeWidth={5} />
        <circle cx={78} cy={-6} r={9} fill="none" stroke={T.blueLight} strokeWidth={4} />
        <circle cx={-70} cy={-44} r={11} fill="none" stroke={T.blueLight} strokeWidth={4} />
      </g>
      {/* floor lamp */}
      <g transform="translate(150 1400)">
        <circle cx={0} cy={-600} r={190} fill="url(#warmLight)" opacity={0.75} />
        <rect x={-8} y={-560} width={16} height={560} rx={8} fill={T.ink} />
        <ellipse cx={0} cy={0} rx={70} ry={16} fill={T.ink} />
        <path d="M-90,-560 L90,-560 L60,-680 L-60,-680 Z" fill={T.yellow} stroke={ink} strokeWidth={8} strokeLinejoin="round" />
        <rect x={-50} y={-670} width={14} height={100} rx={7} fill="#fff" opacity={0.6} />
      </g>
      {/* floor + rug */}
      <rect x={0} y={1440} width={1080} height={480} fill="#f5e3c0" />
      {Array.from({ length: 6 }, (_, i) => (
        <line key={i} x1={0} y1={1480 + i * 80} x2={1080} y2={1480 + i * 80} stroke="#e7cf9f" strokeWidth={5} />
      ))}
      <rect x={0} y={1428} width={1080} height={24} fill="#ffffff" />
      <ellipse cx={540} cy={1660} rx={470} ry={150} fill={T.yellow} stroke={ink} strokeWidth={8} />
      <ellipse cx={540} cy={1660} rx={420} ry={118} fill={T.blue} />
      <ellipse cx={540} cy={1640} rx={360} ry={70} fill="#4fa3ff" opacity={0.6} />

      {/* sofa */}
      <g transform="translate(560 1450)" filter="url(#shadowSoft)">
        <rect x={-360} y={-380} width={720} height={260} rx={90} fill={T.blue} stroke={ink} strokeWidth={9} />
        <rect x={-330} y={-366} width={660} height={36} rx={18} fill="#fff" opacity={0.3} />
        <rect x={-400} y={-200} width={800} height={150} rx={60} fill="#1f6fe6" stroke={ink} strokeWidth={9} />
        <rect x={-400} y={-200} width={800} height={150} rx={60} fill="url(#shadeDown)" />
        <rect x={-440} y={-290} width={120} height={270} rx={60} fill={T.blue} stroke={ink} strokeWidth={9} />
        <rect x={320} y={-290} width={120} height={270} rx={60} fill={T.blue} stroke={ink} strokeWidth={9} />
        <rect x={-300} y={-330} width={170} height={150} rx={50} fill={T.yellow} stroke={ink} strokeWidth={8} transform="rotate(-8 -215 -255)" />
        <rect x={-290} y={-320} width={150} height={30} rx={15} fill="#fff" opacity={0.5} transform="rotate(-8 -215 -255)" />
        {[-330, 330].map((lx) => (
          <rect key={lx} x={lx - 16} y={-40} width={32} height={50} rx={10} fill="#8b5a2b" stroke={ink} strokeWidth={6} />
        ))}
        <Cat x={90} y={-198} s={0.95} breathe={Math.sin(t * 2.4)} />
        {[0, 1, 2].map((i) => {
          const k = (t * 0.45 + i / 3) % 1;
          return (
            <text
              key={i}
              x={-30 + k * 90 + i * 10}
              y={-330 - k * 170}
              fontFamily={FONT}
              fontWeight={800}
              fontSize={44 + i * 10}
              fill="#ffffff"
              stroke={ink}
              strokeWidth={4}
              paintOrder="stroke"
              opacity={Math.sin(k * Math.PI)}
            >
              z
            </text>
          );
        })}
      </g>

      {/* side table + tea */}
      <g transform="translate(960 1500)">
        <rect x={-110} y={-280} width={220} height={30} rx={14} fill={T.yellow} stroke={ink} strokeWidth={7} />
        <rect x={-12} y={-250} width={24} height={230} fill="#8b5a2b" stroke={ink} strokeWidth={6} />
        <ellipse cx={0} cy={-16} rx={80} ry={16} fill="#8b5a2b" stroke={ink} strokeWidth={6} />
        <TeaCup x={0} y={-290} s={0.7} t={t} />
      </g>

      {/* the opened parcel */}
      <Parcel x={300} y={1760} s={1.05} open={boxOpen} label={label} />
    </g>
  );
};
