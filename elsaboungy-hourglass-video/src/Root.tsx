import { Composition } from "remotion";
import { Ad } from "./Ad";
import { PREVIEW_CLIP_FRAMES, PREVIEW_PICKS, Preview } from "./Preview";
import audio from "./config/audio.json";
import brand from "./config/brand.json";
import { totalFrames } from "./config/timing";
import timeline from "./config/timeline.json";
import type { AdProps, AudioConfig, BrandConfig, TimelineConfig } from "./config/types";

const base: AdProps = {
  timeline: timeline as TimelineConfig,
  brand: brand as BrandConfig,
  audio: audio as AudioConfig,
  withAudio: false,
};

const meta = ({ props }: { props: AdProps }) => ({
  durationInFrames: totalFrames(props.timeline),
  fps: props.timeline.fps,
  width: props.timeline.width,
  height: props.timeline.height,
});

export const RemotionRoot: React.FC = () => (
  <>
    {/* Phase 1 — silent review cut. */}
    <Composition
      id="ElsaboungyHourglass"
      component={Ad}
      defaultProps={base}
      calculateMetadata={meta}
      durationInFrames={totalFrames(base.timeline)}
      fps={30}
      width={1080}
      height={1920}
    />
    {/* Phase 2 — same picture + the voice-over / music set in config/audio.json. */}
    <Composition
      id="ElsaboungyHourglassWithAudio"
      component={Ad}
      defaultProps={{ ...base, withAudio: true }}
      calculateMetadata={meta}
      durationInFrames={totalFrames(base.timeline)}
      fps={30}
      width={1080}
      height={1920}
    />
    {/* 5-second review reel (one second from each scene). */}
    <Composition
      id="ElsaboungyPreview5s"
      component={Preview}
      defaultProps={base}
      durationInFrames={PREVIEW_PICKS.length * PREVIEW_CLIP_FRAMES}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
