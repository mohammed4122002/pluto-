import { T } from "../theme";

/** Rounded, bubbly icons drawn on a glossy yellow badge. */
export type IconKind = "globe" | "phone" | "pin" | "chat";

const Glyph: React.FC<{ kind: IconKind; color: string }> = ({ kind, color }) => {
  const sw = 7;
  if (kind === "globe") {
    return (
      <g fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
        <circle r={27} />
        <ellipse rx={12} ry={27} />
        <path d="M-25,-9 Q0,-4 25,-9" />
        <path d="M-25,9 Q0,14 25,9" />
      </g>
    );
  }
  if (kind === "chat") {
    // generic chat bubble with a handset (WhatsApp-style messaging, no trademark)
    return (
      <g>
        <path
          d="M0,-30 a30,30 0 1 1 -24,48 l-12,6 l5,-14 a30,30 0 0 1 31,-40 Z"
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinejoin="round"
        />
        <path
          d="M-11,-12 q-3,4 1,12 q6,11 16,15 q7,2 10,-2 l-6,-7 q-3,2 -6,0 q-6,-4 -9,-10 q-1,-3 1,-5 Z"
          fill={color}
        />
      </g>
    );
  }
  if (kind === "phone") {
    return (
      <g>
        <rect x={-18} y={-30} width={36} height={60} rx={11} fill="none" stroke={color} strokeWidth={sw} />
        <line x1={-6} y1={-19} x2={6} y2={-19} stroke={color} strokeWidth={5} strokeLinecap="round" />
        <circle cx={0} cy={19} r={4.5} fill={color} />
      </g>
    );
  }
  return (
    <g>
      <path
        d="M0,32 C-14,16 -26,4 -26,-9 A26,26 0 1 1 26,-9 C26,4 14,16 0,32 Z"
        fill={color}
        stroke={color}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      <circle cx={0} cy={-9} r={10} fill="#fff" />
    </g>
  );
};

export const IconBadge: React.FC<{ kind: IconKind; size?: number }> = ({ kind, size = 104 }) => {
  return (
    <svg width={size} height={size} viewBox="-60 -60 120 120" style={{ overflow: "visible" }}>
      <circle r={52} fill="url(#yellowBall)" stroke={T.ink} strokeWidth={6} />
      <ellipse cx={-18} cy={-28} rx={17} ry={9} fill="#fff" opacity={0.8} transform="rotate(-30 -18 -28)" />
      <g transform="translate(0 3)">
        <Glyph kind={kind} color={T.blueDeep} />
      </g>
    </svg>
  );
};
