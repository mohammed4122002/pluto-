import { Config } from "@remotion/cli/config";
import fs from "node:fs";

// Output defaults — the review export is a high quality, silent H.264 MP4.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setCodec("h264");
Config.setCrf(16);
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);

// Use a locally installed Chrome Headless Shell when one is provided
// (REMOTION_BROWSER=/path/to/chrome-headless-shell), otherwise Remotion
// downloads its own the first time.
const browser =
  process.env.REMOTION_BROWSER ??
  "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
if (fs.existsSync(browser)) {
  Config.setBrowserExecutable(browser);
}

Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY ?? 0) || null);
Config.setDelayRenderTimeoutInMilliseconds(120000);
