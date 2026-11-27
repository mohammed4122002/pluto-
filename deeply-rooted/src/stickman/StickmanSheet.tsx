import React from 'react';
import {AbsoluteFill, staticFile} from 'remotion';
import {ensureFonts, SUB_FONT, TITLE_FONT} from '../post/fonts';
import {POSES, StickLook, Stickman, StickPose} from './Stickman';

ensureFonts();
export const SSHEET_W = 2880;
export const SSHEET_H = 1620;

const C = {ivory: '#F2EDE3', gold: '#D9B77D', mist: '#8D969B', navy: '#1C2433', teal: '#3E5C63'};

const Fig: React.FC<{x: number; y: number; s?: number; pose: StickPose; facing?: 1 | -1; look?: StickLook; label?: string; prop?: React.ReactNode}> = ({
  x,
  y,
  s = 2.2,
  pose,
  facing = 1,
  look = 'ivory',
  label,
  prop,
}) => (
  <g>
    <ellipse cx={x} cy={y + 2} rx={34 * s * 0.6} ry={4 * s * 0.6} fill="#000" opacity={0.25} />
    {prop && <g transform={`translate(${x} ${y}) scale(${s})`}>{prop}</g>}
    <g transform={`translate(${x} ${y})`}>
      <Stickman pose={pose} facing={facing} look={look} scale={s} />
    </g>
    {label && (
      <text x={x} y={y + 46} textAnchor="middle" fontFamily={SUB_FONT} fontSize={20} letterSpacing={2} fill={C.mist} fontWeight={600}>
        {label}
      </text>
    )}
  </g>
);

export const StickmanSheet: React.FC = () => {
  const ground1 = 760, ground2 = 1420;
  return (
    <AbsoluteFill style={{background: `linear-gradient(160deg, ${C.navy} 0%, #243244 55%, ${C.teal} 130%)`}}>
      <svg width={SSHEET_W} height={SSHEET_H}>
        <image href={staticFile('textures/paper.jpg')} width={SSHEET_W} height={SSHEET_H} preserveAspectRatio="none" opacity={0.06} />
        <text x={90} y={108} fontFamily={SUB_FONT} fontSize={22} letterSpacing={8} fill={C.gold} fontWeight={600}>
          DEEPLY ROOTED · CHARACTER REFERENCE · STICK-FIGURE PROTAGONIST
        </text>
        <text x={88} y={190} fontFamily={TITLE_FONT} fontWeight={600} fontSize={80} fill={C.ivory}>
          The Traveller
        </text>
        <text x={90} y={240} fontFamily={TITLE_FONT} fontStyle="italic" fontSize={34} fill={C.mist}>
          One rig for every shot: circular head · 6.5 heads tall · ivory #F2EDE3 · 5u limbs / 6.5u torso · emotion through posture
        </text>

        {/* turnaround */}
        <line x1={90} x2={1500} y1={ground1} y2={ground1} stroke={C.mist} strokeOpacity={0.35} />
        <Fig x={240} y={ground1} pose={{...POSES.stand, armL: [-11, -5], armR: [11, 5], legL: [-6, 0], legR: [6, 0], eyes: 'front'}} label="FRONT" />
        <Fig x={560} y={ground1} pose={{...POSES.stand, armL: [-4, 6], armR: [12, 6], legL: [-2, 0], legR: [7, 0], eyes: 'threequarter'}} label="THREE-QUARTER" />
        <Fig x={880} y={ground1} pose={{...POSES.standSide, eyes: 'side'}} label="SIDE" />
        <Fig x={1200} y={ground1} pose={{...POSES.stand, armL: [-11, -5], armR: [11, 5], legL: [-6, 0], legR: [6, 0]}} label="BACK / NO FACE" />
        <text x={1360} y={ground1 - 300} fontFamily={SUB_FONT} fontSize={19} fill={C.mist}>
          <tspan x={1360} dy={0}>Eyes appear only in</tspan>
          <tspan x={1360} dy={26}>close-ups, only when</tspan>
          <tspan x={1360} dy={26}>needed. By default he</tspan>
          <tspan x={1360} dy={26}>has no face: posture,</tspan>
          <tspan x={1360} dy={26}>silhouette and movement</tspan>
          <tspan x={1360} dy={26}>carry the emotion.</tspan>
        </text>

        {/* posture library */}
        <text x={90} y={ground2 - 330} fontFamily={SUB_FONT} fontSize={22} letterSpacing={6} fill={C.ivory} fontWeight={600}>
          POSTURE LIBRARY
        </text>
        <line x1={90} x2={2790} y1={ground2} y2={ground2} stroke={C.mist} strokeOpacity={0.35} />
        <Fig x={170} y={ground2} s={1.7} pose={POSES.walkA} label="CONTACT" />
        <Fig x={370} y={ground2} s={1.7} pose={POSES.walkB} label="PASSING" />
        <Fig x={570} y={ground2} s={1.7} pose={POSES.walkC} label="CONTACT" />
        <text x={370} y={ground2 + 84} textAnchor="middle" fontFamily={SUB_FONT} fontSize={18} letterSpacing={3} fill={C.gold}>WALK CYCLE</text>
        <Fig x={790} y={ground2} s={1.7} pose={POSES.headDown} label="HEAD BOWED" />
        <Fig x={1000} y={ground2} s={1.7} pose={POSES.hesitate} label="HESITATION" />
        <Fig x={1210} y={ground2} s={1.7} pose={POSES.lookBack} facing={-1} label="LOOKING BACK" />
        <Fig x={1430} y={ground2} s={1.7} pose={POSES.reach} label="REACHING" />
        <Fig x={1660} y={ground2} s={1.7} pose={POSES.letGo} label="LETTING GO" />
        <Fig
          x={1890}
          y={ground2}
          s={1.7}
          pose={POSES.sitRock}
          label="SITTING"
          prop={<path d="M-30 0 C-32 -18 -22 -34 -2 -36 C18 -37 30 -24 30 0 Z" fill="#4C5460" />}
        />
        <Fig x={2120} y={ground2} s={1.7} pose={POSES.hugKnees} label="WITH THE FEELING" />
        <Fig
          x={2350}
          y={ground2}
          s={1.7}
          pose={POSES.kneelPlant}
          label="PLANTING"
          prop={<path d="M44 0 L44 -14 M44 -10 C38 -16 34 -16 32 -12 M44 -12 C50 -18 54 -17 56 -13" stroke="#8FA36A" strokeWidth={2.2} fill="none" strokeLinecap="round" />}
        />
        <Fig x={2590} y={ground2} s={1.7} pose={POSES.breathe} label="A DEEP BREATH" />

        {/* variants + readability */}
        <text x={1660} y={330} fontFamily={SUB_FONT} fontSize={22} letterSpacing={6} fill={C.ivory} fontWeight={600}>
          STORY VARIANTS
        </text>
        <Fig x={1760} y={ground1} pose={POSES.walkA} look="imagined" label="IMAGINED SELF" />
        <Fig x={1990} y={ground1} pose={POSES.stand} look="younger" label="YOUNGER SELF" />
        <text x={1660} y={ground1 + 90} fontFamily={SUB_FONT} fontSize={18} fill={C.mist}>
          <tspan x={1660} dy={0}>Imagined self: the confident version</tspan>
          <tspan x={1660} dy={24}>he pictured (luminous, translucent).</tspan>
          <tspan x={1660} dy={30}>Younger self: same head, shorter</tspan>
          <tspan x={1660} dy={24}>limbs; reads younger, never cartoonish.</tspan>
        </text>
        <text x={2240} y={330} fontFamily={SUB_FONT} fontSize={22} letterSpacing={6} fill={C.ivory} fontWeight={600}>
          READABILITY
        </text>
        <rect x={2240} y={360} width={250} height={420} rx={10} fill="#E9DFC9" />
        <g transform="translate(2365 740)">
          <Stickman pose={POSES.stand} scale={2} />
        </g>
        <rect x={2510} y={360} width={250} height={420} rx={10} fill="#0F141D" />
        <g transform="translate(2635 740)">
          <Stickman pose={POSES.stand} scale={2} glow={0.25} />
        </g>
        <text x={2240} y={812} fontFamily={SUB_FONT} fontSize={18} fill={C.mist}>
          <tspan x={2240} dy={0}>Thin charcoal edge: readable on bright skies.</tspan>
          <tspan x={2240} dy={24}>Ivory body: carries on dark scenes.</tspan>
        </text>
        {[0.35, 0.6, 1].map((s, i) => (
          <g key={s} transform={`translate(${2300 + i * 150} 1060)`}>
            <Stickman pose={POSES.walkA} scale={s} />
          </g>
        ))}
        <text x={2240} y={1104} fontFamily={SUB_FONT} fontSize={18} fill={C.mist}>
          Scale test: reads even at extreme-wide size (≈55 px).
        </text>
      </svg>
    </AbsoluteFill>
  );
};
