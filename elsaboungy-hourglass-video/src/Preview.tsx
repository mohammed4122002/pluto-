import { AbsoluteFill, Sequence } from "remotion";
import { Ad } from "./Ad";
import { buildSpans } from "./config/timing";
import type { AdProps, SceneId } from "./config/types";

/** Which moment of each scene the 5-second review reel shows (fraction of the scene). */
export const PREVIEW_PICKS: { id: SceneId; at: number }[] = [
  { id: "rush", at: 0.3 },
  { id: "hourglass", at: 0.47 },
  { id: "order", at: 0.55 },
  { id: "delivery", at: 0.16 },
  { id: "endcard", at: 0.24 },
];
export const PREVIEW_CLIP_FRAMES = 30;

/** 5-second review reel: one second from each scene, in order. */
export const Preview: React.FC<AdProps> = (props) => {
  const spans = buildSpans(props.timeline);
  const picks = PREVIEW_PICKS.map((p) => {
    const s = spans.find((x) => x.id === p.id);
    return s ? Math.round(s.from + s.durationInFrames * p.at) : null;
  }).filter((x): x is number => x !== null);
  return (
    <AbsoluteFill>
      {picks.map((start, i) => (
        <Sequence key={i} from={i * PREVIEW_CLIP_FRAMES} durationInFrames={PREVIEW_CLIP_FRAMES}>
          <Sequence from={-start} layout="absolute-fill">
            <Ad {...props} withAudio={false} />
          </Sequence>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
