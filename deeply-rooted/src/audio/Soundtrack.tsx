import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import {camera, character, FPS, narration, sec, sfx, transitions} from '../config/production';
import {clamp, ease, lerp, ramp} from '../engine/anim';
import {alongPath, distAtZ} from '../environment/geometry';
import {imaginedPath} from '../worlds/imagined';

/** Linear fade-in / fade-out envelope over a clip of `dur` frames. */
const envAt = (f: number, dur: number, fin: number, fout: number) =>
  clamp(fin > 0 ? f / fin : 1) * clamp(fout > 0 ? (dur - f) / fout : 1);

interface Clip {
  name: string;
  src: string;
  at: number; // global frame
  dur: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
  trimBefore: number; // frames
}

/** Footsteps on the imagined path: one per heel strike, quieter as he walks away. */
const footstepClips = (): Clip[] => {
  const T = transitions;
  const {walkSpeed, walkStartZ} = character.s3;
  const fs = sfx.footsteps;
  const d0 = distAtZ(imaginedPath, walkStartZ);
  const start = T.mapMatchStart + 18;
  const end = T.returnToPresentStart + 40;
  const out: Clip[] = [];
  let last = -1;
  for (let f = T.mapMatchStart; f < end; f++) {
    const dist = d0 + (walkSpeed * (f - T.mapMatchStart)) / FPS;
    const step = Math.floor((dist / fs.strideM) * 2); // two heel strikes per stride
    if (last >= 0 && step !== last && f >= start) {
      const z = alongPath(imaginedPath, dist).z;
      const camT = ramp(f, T.imaginedCameraStart, T.returnToPresentStart + T.returnToPresentDuration - T.imaginedCameraStart, ease.inOutSine);
      const camZ = lerp(camera.imagined.from.z, camera.imagined.to.z, camT);
      const near = clamp(7.5 / Math.max(1, z - camZ), 0.22, 1);
      const away = 1 - ramp(f, T.returnToPresentStart + 6, 40);
      const reveal = ramp(f, T.mapMatchStart, 40);
      out.push({
        name: `Step ${out.length + 1}`,
        src: `audio/sfx/${fs.file}_${(out.length % fs.variants) + 1}.wav`,
        at: f,
        dur: sec(0.42),
        volume: fs.volume * near * away * reveal * (0.85 + 0.15 * ((out.length * 7) % 3) / 2),
        fadeIn: 0,
        fadeOut: 2,
        trimBefore: 0,
      });
    }
    last = step;
  }
  return out;
};

export const soundtrackClips = (): {voice: Clip[]; effects: Clip[]} => {
  const voice: Clip[] = narration.segments.map((s) => ({
    name: `VO · ${s.id}`,
    src: narration.file,
    at: sec(s.at),
    dur: Math.round((s.src[1] - s.src[0]) * FPS),
    volume: narration.volume,
    fadeIn: narration.fadeFrames,
    fadeOut: narration.fadeFrames,
    trimBefore: Math.round(s.src[0] * FPS),
  }));
  const effects: Clip[] = sfx.cues.map((c) => ({
    name: `SFX · ${c.id}`,
    src: `audio/sfx/${c.file}.wav`,
    at: c.at,
    dur: c.dur,
    volume: c.volume * sfx.master,
    fadeIn: c.fadeIn ?? 2,
    fadeOut: c.fadeOut ?? 4,
    trimBefore: Math.round((c.trim ?? 0) * FPS),
  }));
  return {voice, effects: [...effects, ...footstepClips().map((c) => ({...c, volume: c.volume * sfx.master}))]};
};

/**
 * Every sound is its own named <Sequence> so it stays individually editable in Remotion Studio:
 * narration segments (VO · …) and sound effects (SFX · …, Step n). No music in Phase 01.
 */
export const Soundtrack: React.FC<{offset: number; length: number}> = ({offset, length}) => {
  const {voice, effects} = soundtrackClips();
  const clips = [...(narration.enabled ? voice : []), ...(sfx.enabled ? effects : [])];
  return (
    <>
      {clips.map((c, i) => {
        const from = c.at - offset;
        if (from + c.dur <= 0 || from >= length) return null;
        return (
          <Sequence key={`${c.name}-${i}`} from={from} durationInFrames={c.dur} name={c.name} layout="none">
            <Audio
              src={staticFile(c.src)}
              trimBefore={c.trimBefore}
              volume={(f) => c.volume * envAt(f, c.dur, c.fadeIn, c.fadeOut)}
            />
          </Sequence>
        );
      })}
    </>
  );
};
