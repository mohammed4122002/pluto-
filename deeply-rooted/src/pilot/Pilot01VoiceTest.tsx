import React from 'react';
import {AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {loadFont} from '@remotion/fonts';
import arabic500 from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2';
import {clamp, ease, ramp} from '../engine/anim';
import {noise1} from '../engine/noise';
import {ensureFonts, SUB_FONT} from '../post/fonts';
import {blendPose, POSES, Stickman, StickPose} from '../stickman/Stickman';

/**
 * DEEPLY ROOTED — Pilot 01 · VOICE TEST (new narration recording, 2026-11-27)
 * Same shots, camera moves, lighting and animation as Pilot 01 (src/pilot/Pilot01.tsx, left untouched);
 * only the voice source changes, and every cue is re-timed to the new performance.
 * Voice: public/audio/voice_new/narration_new_2026-11-27.mp3 — byte-identical copy of the delivered file
 *        "ElevenLabs_2026-11-27T22_14_48_egyption_voice_sham_ivc_s50_sim75_v4.mp3" (319.399 s). Not stretched,
 *        sped up or edited: one contiguous excerpt played at its natural speed, with a fixed level-matching gain.
 * Word times: src/data/narration_new_transcript.json (speech recognition) + energy-envelope boundaries:
 *        "have" on 5.759 s · "life" off 7.503 s · pause 0.447 s · "and" on 7.950 s · "here" off 9.733 s.
 */
ensureFonts();
loadFont({family: 'DR Arabic', url: arabic500, weight: '500'});

export const PILOT_FPS = 30;
const VO_AT = 24; // the excerpt starts 0.8 s in (as in Pilot 01) → "have" lands at 0.96 s (Pilot 01: 0.94 s)
const SRC0 = 5.6; // excerpt in the new recording: 5.600–9.950 s (digital silence on both sides; whole frames)
const SRC1 = 9.95;
const VO_GAIN = 2.95; // +9.4 dB: matches this excerpt (−27.7 LUFS) to the Pilot 01 voice level (−18.3 LUFS); gain only
const film = (src: number) => Math.round(VO_AT + (src - SRC0) * PILOT_FPS);
const CUT = 89; // in the new 0.45 s pause after "…your life…" (life off → film 81, "and" on → film 94.5)
const HERE = film(9.436); // "…ended up here?" (frame 139)
// same 3.4 s hold after the last word as Pilot 01 ("here" ends at film(9.733) = 148 → 148 + 101)
export const PILOT_FRAMES = film(9.733) + 101;

const PLATE = (n: string) => staticFile(`plates/pilot01/${n}`);
const K = 0.75; // plate (2560×1440) → frame (1920×1080)

/** A painted plate layer, zoomed about an anchor with its own parallax gain. `tile` adds a mirrored copy on the right so drifting layers never show an edge. */
const Layer: React.FC<{src: string; zoom: number; ax: number; ay: number; sx: number; sy: number; blur?: number; opacity?: number; dx?: number; dy?: number; add?: boolean; tile?: boolean}> = ({
  src,
  zoom,
  ax,
  ay,
  sx,
  sy,
  blur = 0,
  opacity = 1,
  dx = 0,
  dy = 0,
  add = false,
  tile = false,
}) => {
  const base = `translate(${sx + dx}px, ${sy + dy}px) scale(${K * zoom}) translate(${-ax}px, ${-ay}px)`;
  const style = (extra: string): React.CSSProperties => ({
    position: 'absolute',
    left: 0,
    top: 0,
    width: 2560,
    height: 1440,
    transformOrigin: '0 0',
    transform: base + extra,
    filter: blur ? `blur(${blur}px)` : undefined,
    opacity,
    mixBlendMode: add ? 'screen' : undefined,
  });
  return (
    <>
      <Img src={src} style={style('')} />
      {tile && <Img src={src} style={style(' translate(5120px, 0px) scale(-1, 1)')} />}
    </>
  );
};

/**
 * The Traveller lit by the scene rather than pasted on top of it:
 *  - cool ambient body value (night), warm key from the lamp falling off with distance,
 *  - a warm rim on the edges that face the lamp, form shadow on the far side of the head,
 *  - a contact shadow under the feet and a soft cast shadow on the planks,
 *  - a hair of softness so his edges sit at the same focus as the painting around him.
 */
const LitTraveller: React.FC<{
  id: string;
  pose: StickPose;
  feet: [number, number];
  scale: number;
  lamp: [number, number];
  lampR: number;
  toLamp: [number, number]; // unit vector from him toward the lamp (plate space)
  rim: number; // rim width (plate px)
  keyOff: number; // how far the key's terminator sits from the lamp-facing edge (plate px)
  key: number; // warm key strength 0–1
  amb: [number, number, number]; // ambient multipliers (r, g, b)
  shadow: string; // cast-shadow matrix (plate space, relative to the feet)
  shadowOpacity: number;
  contact: [number, number]; // contact-shadow radii
  soft: number;
  facing?: 1 | -1;
  shadeSide?: 1 | -1;
  wrap?: boolean; // backlit: the rim wraps both edges of every limb
  rimOpacity?: number;
}> = ({id, pose, feet, scale, lamp, lampR, toLamp, rim, keyOff, key, amb, shadow, shadowOpacity, contact, soft, facing = 1, shadeSide = 1, wrap = false, rimOpacity = 0.9}) => {
  const fig = <Stickman pose={pose} scale={scale} facing={facing} shadeSide={shadeSide} />;
  const at = `translate(${feet[0]} ${feet[1]})`;
  return (
    <g>
      <defs>
        <filter id={`${id}-amb`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={`${amb[0]} 0 0 0 0.015  0 ${amb[1]} 0 0 0.02  0 0 ${amb[2]} 0 0.04  0 0 0 1 0`} />
        </filter>
        {/* key: only the half of each limb that faces the lamp catches the warm light (soft terminator) */}
        <filter id={`${id}-warm`} colorInterpolationFilters="sRGB" x="-40%" y="-20%" width="180%" height="140%">
          <feOffset in="SourceAlpha" dx={-toLamp[0] * keyOff} dy={-toLamp[1] * keyOff} result="off" />
          <feComposite in="SourceGraphic" in2="off" operator="out" result="lit" />
          <feGaussianBlur in="lit" stdDeviation={keyOff * 0.18} result="litb" />
          <feComposite in="litb" in2="SourceAlpha" operator="in" result="litc" />
          <feColorMatrix in="litc" type="matrix" values="0.98 0 0 0 0.02  0 0.8 0 0 0.01  0 0 0.57 0 0  0 0 0 1 0" />
        </filter>
        <filter id={`${id}-rim`} colorInterpolationFilters="sRGB" x="-40%" y="-20%" width="180%" height="140%">
          {wrap ? (
            <feMorphology in="SourceAlpha" operator="erode" radius={rim} result="off" />
          ) : (
            <feOffset in="SourceAlpha" dx={-toLamp[0] * rim} dy={-toLamp[1] * rim} result="off" />
          )}
          <feComposite in="SourceAlpha" in2="off" operator="out" result="edge" />
          <feGaussianBlur in="edge" stdDeviation={rim * 0.22} result="eb" />
          <feFlood floodColor="#FFD9A2" />
          <feComposite in2="eb" operator="in" />
        </filter>
        <filter id={`${id}-sh`} colorInterpolationFilters="sRGB" x="-60%" y="-60%" width="220%" height="220%">
          <feColorMatrix type="matrix" values="0 0 0 0 0.02  0 0 0 0 0.025  0 0 0 0 0.04  0 0 0 1 0" />
          <feGaussianBlur stdDeviation={rim * 0.7} />
        </filter>
        <filter id={`${id}-soft`} colorInterpolationFilters="sRGB" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={soft} />
        </filter>
        <filter id={`${id}-cs`} colorInterpolationFilters="sRGB" x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation={contact[1] * 0.7} />
        </filter>
        <radialGradient id={`${id}-lg`} cx={lamp[0]} cy={lamp[1]} r={lampR} gradientUnits="userSpaceOnUse">
          <stop offset={0} stopColor="#fff" stopOpacity={1} />
          <stop offset={0.5} stopColor="#fff" stopOpacity={0.5} />
          <stop offset={1} stopColor="#fff" stopOpacity={0} />
        </radialGradient>
        <mask id={`${id}-lm`} maskUnits="userSpaceOnUse" x={0} y={0} width={2560} height={1440}>
          <rect width={2560} height={1440} fill={`url(#${id}-lg)`} />
        </mask>
      </defs>
      {/* cast shadow on the planks, then the contact shadow where his feet meet the wood */}
      <g transform={`${at} ${shadow}`} filter={`url(#${id}-sh)`} opacity={shadowOpacity}>
        {fig}
      </g>
      <ellipse cx={feet[0]} cy={feet[1] + contact[1] * 0.3} rx={contact[0]} ry={contact[1]} fill="#04060A" opacity={0.7} filter={`url(#${id}-cs)`} />
      <g filter={`url(#${id}-soft)`}>
        <g transform={at} filter={`url(#${id}-amb)`}>
          {fig}
        </g>
        <g mask={`url(#${id}-lm)`} opacity={key}>
          <g transform={at} filter={`url(#${id}-warm)`}>
            {fig}
          </g>
        </g>
        <g transform={at} filter={`url(#${id}-rim)`} opacity={rimOpacity}>
          {fig}
        </g>
      </g>
    </g>
  );
};

const breathe = (f: number, p: StickPose): StickPose => {
  const b = Math.sin((f / PILOT_FPS) * ((2 * Math.PI) / 4.4));
  return {...p, shoulderDrop: p.shoulderDrop - b * 0.6, headDrop: p.headDrop - b * 0.25, lean: p.lean + 0.9 * noise1(f / 70, 3)};
};

const Shot1: React.FC<{f: number}> = ({f}) => {
  const D = ramp(f, 0, CUT + 10, ease.inOutSine); // slow push toward him
  const ax = 1560, ay = 880, sx = ax * K, sy = ay * K;
  const z = (g: number) => 1 + D * g;
  // "Have you ever looked at your life…": his head lowers toward the water
  const look = ramp(f, film(6.136), 40, ease.inOutSine); // 0.2 s before "looked", as in Pilot 01
  const pose = breathe(f, blendPose(POSES.stand, {...POSES.headDown, headTilt: 16, headDrop: 3, lean: 4, shoulderDrop: 2.5}, look * 0.9));
  const flick = 0.86 + 0.08 * noise1(f / 6, 9) + 0.04 * noise1(f / 2.3, 10);
  const mistX = -f * 0.45;
  const lampPos: [number, number] = [1948, 365];
  return (
    <AbsoluteFill>
      <Layer src={PLATE('s1_far.png')} zoom={z(0.02)} ax={ax} ay={ay} sx={sx} sy={sy} dx={-6 * D} />
      <Layer src={PLATE('s1_mist.png')} zoom={z(0.035)} ax={ax} ay={ay} sx={sx} sy={sy} dx={mistX - 10 * D} opacity={0.9} tile />
      <Layer src={PLATE('s1_pier.png')} zoom={z(0.07)} ax={ax} ay={ay} sx={sx} sy={sy} dx={-18 * D} />
      <Layer src={PLATE('s1_glow.png')} zoom={z(0.07)} ax={ax} ay={ay} sx={sx} sy={sy} dx={-18 * D} opacity={flick} add />
      {/* the Traveller + moths in the lamplight, moving with the pier plane */}
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <g transform={`translate(${sx - 18 * D} ${sy}) scale(${K * z(0.07)}) translate(${-ax} ${-ay})`}>
          <LitTraveller
            id="t1"
            pose={pose}
            feet={[1600, 1168]}
            scale={3.55}
            lamp={lampPos}
            lampR={1150}
            toLamp={[0.55, -0.84]}
            rim={2.6}
            keyOff={21}
            key={0.95 * flick}
            amb={[0.35, 0.37, 0.44]}
            shadow="matrix(1 0 0.8 -0.3 0 0)"
            shadowOpacity={0.55}
            contact={[46, 8]}
            soft={0.9}
            shadeSide={-1}
          />
          {[...Array(12)].map((_, i) => {
            const t = f / PILOT_FPS;
            const x = lampPos[0] + 60 * Math.sin(t * (1.3 + i * 0.17) + i * 2.1) + 25 * noise1(t * 2 + i, 70);
            const y = lampPos[1] + 40 + 70 * Math.sin(t * (0.9 + i * 0.11) + i) + 20 * noise1(t * 2.5 + i, 71);
            return <circle key={i} cx={x} cy={y} r={2.2} fill="#FFE7B8" opacity={0.35 + 0.4 * clamp(noise1(t * 4 + i, 72))} />;
          })}
        </g>
      </svg>
      <Layer src={PLATE('s1_fg.png')} zoom={z(0.1)} ax={ax} ay={ay} sx={sx} sy={sy} dx={-22 * D} blur={7} />
    </AbsoluteFill>
  );
};

const Shot2: React.FC<{f: number}> = ({f}) => {
  // the camera rises and pulls back: the long path behind him is revealed
  const R = ramp(f, CUT, PILOT_FRAMES - CUT - 18, ease.inOutSine);
  const ax = 1280, ay = 600;
  const sx = ax * K, sy = ay * K;
  const z = (g: number) => 1 + (1 - R) * g;
  const turn = ramp(f, HERE - 12, 30, ease.inOutSine); // he turns back toward the shore on "here"
  const back: StickPose = {...POSES.stand, armL: [-11, -5], armR: [11, 5], legL: [-6, 0], legR: [6, 0], headDrop: 2, shoulderDrop: 2.5};
  const pose = breathe(f, blendPose(back, {...POSES.lookBack, headTilt: -18}, turn));
  const flick = 0.86 + 0.08 * noise1(f / 6, 9) + 0.04 * noise1(f / 2.3, 10);
  const mistX = -(f - CUT) * 0.55;
  return (
    <AbsoluteFill>
      <Layer src={PLATE('s2_far.png')} zoom={z(0.05)} ax={ax} ay={ay} sx={sx} sy={sy} dy={-8 * R} />
      <Layer src={PLATE('s2_mist.png')} zoom={z(0.08)} ax={ax} ay={ay} sx={sx} sy={sy} dx={mistX} dy={-4 * R} opacity={0.95} tile />
      <Layer src={PLATE('s2_pier.png')} zoom={z(0.16)} ax={ax} ay={ay} sx={sx} sy={sy} dy={6 * R} />
      <Layer src={PLATE('s2_glow.png')} zoom={z(0.16)} ax={ax} ay={ay} sx={sx} sy={sy} dy={6 * R} opacity={flick} add />
      <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
        <g transform={`translate(${sx} ${sy + 6 * R}) scale(${K * z(0.16)}) translate(${-ax} ${-ay})`}>
          <LitTraveller
            id="t2"
            pose={pose}
            feet={[1271, 603]}
            scale={0.42}
            lamp={[1298, 506]}
            lampR={200}
            toLamp={[0.38, -0.92]}
            rim={0.6}
            rimOpacity={0.6}
            keyOff={1.2}
            key={0.6 * flick}
            amb={[0.28, 0.27, 0.28]}
            shadow="matrix(1 0 0.12 -0.5 0 0)"
            shadowOpacity={0.6}
            contact={[9, 2.2]}
            soft={0.35}
            facing={-1}
          />
        </g>
      </svg>
      <Layer src={PLATE('s2_fg.png')} zoom={z(0.32)} ax={ax} ay={ay} sx={sx} sy={sy} dy={130 * R} blur={6} />
    </AbsoluteFill>
  );
};

/** Clean picture + soundtrack (subtitles are separate layers). */
export const Pilot01VoiceTest: React.FC = () => {
  const f = useCurrentFrame();
  const fadeIn = 1 - ramp(f, 0, 10);
  const fadeOut = ramp(f, PILOT_FRAMES - 16, 16);
  const voDur = Math.round((SRC1 - SRC0) * PILOT_FPS);
  return (
    <AbsoluteFill style={{background: '#0B1018'}}>
      {f < CUT ? <Shot1 f={f} /> : <Shot2 f={f} />}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 75% at 50% 48%, rgba(0,0,0,0) 58%, rgba(6,9,15,0.45) 100%)'}} />
      <AbsoluteFill style={{background: '#06090F', opacity: Math.max(fadeIn, fadeOut)}} />
      <Sequence from={VO_AT} durationInFrames={voDur} name="VO · VO01 (new recording 2026-11-27)" layout="none">
        <Audio
          src={staticFile('audio/voice_new/narration_new_2026-11-27.mp3')}
          trimBefore={Math.round(SRC0 * PILOT_FPS)}
          volume={(fr) => VO_GAIN * clamp(fr / 3) * clamp((voDur - fr) / 3)}
        />
      </Sequence>
      <Sequence from={0} durationInFrames={PILOT_FRAMES} name="Ambience · night lake" layout="none">
        <Audio
          src={staticFile('audio/pilot01/amb_lake_night.wav')}
          volume={(fr) => {
            const speaking = fr > VO_AT - 4 && fr < VO_AT + voDur + 8;
            return 0.55 * clamp(fr / 20) * clamp((PILOT_FRAMES - fr) / 20) * (speaking ? 0.62 : 1);
          }}
        />
      </Sequence>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------------- subtitles (separate tracks)
// Same rule as Pilot 01 (in 2 frames before the first word), re-timed to the new words. The first cue now
// clears 2 frames before the second (the new pause is 0.2 s shorter than Pilot 01's).
export const PILOT_SUBS = {
  en: [
    {text: 'Have you ever looked at your life…', from: film(5.654) - 2, to: film(7.46) + 7},
    {text: '…and wondered how you ended up here?', from: film(7.836) - 2, to: film(9.688) + 18},
  ],
  ar: [
    {text: 'هل نظرتَ يومًا إلى حياتك…', from: film(5.654) - 2, to: film(7.46) + 7},
    {text: '…وتساءلتَ كيف انتهى بك المطافُ إلى هنا؟', from: film(7.836) - 2, to: film(9.688) + 18},
  ],
};

/** Cinematic subtitle track: plain ivory text, soft shadow, fixed bottom position, gentle fades. */
export const PilotSubs: React.FC<{lang: 'en' | 'ar'}> = ({lang}) => {
  const f = useCurrentFrame();
  const subs = PILOT_SUBS[lang];
  return (
    <AbsoluteFill>
      {subs
        .filter((s) => f >= s.from && f < s.to)
        .map((s) => {
          const o = Math.min(ramp(f, s.from, 7), 1 - ramp(f, s.to - 8, 8));
          return (
            <div
              key={s.from}
              dir={lang === 'ar' ? 'rtl' : 'ltr'}
              lang={lang}
              style={{
                position: 'absolute',
                left: 200,
                right: 200,
                bottom: 92,
                textAlign: 'center',
                opacity: o,
                color: '#F4EFE6',
                fontFamily: lang === 'ar' ? '"DR Arabic", "IBM Plex Sans Arabic", "Noto Sans Arabic", sans-serif' : SUB_FONT,
                fontWeight: 500,
                fontSize: lang === 'ar' ? 54 : 50,
                lineHeight: lang === 'ar' ? 1.5 : 1.3,
                letterSpacing: lang === 'ar' ? 0 : 0.3,
                textWrap: 'balance' as React.CSSProperties['textWrap'],
                textShadow: '0 2px 6px rgba(0,0,0,0.6), 0 0 2px rgba(0,0,0,0.45)',
              }}
            >
              {s.text}
            </div>
          );
        })}
    </AbsoluteFill>
  );
};
export const VoiceTestSubsEN: React.FC = () => <PilotSubs lang="en" />;
export const VoiceTestSubsAR: React.FC = () => <PilotSubs lang="ar" />;

