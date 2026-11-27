// Render many stills from one bundle (much faster than one `npx remotion still` per frame).
// node scripts/remotion_stills.mjs <compositionId> <outDir> <frame> [frame …]   [--props '{"k":v}'] [--png]
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const pi = args.indexOf('--props');
const props = pi >= 0 ? JSON.parse(args.splice(pi, 2)[1]) : {};
const png = args.includes('--png');
const [id, outDir, ...frames] = args.filter((a) => a !== '--png');
const shell = process.env.REMOTION_BROWSER ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const browserExecutable = fs.existsSync(shell) ? shell : undefined;
fs.mkdirSync(outDir, {recursive: true});
const serveUrl = await bundle({entryPoint: path.resolve('src/index.ts')});
const composition = await selectComposition({serveUrl, id, inputProps: props, browserExecutable});
for (const f of frames) {
  const output = path.join(outDir, `${id}_${String(f).padStart(5, '0')}.${png ? 'png' : 'jpg'}`);
  await renderStill({composition, serveUrl, output, frame: Number(f), inputProps: props, imageFormat: png ? 'png' : 'jpeg', jpegQuality: 88, browserExecutable, overwrite: true});
  console.log(output);
}
