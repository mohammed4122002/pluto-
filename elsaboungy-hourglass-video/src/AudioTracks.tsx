import { Html5Audio, Sequence, staticFile } from "remotion";
import type { SceneSpan } from "./config/timing";
import type { AudioConfig } from "./config/types";

/**
 * Phase-2 audio. Nothing here plays unless a file path is set in
 * src/config/audio.json AND the composition is rendered with audio
 * (ElsaboungyHourglassWithAudio).
 *
 *  - voiceoverSrc: one full voice-over file, shifted by voiceoverOffsetFrames
 *  - sceneClips:   optional per-scene clips, each starting on its scene's first frame
 *  - musicSrc:     background music, ducked while any voice-over exists
 */
export const AudioTracks: React.FC<{ audio: AudioConfig; spans: SceneSpan[] }> = ({ audio, spans }) => {
  const hasVo = Boolean(audio.voiceoverSrc) || Object.keys(audio.sceneClips ?? {}).length > 0;
  return (
    <>
      {audio.musicSrc && (
        <Html5Audio
          src={staticFile(audio.musicSrc)}
          volume={hasVo ? audio.musicDuckedVolume : audio.musicVolume}
          name="Music"
        />
      )}
      {audio.voiceoverSrc && (
        <Sequence from={audio.voiceoverOffsetFrames} name="Voice-over" layout="none">
          <Html5Audio src={staticFile(audio.voiceoverSrc)} volume={audio.voiceoverVolume} />
        </Sequence>
      )}
      {spans.map((s) => {
        const clip = audio.sceneClips?.[s.id];
        if (!clip) return null;
        return (
          <Sequence key={s.id} from={s.from} name={`VO ${s.id}`} layout="none">
            <Html5Audio src={staticFile(clip)} volume={audio.voiceoverVolume} />
          </Sequence>
        );
      })}
    </>
  );
};
