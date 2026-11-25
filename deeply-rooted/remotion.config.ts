import {Config} from '@remotion/cli/config';
import fs from 'node:fs';

// Use a locally installed headless Chromium when one is present (cloud/CI boxes);
// otherwise Remotion downloads its own Chrome Headless Shell on first render.
const localShell =
  process.env.REMOTION_BROWSER ??
  '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
if (fs.existsSync(localShell)) {
  Config.setBrowserExecutable(localShell);
}

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setOverwriteOutput(true);
