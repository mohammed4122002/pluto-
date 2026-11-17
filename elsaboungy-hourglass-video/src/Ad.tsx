import { AbsoluteFill, Sequence } from "remotion";
import { GlobalDefs } from "./art/Defs";
import { AudioTracks } from "./AudioTracks";
import { buildSpans } from "./config/timing";
import type { AdProps, SceneId } from "./config/types";
import "./fonts";
import type { SceneProps } from "./scenes/common";
import { BrandScene } from "./scenes/BrandScene";
import { DeliveryScene } from "./scenes/DeliveryScene";
import { HourglassScene } from "./scenes/HourglassScene";
import { OrderScene } from "./scenes/OrderScene";
import { RushScene } from "./scenes/RushScene";
import { BurstScene } from "./scenes/BurstScene";
import { EndCardScene } from "./scenes/EndCardScene";
import { FlowScene } from "./scenes/FlowScene";
import { HookScene } from "./scenes/HookScene";
import { ShineScene } from "./scenes/ShineScene";
import { T } from "./theme";
import { TransitionLayer } from "./transitions/Transitions";

const SCENES: Record<SceneId, React.FC<SceneProps>> = {
  rush: RushScene,
  hourglass: HourglassScene,
  order: OrderScene,
  delivery: DeliveryScene,
  // earlier looks (available in timeline.json)
  hook: HookScene,
  flow: FlowScene,
  burst: BurstScene,
  shine: ShineScene,
  brand: BrandScene,
  endcard: EndCardScene,
};

export const Ad: React.FC<AdProps> = ({ timeline, brand, audio, withAudio }) => {
  const spans = buildSpans(timeline);
  return (
    <AbsoluteFill style={{ backgroundColor: T.blueDeep }}>
      <GlobalDefs />
      {spans.map((span) => {
        const Scene = SCENES[span.id];
        return (
          <Sequence key={span.id} from={span.from} durationInFrames={span.durationInFrames} name={span.name}>
            <Scene span={span} spans={spans} brand={brand} />
          </Sequence>
        );
      })}
      <TransitionLayer spans={spans} />
      {withAudio && <AudioTracks audio={audio} spans={spans} />}
    </AbsoluteFill>
  );
};
