import { T } from "../theme";

/**
 * Shared gradients/filters for every SVG in the video. Rendered once (hidden,
 * but not display:none so Chrome still resolves the references).
 */
export const GlobalDefs: React.FC = () => (
  <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
    <defs>
      {/* Cartoon bubble: clear centre, tinted body, bright rim. */}
      <radialGradient id="bubbleBody" cx="0.45" cy="0.42" r="0.6">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.04} />
        <stop offset="0.62" stopColor="#bfe2ff" stopOpacity={0.16} />
        <stop offset="0.9" stopColor="#ffffff" stopOpacity={0.45} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0.8} />
      </radialGradient>
      <linearGradient id="bubbleIris" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ff9be3" />
        <stop offset="0.35" stopColor="#8fe8ff" />
        <stop offset="0.7" stopColor="#fff38a" />
        <stop offset="1" stopColor="#a5b8ff" />
      </linearGradient>

      {/* Foam ball: glossy white with a cool shade at the bottom right. */}
      <radialGradient id="foamBall" cx="0.38" cy="0.32" r="0.75">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.55" stopColor="#ffffff" />
        <stop offset="1" stopColor={T.foamShade} />
      </radialGradient>
      <linearGradient id="foamBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#dcecff" />
      </linearGradient>

      {/* Hourglass parts */}
      <linearGradient id="capBlue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4fa3ff" />
        <stop offset="0.5" stopColor={T.blue} />
        <stop offset="1" stopColor="#0a44ad" />
      </linearGradient>
      <linearGradient id="pillarYellow" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffe58a" />
        <stop offset="0.45" stopColor={T.yellow} />
        <stop offset="1" stopColor={T.yellowDeep} />
      </linearGradient>
      <radialGradient id="yellowBall" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#fff3b8" />
        <stop offset="0.45" stopColor={T.yellow} />
        <stop offset="1" stopColor={T.yellowDeep} />
      </radialGradient>
      <radialGradient id="blueBall" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#8cc4ff" />
        <stop offset="0.5" stopColor={T.blue} />
        <stop offset="1" stopColor="#0a3f9e" />
      </radialGradient>
      <radialGradient id="glassFill" cx="0.5" cy="0.5" r="0.62">
        <stop offset="0" stopColor="#eaf6ff" stopOpacity={0.22} />
        <stop offset="0.72" stopColor="#cfe8ff" stopOpacity={0.36} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0.7} />
      </radialGradient>
      <linearGradient id="glassSheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.45} />
        <stop offset="0.32" stopColor="#ffffff" stopOpacity={0.06} />
        <stop offset="0.75" stopColor="#ffffff" stopOpacity={0} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0.22} />
      </linearGradient>
      <linearGradient id="shineBand" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0} />
        <stop offset="0.5" stopColor="#ffffff" stopOpacity={0.85} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </linearGradient>

      <radialGradient id="softGlow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.9} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </radialGradient>
      <radialGradient id="softDot" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.55} />
        <stop offset="0.7" stopColor="#ffffff" stopOpacity={0.18} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </radialGradient>

      {/* soft, premium drop shadows */}
      <filter id="shadowSoft" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#06205a" floodOpacity="0.32" />
      </filter>
      <filter id="shadowSm" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="8" stdDeviation="7" floodColor="#06205a" floodOpacity="0.3" />
      </filter>
      <filter id="glowWarm" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="30" />
      </filter>
      <linearGradient id="shadeDown" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.45} />
        <stop offset="0.45" stopColor="#ffffff" stopOpacity={0} />
        <stop offset="0.7" stopColor="#06205a" stopOpacity={0} />
        <stop offset="1" stopColor="#06205a" stopOpacity={0.28} />
      </linearGradient>
      <linearGradient id="screenGlare" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity={0.5} />
        <stop offset="0.35" stopColor="#ffffff" stopOpacity={0.08} />
        <stop offset="0.36" stopColor="#ffffff" stopOpacity={0} />
        <stop offset="1" stopColor="#ffffff" stopOpacity={0} />
      </linearGradient>
      <radialGradient id="warmLight" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#fff3b0" stopOpacity={0.95} />
        <stop offset="1" stopColor="#ffc629" stopOpacity={0} />
      </radialGradient>
      <filter id="blur12" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="12" />
      </filter>
      <filter id="blur24" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="24" />
      </filter>
      <filter id="blur6" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
    </defs>
  </svg>
);
