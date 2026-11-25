import React from 'react';
import {tones} from '../config/palette';
import {Hand} from './Hands';
import {capsule, V} from './Limb';
import {Mode, paint} from './spec';

/**
 * Turnaround views for the master reference sheet: FRONT and SIDE (profile, facing left).
 * The THREE-QUARTER view is Walker34 and the BACK view is WalkerBack — the exact rigs used in the film.
 * All four share the landmark heights in spec.ts (eyes 166.7, chin 155, shoulders 146.5, hem 52 …).
 */
const T = tones;

const sleeve = (mode: Mode, S: V, E: V, Wr: V) => (
  <g>
    <path d={capsule(Wr, [Wr[0], Wr[1] - 1], 3.6, 3.4, 0)} fill={paint(mode, T.sweater)} />
    <path d={capsule(S, E, 5.8, 5.0)} fill={paint(mode, T.coat)} />
    <path d={capsule(E, Wr, 5.0, 4.5)} fill={paint(mode, T.coat)} />
  </g>
);

// ------------------------------------------------------------------------------------ FRONT
const FrontEye: React.FC<{x: number; mirror?: boolean}> = ({x, mirror}) => {
  const s = mirror ? -1 : 1;
  return (
    <g transform={`translate(${x} 166.7) scale(${s} 1)`}>
      <path d="M-1.5 0 Q-0.2 1.1 1.5 0.15 Q0.1 -0.85 -1.5 0 Z" fill={T.eyeWhite} />
      <circle cx={0} cy={0.05} r={0.62} fill={T.iris} />
      <circle cx={0} cy={0.05} r={0.3} fill="#1E1714" />
      <circle cx={0.22} cy={0.3} r={0.13} fill="#F4EDE2" opacity={0.75} />
      <path d="M-1.55 0 Q-0.2 1.25 1.55 0.2" fill="none" stroke="#2A1F1A" strokeWidth={0.34} strokeLinecap="round" />
      <path d="M-1.1 1.2 Q0 1.75 1.2 1.0" fill="none" stroke={T.skinDeep} strokeWidth={0.15} opacity={0.5} />
    </g>
  );
};

export const WalkerFront: React.FC<{mode: Mode}> = ({mode}) => {
  const P = (c: string) => paint(mode, c);
  const color = mode === 'color';
  const face =
    'M-7.2 174 C-8.2 171 -8.4 167.5 -8.1 164.5 C-7.9 161.5 -7.0 158.6 -5.4 156.6 C-4.0 155.0 -2.0 154.4 0 154.4 ' +
    'C2.0 154.4 4.0 155.0 5.4 156.6 C7.0 158.6 7.9 161.5 8.1 164.5 C8.4 167.5 8.2 171 7.2 174 C6.0 177.6 3.4 179.4 0 179.4 C-3.4 179.4 -6.0 177.6 -7.2 174 Z';
  return (
    <g>
      {/* bag at his right hip (screen left), behind the coat */}
      <path d="M-25.4 103.6 C-26.0 96 -25.6 88 -24.6 81.6 L-14.6 80.6 L-14.2 103.0 Z" fill={P(T.satchel)} />
      {sleeve(mode, [-17.0, 142], [-19.4, 113], [-19.0, 87.4])}
      {sleeve(mode, [17.0, 142], [19.4, 113], [19.0, 87.4])}
      <g transform="translate(-19.0 87.4) rotate(-4)">
        <Hand mode={mode} pose="relaxed" mirror />
      </g>
      <g transform="translate(19.0 87.4) rotate(4)">
        <Hand mode={mode} pose="relaxed" />
      </g>
      {/* legs + boots */}
      {[-1, 1].map((s) => (
        <g key={s}>
          <path
            d={`M${s * 1.4} 96 C${s * 1.6} 70 ${s * 2.0} 40 ${s * 2.2} 11 L${s * 9.0} 11 C${s * 9.2} 40 ${s * 9.4} 70 ${s * 9.6} 96 Z`}
            fill={P(T.trousers)}
          />
          <path
            d={`M${s * 1.8} 12.5 C${s * 1.4} 7 ${s * 1.2} 3 ${s * 1.4} 0.4 L${s * 10.4} 0.4 C${s * 10.8} 3 ${s * 10.0} 8 ${s * 9.2} 12.5 Z`}
            fill={P(T.boots)}
          />
          {color && (
            <>
              <path d={`M${s * 1.4} 1.4 L${s * 10.6} 1.4 L${s * 10.6} 0 L${s * 1.4} 0 Z`} fill={T.sole} />
              <ellipse cx={s * 5.6} cy={6} rx={2.6} ry={1.6} fill={T.bootsLight} opacity={0.45} />
              <path d={`M${s * 4.6} 10 l${s * 2} 0 M${s * 4.4} 8.4 l${s * 2.2} 0`} stroke={T.bootsShadow} strokeWidth={0.4} />
            </>
          )}
        </g>
      ))}
      {/* coat */}
      <path
        d="M-6.4 152.4 C-11.4 151.4 -15.6 149.4 -17.8 146.2 C-19.0 143.6 -18.8 138 -18.0 131 C-17.0 118 -16.4 110 -16.2 104 C-16.6 90 -18.0 70 -19.4 52.6 C-12 51.2 -6 51.0 -5.0 51.0 L5.0 51.0 C6 51.0 12 51.2 19.4 52.6 C18.0 70 16.6 90 16.2 104 C16.4 110 17.0 118 18.0 131 C18.8 138 19.0 143.6 17.8 146.2 C15.6 149.4 11.4 151.4 6.4 152.4 Z"
        fill={P(T.coat)}
      />
      <path d="M-4.6 150 C-5.6 140 -6.0 124 -6.0 110 C-6.0 96 -6.6 70 -7.4 51.4 L7.4 51.4 C6.6 70 6.0 96 6.0 110 C6.0 124 5.6 140 4.6 150 Z" fill={P(T.sweater)} />
      <path d="M-6.2 95 C-6.6 80 -7.0 64 -7.4 51.4 L7.4 51.4 C7.0 64 6.6 80 6.2 95 C2 96 -2 96 -6.2 95 Z" fill={P(T.trousers)} />
      {color && (
        <g>
          <path d="M-6.2 95 C-2 96.4 2 96.4 6.2 95 L6.2 98.4 C2 99.6 -2 99.6 -6.2 98.4 Z" fill={T.sweaterShadow} opacity={0.75} />
          <path d="M0 95 L0 52" stroke={T.trousersShadow} strokeWidth={0.6} />
          <g stroke={T.sweaterShadow} strokeWidth={0.22} opacity={0.5}>
            {[-4, -2, 0, 2, 4].map((x) => (
              <path key={x} d={`M${x} 146 L${x * 1.05} 100`} />
            ))}
          </g>
          <path d="M-16 104 C-16.6 90 -18 70 -19.4 52.6 L-14.4 52 C-13.6 70 -13 90 -12.6 104 Z" fill={T.coatShadow} opacity={0.4} />
          <path d="M16 104 C16.6 90 18 70 19.4 52.6 L14.4 52 C13.6 70 13 90 12.6 104 Z" fill={T.coatShadow} opacity={0.4} />
        </g>
      )}
      {/* lapels */}
      <path d="M4.6 150 C5.4 142 5.8 134 6.0 127 L11.6 140.2 L10.2 142.8 L12.6 145.6 C10.8 148 8.2 149.8 6.6 151 Z" fill={P(T.coatLight)} />
      <path d="M-4.6 150 C-5.4 142 -5.8 134 -6.0 127 L-11.6 140.2 L-10.2 142.8 L-12.6 145.6 C-10.8 148 -8.2 149.8 -6.6 151 Z" fill={P(T.coatLight)} />
      {/* strap: his left shoulder (screen right) → right hip */}
      <path d="M12.6 148.8 L16.2 146.8 L-14.6 94.6 L-18.2 96.6 Z" fill={P(T.satchel)} />
      {/* neck, collar */}
      <path d="M-7.0 151.6 C-7.0 155.2 -4.0 157.0 0 157.0 C4.0 157.0 7.0 155.2 7.0 151.6 Z" fill={P(T.coatShadow)} />
      <path d="M-4.4 157 L-4.6 149.2 L4.6 149.2 L4.4 157 Z" fill={P(T.skin)} />
      <path d="M-5.2 150.6 C-2.6 147.8 2.6 147.8 5.2 150.6 L5.0 152.2 C2.6 149.6 -2.6 149.6 -5.0 152.2 Z" fill={P(T.sweater)} />
      {/* head */}
      <path d="M-8.0 167 C-9.2 167 -9.6 163.4 -8.6 161.6 C-8.0 161 -7.6 162.4 -7.6 164 Z" fill={P(T.skin)} />
      <path d="M8.0 167 C9.2 167 9.6 163.4 8.6 161.6 C8.0 161 7.6 162.4 7.6 164 Z" fill={P(T.skin)} />
      <path d={face} fill={P(T.skin)} />
      {color && (
        <g>
          <path d="M-7.6 162 C-6 157 -3 154.6 0 154.6 C3 154.6 6 157 7.6 162 C6.4 158.6 3.6 156.2 0 156.2 C-3.6 156.2 -6.4 158.6 -7.6 162 Z" fill={T.hair} opacity={0.14} />
          <path d="M-0.4 166.6 C-0.6 164.6 -1.0 163.2 -1.4 162.4 C-0.8 161.7 0.8 161.7 1.4 162.4" fill="none" stroke={T.skinShadow} strokeWidth={0.3} strokeLinecap="round" />
          <ellipse cx={-0.95} cy={161.95} rx={0.45} ry={0.22} fill={T.skinDeep} />
          <ellipse cx={0.95} cy={161.95} rx={0.45} ry={0.22} fill={T.skinDeep} />
          <path d="M-2.5 159.85 C-1.2 160.1 1.2 160.1 2.5 159.85" fill="none" stroke={T.skinDeep} strokeWidth={0.3} strokeLinecap="round" />
          <path d="M-2.3 159.9 C-1 160.6 1 160.6 2.3 159.9 C1 160.2 -1 160.2 -2.3 159.9 Z" fill={T.lip} opacity={0.55} />
          <path d="M-1.8 159.5 C-0.8 158.9 0.8 158.9 1.8 159.5 C0.8 159.3 -0.8 159.3 -1.8 159.5 Z" fill={T.lip} opacity={0.4} />
          <FrontEye x={-3.4} />
          <FrontEye x={3.4} mirror />
          <path d="M-5.6 169.1 C-4.4 169.8 -2.8 169.8 -1.4 169.3 C-2.8 169.4 -4.4 169.4 -5.6 168.7 Z" fill={T.hair} />
          <path d="M5.6 169.1 C4.4 169.8 2.8 169.8 1.4 169.3 C2.8 169.4 4.4 169.4 5.6 168.7 Z" fill={T.hair} />
        </g>
      )}
      <path
        d="M-8.4 166.6 C-9.4 171 -9.0 176.6 -6.0 179.4 C-3.6 181.6 -0.4 182.0 2.4 181.6 C5.6 181.2 8.4 179.0 9.0 174.8 C9.4 171.8 9.0 168.8 8.4 166.6 L7.8 166.8 C7.6 169.4 7.0 171.6 5.6 172.6 C3.0 173.6 -1.0 173.4 -3.6 172.6 C-5.6 173.4 -7.0 171.0 -7.6 168.4 Z"
        fill={P(T.hair)}
      />
      <path d="M-6.2 178.8 C-7.4 176.4 -7.6 174.0 -6.8 172.6 C-5.2 174.8 -3.6 175.4 -1.6 175.6 Z" fill={P(T.hair)} />
      {color && <path d="M-3.4 180.4 C0 181.2 3.4 180.8 6.2 179.2" stroke={T.hairLight} strokeWidth={0.45} fill="none" opacity={0.7} />}
    </g>
  );
};

// ------------------------------------------------------------------------------------- SIDE
export const WalkerSide: React.FC<{mode: Mode}> = ({mode}) => {
  const P = (c: string) => paint(mode, c);
  const color = mode === 'color';
  return (
    <g>
      {/* far leg + boot */}
      <path d="M3.4 96 C3.0 70 3.0 40 3.6 11 L10.6 11 C11.0 40 11.2 70 10.6 96 Z" fill={P(T.trousersShadow)} />
      <path d="M2.6 12.5 C2.4 8 1.6 5 -1.0 3.8 C-3.6 2.8 -5.0 2.0 -5.0 0.8 L-4.8 0 L11.4 0 C11.6 3 11.4 8 11.0 12.5 Z" fill={P(T.bootsShadow)} />
      {/* near leg + boot */}
      <path d="M-4.2 96 C-4.6 70 -4.6 40 -4.0 11 L3.4 11 C3.8 40 4.0 70 4.4 96 Z" fill={P(T.trousers)} />
      <path d="M-4.8 12.5 C-5.0 8 -5.8 5 -8.6 3.8 C-11.4 2.8 -13.2 2.0 -13.2 0.8 L-13.0 0 L4.4 0 C4.6 3 4.4 8 4.0 12.5 Z" fill={P(T.boots)} />
      {color && (
        <>
          <path d="M-13.2 1.4 L4.4 1.4 L4.4 0 L-13.0 0 Z" fill={T.sole} />
          <path d="M-12.2 2.4 C-10.6 3.6 -8.8 4.4 -6.8 5.0" stroke={T.bootsLight} strokeWidth={0.6} fill="none" opacity={0.7} />
        </>
      )}
      {/* bag on the near (right) hip */}
      <path d="M5.4 104.6 C5.0 96 5.4 88 6.4 81.6 L17.0 82.4 C17.4 90 17.2 98 16.6 105.2 Z" fill={P(T.satchel)} />
      {/* coat: front edge open, flaps slightly forward */}
      <path
        d="M-5.6 153.4 C-9.0 151.6 -11.2 148.8 -11.8 144 C-12.4 136 -12.6 128 -12.2 118 C-11.8 108 -11.0 100 -11.2 92 C-11.8 78 -12.8 64 -13.8 52.4 L14.8 52.8 C13.6 66 12.6 80 12.0 92 C11.8 104 12.4 118 12.4 130 C12.4 138 11.6 146 9.0 150.6 C6.0 153.6 0 154.6 -5.6 153.4 Z"
        fill={P(T.coat)}
      />
      {color && (
        <g>
          <path d="M-11.8 144 C-12.4 136 -12.6 128 -12.2 118 C-11.8 108 -11.0 100 -11.2 92 C-11.8 78 -12.8 64 -13.8 52.4 L-10.6 52.4 C-9.8 64 -8.8 78 -8.4 92 C-8.2 104 -9.2 118 -9.4 130 C-9.6 138 -9.4 142 -8.6 146 Z" fill={T.coatLight} opacity={0.5} />
          <path d="M-9.6 146 C-10.2 138 -10.4 130 -10.0 122" stroke={T.coatShadow} strokeWidth={0.6} fill="none" />
          <path d="M9.6 96 C9.0 80 10.0 66 11.6 53" stroke={T.coatShadow} strokeWidth={0.7} fill="none" opacity={0.6} />
          <path d="M-1 98 C-1.4 84 -1.2 70 -1.6 53" stroke={T.coatShadow} strokeWidth={0.6} fill="none" opacity={0.45} />
        </g>
      )}
      {/* sweater peeking at the open front */}
      <path d="M-5.8 151 C-8.6 146 -10.4 138 -10.8 128 C-10.4 136 -9.0 144 -6.0 148.6 Z" fill={P(T.sweater)} />
      {/* strap over the chest to the near hip */}
      <path d="M2.0 152.2 L5.4 151.8 L9.6 98.6 L6.2 98.4 Z" fill={P(T.satchel)} />
      {/* near arm */}
      {sleeve(mode, [1.6, 143], [2.8, 113], [0.6, 87.4])}
      <g transform="translate(0.6 87.4) rotate(-6)">
        <Hand mode={mode} pose="relaxed" mirror />
      </g>
      {/* neck + collar */}
      <path d="M-3.4 156 C-3.6 153 -3.8 151 -4.4 149 L4.8 149.4 C4.6 152 4.8 155 5.4 159 Z" fill={P(T.skin)} />
      <path d="M2.6 151.4 C4.6 153.4 6.8 155.8 7.6 158.8 L9.4 151.4 Z" fill={P(T.coatShadow)} />
      {/* head (profile, facing left) */}
      <path
        d="M-7.0 175.4 C-8.2 173.6 -8.8 171.2 -8.8 169.2 C-8.9 168.4 -8.6 167.8 -8.6 166.8 C-8.8 165.6 -9.6 164.2 -10.6 162.6 C-10.8 162.1 -10.4 161.8 -9.6 161.7 C-9.4 161.2 -9.5 160.6 -9.3 160.3 C-9.4 159.9 -9.4 159.5 -9.1 159.2 C-9.3 158.8 -9.2 158.4 -8.9 158.1 C-8.7 157.3 -8.8 156.6 -8.6 156.0 C-8.4 155.2 -7.4 154.6 -6.0 154.6 C-3.6 154.8 -1.0 155.6 1.4 157.4 C2.6 158.4 3.4 160.2 4.0 161.6 C5.8 162.8 8.8 165.0 9.6 168.0 C10.2 171.4 9.4 175.6 6.8 177.8 C3.8 180.0 -2.6 180.2 -5.0 178.4 C-6.0 177.6 -6.6 176.6 -7.0 175.4 Z"
        fill={P(T.skin)}
      />
      <path d="M1.0 166.8 C1.6 168.6 3.8 168.4 4.0 165.8 C4.2 163.8 3.4 161.8 2.2 161.0 C1.4 160.6 0.8 161.2 0.8 162.2 Z" fill={P(T.skin)} />
      {color && (
        <g>
          <path d="M1.6 166.4 C2.4 167.0 3.3 166.2 3.2 165.0 C3.1 163.8 2.5 162.8 1.9 162.4" fill="none" stroke={T.skinShadow} strokeWidth={0.32} />
          <path d="M-8.4 161 C-6.8 161 -4.6 160.6 -2.6 159.2 C-0.6 157.6 1.2 157.8 2.6 158.8 C1.6 157 -0.6 155.6 -3.4 155 C-5.6 154.6 -7.6 154.8 -8.4 155.8 C-8.9 157.2 -8.8 159.4 -8.4 161 Z" fill={T.hair} opacity={0.13} />
          <path d="M-7.6 166.5 Q-6.9 167.2 -6.1 166.6 Q-6.8 166.1 -7.6 166.5 Z" fill={T.eyeWhite} />
          <circle cx={-7.1} cy={166.55} r={0.42} fill={T.iris} />
          <path d="M-7.75 166.45 Q-6.9 167.35 -6.0 166.75" fill="none" stroke="#2A1F1A" strokeWidth={0.3} strokeLinecap="round" />
          <path d="M-8.4 169.1 C-7.4 169.6 -6.2 169.6 -5.2 169.1 C-6.2 169.3 -7.4 169.3 -8.4 168.7 Z" fill={T.hair} />
          <path d="M-9.4 161.9 C-8.9 161.7 -8.4 161.8 -8.1 162.1" stroke={T.skinDeep} strokeWidth={0.3} fill="none" />
          <path d="M-9.2 159.8 L-7.6 159.9" stroke={T.skinDeep} strokeWidth={0.28} strokeLinecap="round" />
        </g>
      )}
      <path
        d="M-7.2 175.0 C-8.4 176.4 -8.6 178.0 -7.8 179.2 C-6.0 181.4 -1.4 182.0 2.4 181.6 C6.2 181.2 9.4 178.8 10.2 175.0 C10.8 171.8 10.4 168.4 9.4 165.6 C8.8 163.8 7.8 162.6 6.6 162.0 C5.8 161.8 5.2 162.4 5.0 163.4 C4.6 164.8 4.4 166.6 3.6 167.8 C3.0 168.6 2.2 168.8 1.6 168.4 L0.8 167.0 C0.4 169.4 -0.6 171.6 -2.4 172.8 C-4.0 173.8 -5.8 174.2 -7.2 175.0 Z"
        fill={P(T.hair)}
      />
      {color && <path d="M-4.6 180.6 C-1.0 181.4 3.4 181.0 7.0 179.0" stroke={T.hairLight} strokeWidth={0.45} fill="none" opacity={0.7} />}
    </g>
  );
};
