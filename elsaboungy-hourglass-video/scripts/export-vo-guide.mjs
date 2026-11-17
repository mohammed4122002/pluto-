// Writes the voice-over recording guide from src/config/timeline.json:
//   voiceover/VO_SCRIPT.md  — per-scene lines with exact in/out times
//   voiceover/vo-timing.srt — the same as subtitles (handy as a guide track)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tl = JSON.parse(fs.readFileSync(path.join(root, "src/config/timeline.json"), "utf8"));
const out = path.join(root, "voiceover");
fs.mkdirSync(out, { recursive: true });

const ts = (frames, sep = ",") => {
  const ms = Math.round((frames / tl.fps) * 1000);
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s}${sep}${String(ms % 1000).padStart(3, "0")}`;
};

let from = 0;
const rows = tl.scenes.map((s, i) => {
  const d = Math.round(s.seconds * tl.fps);
  const row = { i: i + 1, ...s, from, to: from + d, d };
  from += d;
  return row;
});

const md = [
  "# Elsaboungy hourglass ad — voice-over guide (phase 2)",
  "",
  `Total length: ${(from / tl.fps).toFixed(2)} s @ ${tl.fps} fps. Generated from src/config/timeline.json — rerun \`npm run vo:guide\` after retiming.`,
  "",
  "| # | Scene | In | Out | Seconds | Voice-over line (Egyptian Arabic) |",
  "|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.i} | ${r.name} | ${ts(r.from, ".")} | ${ts(r.to, ".")} | ${r.seconds} | ${r.vo} |`),
  "",
  "Recording notes:",
  "- Keep each line inside its scene window; leave ~0.3 s of air before a cut.",
  "- Deliver one WAV (48 kHz) for the whole ad → public/audio/voiceover/voiceover.wav, or one clip per scene → public/audio/voiceover/<scene-id>.wav.",
  "- Then set the paths in src/config/audio.json and render `npm run render:vo`.",
  "",
].join("\n");
fs.writeFileSync(path.join(out, "VO_SCRIPT.md"), md);

const srt = rows
  .map((r, k) => `${k + 1}\n${ts(r.from + 6)} --> ${ts(Math.max(r.from + 7, r.to - 9))}\n${r.vo}\n`)
  .join("\n");
fs.writeFileSync(path.join(out, "vo-timing.srt"), srt);
console.log("wrote voiceover/VO_SCRIPT.md and voiceover/vo-timing.srt");
