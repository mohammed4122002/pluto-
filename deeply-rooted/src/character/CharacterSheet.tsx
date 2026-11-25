import React from 'react';
import {AbsoluteFill, staticFile} from 'remotion';
import {palette, tones} from '../config/palette';
import {MapPanels} from '../props/PaperMap';
import {FoldedPacket} from './Hands';
import {CharLight, Lit} from './Lighting';
import {WalkerFront, WalkerSide} from './SheetViews';
import {neutralPose, Pose34, Walker34, WALKER34_BOUNDS} from './Walker34';
import {WalkerBack, WALKERBACK_BOUNDS} from './WalkerBack';
import {WALKER} from './spec';
import {Mode} from './spec';

export const SHEET_W = 2880;
export const SHEET_H = 1620;

const serif = 'Caladea, "Bitstream Charter", Georgia, serif';
const sans = 'Inter, "DejaVu Sans", sans-serif';
const ink = palette.charcoal;

const studioLight: CharLight = {
  rim: '#FFF6E6',
  rimStrength: 0.35,
  rimWidth: 0.7,
  rimDir: 1,
  fill: palette.mist,
  fillStrength: 0.18,
  haze: palette.ivory,
  hazeAmount: 0,
  texture: 0.2,
};

const Figure: React.FC<{x: number; y: number; k: number; id: string; bounds: [number, number, number, number]; render: (m: Mode) => React.ReactNode}> = ({
  x,
  y,
  k,
  id,
  bounds,
  render,
}) => (
  <g transform={`translate(${x} ${y}) scale(${k} ${-k})`}>
    <ellipse cx={0} cy={0} rx={26} ry={3.2} fill={palette.charcoal} opacity={0.12} />
    <Lit id={id} light={studioLight} bounds={bounds} render={render} />
  </g>
);

const Label: React.FC<{x: number; y: number; title: string; sub?: string; anchor?: 'start' | 'middle'}> = ({x, y, title, sub, anchor = 'middle'}) => (
  <g>
    <text x={x} y={y} textAnchor={anchor} fontFamily={sans} fontSize={22} letterSpacing={4} fill={ink} fontWeight={600}>
      {title}
    </text>
    {sub && (
      <text x={x} y={y + 30} textAnchor={anchor} fontFamily={serif} fontSize={22} fill={palette.brown} fontStyle="italic">
        {sub}
      </text>
    )}
  </g>
);

/** A head-and-shoulders crop of the hero rig for expression studies. */
const ExpressionHead: React.FC<{x: number; y: number; pose: Partial<Pose34>; id: string; title: string}> = ({x, y, pose, id, title}) => {
  const k = 15;
  const p: Pose34 = {...neutralPose, ...pose, detail: 1};
  return (
    <g>
      <clipPath id={`${id}-clip`}>
        <rect x={x - 190} y={y - 230} width={380} height={330} rx={6} />
      </clipPath>
      <rect x={x - 190} y={y - 230} width={380} height={330} rx={6} fill="#E7DFD0" />
      <g clipPath={`url(#${id}-clip)`}>
        <g transform={`translate(${x + 40} ${y + 2430}) scale(${k} ${-k})`}>
          <Lit id={id} light={studioLight} bounds={WALKER34_BOUNDS} render={(m) => <Walker34 mode={m} p={p} uid={id} />} />
        </g>
      </g>
      <text x={x} y={y + 140} textAnchor="middle" fontFamily={serif} fontSize={24} fill={ink}>
        {title}
      </text>
    </g>
  );
};

const Swatch: React.FC<{x: number; y: number; c: string; name: string}> = ({x, y, c, name}) => (
  <g>
    <rect x={x} y={y} width={64} height={64} rx={6} fill={c} stroke="#00000018" />
    <text x={x + 80} y={y + 28} fontFamily={sans} fontSize={20} fill={ink}>
      {name}
    </text>
    <text x={x + 80} y={y + 54} fontFamily={sans} fontSize={18} fill={palette.brown} letterSpacing={1}>
      {c.toUpperCase()}
    </text>
  </g>
);

export const CharacterSheet: React.FC = () => {
  const k = 4.5; // px per cm for the turnaround
  const ground = 1290;
  const xs = [300, 720, 1140, 1560];
  const L = WALKER.landmarks;
  const guides = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => i * WALKER.headHeight);
  return (
    <AbsoluteFill style={{background: palette.ivory}}>
      <svg width={SHEET_W} height={SHEET_H}>
        <image href={staticFile('textures/paper.jpg')} width={SHEET_W} height={SHEET_H} preserveAspectRatio="none" opacity={0.55} />
        {/* header */}
        <text x={90} y={110} fontFamily={sans} fontSize={22} letterSpacing={8} fill={palette.brown} fontWeight={600}>
          DEEPLY ROOTED · PHASE 01 · MASTER CHARACTER LOCK
        </text>
        <text x={88} y={182} fontFamily={serif} fontSize={66} fill={ink}>
          The Walker
        </text>
        <text x={90} y={228} fontFamily={serif} fontSize={26} fill={palette.brown} fontStyle="italic">
          Adult male, late twenties · {WALKER.height} cm · ~7.6 heads · one asset, rendered unchanged in every shot
        </text>

        {/* turnaround guides */}
        {guides.map((g, i) => (
          <g key={i}>
            <line x1={150} x2={1790} y1={ground - g * k} y2={ground - g * k} stroke={palette.mist} strokeWidth={1.4} strokeDasharray="6 10" opacity={0.7} />
            <text x={120} y={ground - g * k + 7} fontFamily={sans} fontSize={18} fill={palette.mist} textAnchor="end">
              {i}
            </text>
          </g>
        ))}
        {[
          ['eyes', L.eyes],
          ['chin', L.chin],
          ['shoulders', L.shoulders],
          ['wrist', L.wrist],
          ['coat hem', L.coatHem],
        ].map(([n, v]) => (
          <text key={n as string} x={1800} y={ground - (v as number) * k + 6} fontFamily={sans} fontSize={16} fill={palette.brown}>
            — {n}
          </text>
        ))}
        <line x1={150} x2={1790} y1={ground} y2={ground} stroke={ink} strokeWidth={2} opacity={0.5} />

        <Figure x={xs[0]} y={ground} k={k} id="sf" bounds={[-45, -5, 90, 195]} render={(m) => <WalkerFront mode={m} />} />
        <Figure x={xs[1]} y={ground} k={k} id="s34" bounds={WALKER34_BOUNDS} render={(m) => <Walker34 mode={m} p={{...neutralPose, detail: 1}} uid="s34" />} />
        <Figure x={xs[2]} y={ground} k={k} id="ss" bounds={[-45, -5, 90, 195]} render={(m) => <WalkerSide mode={m} />} />
        <Figure x={xs[3]} y={ground} k={k} id="sb" bounds={WALKERBACK_BOUNDS} render={(m) => <WalkerBack mode={m} phase={0} walk={0} />} />
        <Label x={xs[0]} y={ground + 56} title="FRONT" />
        <Label x={xs[1]} y={ground + 56} title="THREE-QUARTER" sub="hero view · Scenes 01–03" />
        <Label x={xs[2]} y={ground + 56} title="SIDE" />
        <Label x={xs[3]} y={ground + 56} title="BACK" sub="walking rig · Scene 03" />

        {/* walk cycle */}
        <text x={90} y={1470} fontFamily={sans} fontSize={20} letterSpacing={4} fill={ink} fontWeight={600}>
          WALK CYCLE KEYS (BACK VIEW)
        </text>
        {[0, 0.25, 0.5, 0.75].map((ph, i) => (
          <Figure
            key={i}
            x={640 + i * 170}
            y={1590}
            k={0.95}
            id={`wc${i}`}
            bounds={WALKERBACK_BOUNDS}
            render={(m) => <WalkerBack mode={m} phase={ph} walk={1} detail={0} />}
          />
        ))}

        {/* expressions */}
        <text x={1990} y={290} fontFamily={sans} fontSize={22} letterSpacing={4} fill={ink} fontWeight={600}>
          EXPRESSION RANGE · RESTRAINED
        </text>
        <ExpressionHead x={2190} y={560} id="e1" title="Calm, uncertain" pose={{browWorry: 0.25, gazeX: -0.4, lidLower: 0.15}} />
        <ExpressionHead x={2600} y={560} id="e2" title="Reading the map" pose={{headPitch: 8.5, gazeY: -0.95, gazeX: -0.25, lidLower: 0.55, browWorry: 0.25}} />
        <ExpressionHead x={2190} y={1000} id="e3" title="Quiet disappointment" pose={{browWorry: 0.7, mouthSad: 0.3, gazeX: -0.6, gazeY: 0.05, headTilt: 1, lidLower: 0.25}} />
        <ExpressionHead x={2600} y={1000} id="e4" title="Looking into the distance" pose={{headTurn: -0.7, gazeX: -0.85, browWorry: 0.4, headPitch: 2}} />

        {/* palette */}
        <text x={1990} y={1250} fontFamily={sans} fontSize={22} letterSpacing={4} fill={ink} fontWeight={600}>
          LOCKED COLOURS
        </text>
        {[
          [tones.coat, 'Overcoat'],
          [tones.sweater, 'Knit sweater'],
          [tones.trousers, 'Trousers'],
          [tones.boots, 'Leather boots'],
          [tones.satchel, 'Satchel'],
          [tones.skin, 'Skin'],
          [tones.hair, 'Hair'],
          [tones.paper, 'Map paper'],
        ].map(([c, n], i) => (
          <Swatch key={n} x={1990 + (i % 4) * 215} y={1280 + Math.floor(i / 4) * 92} c={c} name={n} />
        ))}

        {/* props + notes */}
        <text x={1290} y={1460} fontFamily={sans} fontSize={20} letterSpacing={4} fill={ink} fontWeight={600}>
          PROP · THE MAP
        </text>
        <g transform="translate(1320 1580) scale(3.0 -3.0)">
          <FoldedPacket mode="color" />
        </g>
        <g transform="translate(1400 1478) scale(0.1)">
          <MapPanels mode="color" id="sheetmap" rowOpen={1} colOpen1={1} colOpen0={1} inkScale={2.4} />
        </g>
        <g fontFamily={serif} fontSize={23} fill={ink}>
          {[
            ['Face', 'long oval, straight jaw, straight nose, calm dark-brown eyes, light stubble'],
            ['Hair', 'short dark brown, soft tousled top swept to his right, short sides'],
            ['Build', 'slim, medium height, relaxed slightly rounded shoulders'],
            ['Wardrobe', 'charcoal knee-length overcoat worn open · cream crew-neck knit · brown trousers · tan boots'],
            ['Satchel', 'faded canvas, strap from his left shoulder to his right hip — never switches sides'],
            ['Acting', 'emotion through breath, posture, gaze and hands; no big expressions, no lip-sync'],
          ].map(([h, t], i) => (
            <text key={h} x={90 + (i % 2) * 900} y={300 + Math.floor(i / 2) * 40}>
              <tspan fontFamily={sans} fontSize={17} letterSpacing={3} fontWeight={600} fill={palette.brown}>
                {h.toUpperCase()}
              </tspan>
              <tspan dx={14}>{t}</tspan>
            </text>
          ))}
        </g>
      </svg>
    </AbsoluteFill>
  );
};
