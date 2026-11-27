// Renders every burned-in cue of an episode ONCE, at full opacity, with the channel's BilingualSubtitles component
// (composition "BilingualCueStill"), as transparent PNGs. The burner then blends them onto the picture with the
// component's own fade curve — identical result, without a full-length transparent render.
// node scripts/subtitles/render_cue_stills.mjs <id> <outDir>
import {bundle} from '@remotion/bundler';
import {openBrowser, renderStill, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';

const [id, outDir] = process.argv.slice(2);
const timed = JSON.parse(fs.readFileSync(`src/data/subtitles/${id}.timed.json`, 'utf8'));
const shell = process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const browserExecutable = fs.existsSync(shell) ? shell : undefined;
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const browser = await openBrowser('chrome', {browserExecutable});
let n = 0;
for (const [i, c] of timed.cues.entries()) {
  if (c.burn === false) continue;
  const inputProps = {en: c.en, ar: c.ar, scrim: !!c.scrim};
  const output = path.join(outDir, `cue_${String(i).padStart(4, '0')}.png`);
  const composition = await selectComposition({serveUrl, id: 'BilingualCueStill', inputProps, puppeteerInstance: browser});
  await renderStill({composition, serveUrl, output, frame: 0, inputProps, imageFormat: 'png', puppeteerInstance: browser, overwrite: true});
  n++;
}
await browser.close({silent: true});
console.log(`rendered ${n} cue stills → ${outDir}`);
