// Renders review stills (one bundle, many frames) + a contact sheet.
// Usage: node scripts/render-stills.mjs [frame frame ...]
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const timeline = JSON.parse(fs.readFileSync(path.join(root, "src/config/timeline.json"), "utf8"));
const outDir = path.join(root, "out/stills");
fs.mkdirSync(outDir, { recursive: true });

const browser =
  process.env.REMOTION_BROWSER ??
  "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const browserExecutable = fs.existsSync(browser) ? browser : null;

let frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
if (!frames.length) {
  let from = 0;
  for (const s of timeline.scenes) {
    const d = Math.round(s.seconds * timeline.fps);
    frames.push(from + Math.round(d * 0.2), from + Math.round(d * 0.55), from + d - 14);
    from += d;
  }
}

const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "ElsaboungyHourglass", browserExecutable });
const files = [];
for (const frame of frames) {
  const output = path.join(outDir, `f${String(frame).padStart(4, "0")}.jpg`);
  await renderStill({ serveUrl, composition, frame, output, imageFormat: "jpeg", jpegQuality: 88, browserExecutable, overwrite: true });
  files.push(output);
  console.log("still", frame);
}

// contact sheet (6 per row, scaled down)
const cols = 6;
const args = [];
files.forEach((f) => args.push("-i", f));
const scaled = files.map((_, i) => `[${i}:v]scale=270:480,drawtext=text='${frames[i]}':x=8:y=8:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.5[v${i}]`).join(";");
const layout = files.map((_, i) => `${(i % cols) * 270}_${Math.floor(i / cols) * 480}`).join("|");
const filter = `${scaled};${files.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${files.length}:layout=${layout}:fill=black`;
try {
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args, "-filter_complex", filter, path.join(outDir, "contact-sheet.jpg")]);
  console.log("contact sheet:", path.join(outDir, "contact-sheet.jpg"));
} catch (e) {
  console.warn("contact sheet skipped:", e.message);
}
