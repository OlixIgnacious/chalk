#!/usr/bin/env node
// deliver.mjs — a Short's upload kit: short.mp4, captions.srt, description.txt and plan.md.
//
//   node deliver.mjs <output-dir> [--channel channel.json] [--dry-run]
//
// A Short is one part (segments/00), rendered portrait with its captions burned in, so delivery is a check
// and a copy, not a stitch. The gates run first and nothing is written if one fails: the script is grounded,
// nothing names the source, the render is 1080x1920 at 30 fps and no longer than 3 minutes (the limit for
// both YouTube Shorts and Instagram Reels; over 60 s is allowed but warned).

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { master } from "chalk-core/scripts/loudness.mjs";
import { shortKit, describe, citedRefs, refSources, refsSection } from "../../../../../publish/lib/kit.mjs";
import { packOf } from "../../../../index.mjs";
import { mergeCaptions, notebookLinks } from "../../../../long/skills/chalk-long/scripts/kit.mjs";

const CORE = fileURLToPath(new URL("../../../../../core/bin/chalk-core.mjs", import.meta.url));
const WIDTH = 1080;
const HEIGHT = 1920;
const LIMIT = 180;
const SWEET = 60;
const TITLE_MAX = 100;

const argv = process.argv.slice(2);
const die = (m, code = 1) => {
  console.error("deliver:", m);
  process.exit(code);
};
const outDir = resolve(argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--channel") ?? ".");
const channelArg = argv.indexOf("--channel") >= 0 ? argv[argv.indexOf("--channel") + 1] : null;
const dryRun = argv.includes("--dry-run");

const readJson = (f) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch (e) {
    return die(`cannot read ${f} — ${e.message}`, 2);
  }
};
if (!existsSync(join(outDir, "short.json"))) die(`${outDir} has no short.json`, 2);
const short = readJson(join(outDir, "short.json"));
const seg = short.segments?.[0]?.id ?? "00";
const script = join(outDir, "segments", seg, "script.md");
const mp4 = join(outDir, "segments", seg, "segment.mp4");
const vtt = join(outDir, "segments", seg, "segment.vtt");
for (const f of [script, mp4, vtt]) if (!existsSync(f)) die(`${f.slice(outDir.length + 1)} is not there — build the part first`);

const channelPath = channelArg ? resolve(channelArg) : (() => {
  for (let d = outDir; ; d = dirname(d)) {
    if (existsSync(join(d, "channel.json"))) return join(d, "channel.json");
    if (dirname(d) === d) return null;
  }
})();
const channel = channelPath ? readJson(channelPath) : null;

// ── gates ─────────────────────────────────────────────────────────────────────────────────────────
const problems = [];
const gate = spawnSync(process.execPath, [CORE, "check-readability", script, "--chapter", join(outDir, "chapter.json")], { encoding: "utf8" });
if (gate.status !== 0) problems.push("the script does not pass the step-3 gate:\n    " + (gate.stderr || gate.stdout).trim().split("\n").join("\n    "));

const banned = ["chapter", "chapters", "book", "section", "the author", ...(channel?.banned_terms ?? [])];
const spoken = spawnSync(process.execPath, [CORE, "check-spoken", script, "--banned", banned.join(",")], { encoding: "utf8" });
for (const l of spoken.stderr.split("\n")) if (/says ".*", which this video must not/.test(l)) problems.push(l.trim().replace(/^FAIL /, ""));
const re = new RegExp(`(^|[^\\w])(${banned.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\w])`, "i");
for (const [what, text] of [["title", short.title], ["thesis", short.thesis]]) {
  const m = (text ?? "").match(re);
  if (m) problems.push(`short.json ${what} says "${m[2]}": "${text}"`);
}
if (!short.title) problems.push("short.json has no title");
else if (short.title.length > TITLE_MAX) problems.push(`short.json title is ${short.title.length} characters; YouTube allows ${TITLE_MAX}`);

const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate",
  "-show_entries", "format=duration", "-of", "json", mp4], { encoding: "utf8" });
if (probe.status !== 0) die("ffprobe is not on PATH, or the render is unreadable");
const info = JSON.parse(probe.stdout);
const { width, height, r_frame_rate } = info.streams[0];
const [a, b] = r_frame_rate.split("/").map(Number);
const duration = Number(info.format.duration);
if (width !== WIDTH || height !== HEIGHT || Math.round(a / (b || 1)) !== 30) problems.push(`the render is ${width}x${height} at ${(a / (b || 1)).toFixed(2)} fps; a Short is ${WIDTH}x${HEIGHT} at 30`);
if (duration > LIMIT) problems.push(`the render is ${duration.toFixed(1)}s; Shorts and Reels stop at ${LIMIT}s`);

if (problems.length) {
  console.error("deliver: refusing to deliver. Nothing was written.\n  " + problems.join("\n  "));
  process.exit(1);
}
if (duration > SWEET) console.warn(`deliver: ${duration.toFixed(1)}s is over ${SWEET}s — allowed, but a Short this long loses viewers`);

/** Each phrase's start in the part, from the narration's own words (work/<seg>/words.json). */
function resolveHits(phrases) {
  if (!phrases.length) return [];
  const f = join(outDir, "work", seg, "words.json");
  if (!existsSync(f)) die(`short.json sound.hits needs ${f.slice(outDir.length + 1)} (narrate first)`);
  const words = JSON.parse(readFileSync(f, "utf8"));
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  return phrases.map((h) => {
    const p = typeof h === "string" ? h : h.at;
    const kind = (typeof h === "object" && h.kind) || "swish";
    const want = norm(p);
    for (let i = 0; i < words.length; i++) {
      let acc = "";
      for (let k = i; k < words.length && acc.length < want.length; k++) acc += norm(words[k].text);
      if (acc.startsWith(want)) return { t: words[i].start, kind };
    }
    return die(`short.json sound.hits: "${p}" is not in the narration`);
  });
}

// ── the kit ───────────────────────────────────────────────────────────────────────────────────────
const links = notebookLinks(channel, short);
// the neutral kit (publish/lib/kit.mjs): sources for a news Short, the music credit (good practice with Pixabay
// tracks, and it explains a Content ID claim), and YouTube's description from it, as it has always read
const chapterFile = join(outDir, "chapter.json");
const refs = citedRefs(existsSync(chapterFile) ? readJson(chapterFile) : null, [readFileSync(script, "utf8")]);
const kit = shortKit({ short: { ...short, sources: short.sources ?? refSources(refs) }, links, duration, width, height,
  pack: packOf("short", { manifest: short, channel }) });
const description = describe(kit);

const md = readFileSync(script, "utf8");
const plan = [`# ${short.title}`, "", `Rendered ${duration.toFixed(1)}s, ${width}x${height}.`, ""];
for (const m of md.matchAll(/^- spoken:.*\n\s+display:\s*"(.*)"\n\s+source:\s*\[(.*)\]/gm)) plan.push(`- ${m[1]} — \`${m[2]}\``);

if (dryRun) {
  console.log(`deliver: (dry run) ${duration.toFixed(1)}s, ${width}x${height}; nothing written.\n\n${description}`);
  process.exit(0);
}
// The sound of a Short (short.json "sound"):
//   hits:   reveals that land on a designed swish (sfx.py): a phrase of the narration, or { at, kind } where
//           kind is "swish" or "impact". Each sound swells for ~0.25 s and is placed with its PEAK on the
//           phrase, so it builds into the picture's change; each hit gets its own variation.
//   music:  a bed the author supplies (a file in the output dir), under everything.
//   master: "punchy" lifts the voice (presence, compression) the way promos are mixed.
// The mix is then normalised to -14 LUFS with a -1 dBTP ceiling, the loudness Shorts and Reels play at.
const PY = [process.env.CHALK_PYTHON, process.env.HYPERFRAMES_PYTHON, fileURLToPath(new URL("../../../../../.venv/bin/python", import.meta.url))]
  .find((p) => p && existsSync(p)) ?? "python3";
const sfxPy = fileURLToPath(new URL("./sfx.py", import.meta.url));
const hits = resolveHits(short.sound?.hits ?? []);
const music = short.sound?.music ? join(outDir, short.sound.music) : null;
if (music && !existsSync(music)) die(`short.json sound.music names ${short.sound.music}, which is not there`);
const sfxDir = join(outDir, "work", "sfx");
mkdirSync(sfxDir, { recursive: true });
const ins = ["-i", mp4];
const parts = [];
const voiceChain = short.sound?.master === "punchy"
  ? "highpass=f=90,equalizer=f=3000:t=q:w=1:g=3,acompressor=threshold=-20dB:ratio=3:attack=5:release=60:makeup=4"
  : "anull";
parts.push(`[0:a]${voiceChain}[v]`);
const mixIn = ["[v]"];
hits.forEach((h, i) => {
  const wav = join(sfxDir, `${h.kind}-${i}.wav`);
  const r = spawnSync(PY, ["-I", sfxPy, wav, h.kind, String(i + 1)], { encoding: "utf8" });
  if (r.status !== 0) die(`sfx.py failed: ${r.stderr}`);
  const peak = Number(r.stdout.trim());
  ins.push("-i", wav);
  const delay = Math.max(0, Math.round((h.t - peak) * 1000));
  parts.push(`[${i + 1}:a]volume=${short.sound?.hit_volume ?? 0.5},adelay=${delay}:all=1[h${i}]`);
  mixIn.push(`[h${i}]`);
});
if (music) {
  const n = hits.length + 1;
  ins.push("-stream_loop", "-1", "-i", music);
  // the bed comes in under the first word and fades out over the last 1.5 s, so the loop back to the start is clean
  parts.push(`[${n}:a]atrim=0:${duration.toFixed(2)},volume=${short.sound?.music_volume ?? 0.12},afade=t=in:d=0.4,` +
    `afade=t=out:st=${Math.max(0, duration - 1.5).toFixed(2)}:d=1.5[m]`);
  mixIn.push("[m]");
}
// the mix only; loudness is mastered in two passes after, like every deliver (core/scripts/loudness.mjs)
parts.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:normalize=0:duration=first,aresample=48000[a]`);
// a render with no audio track (a silent test clip) has nothing to mix: copy it as it is
const hasAudio = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", mp4], { encoding: "utf8" }).stdout.trim() !== "";
const args = hasAudio
  ? [...ins, "-filter_complex", parts.join(";"), "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k"]
  : ["-i", mp4, "-c", "copy"];
mkdirSync(join(outDir, "work"), { recursive: true });
const mixed = join(outDir, "work", "short.mix.mp4");
const copy = spawnSync("ffmpeg", ["-v", "error", "-y", ...args, mixed], { encoding: "utf8" });
if (copy.status !== 0) die(`ffmpeg could not write short.mp4: ${copy.stderr}`);
try {
  master(mixed, join(outDir, "short.mp4"));
} catch (e) {
  die(e.message);
}
if (hits.length) console.log(`deliver: ${hits.length} hit(s): ${hits.map((h) => `${h.kind} ${h.t.toFixed(2)}s`).join(", ")}`);
writeFileSync(join(outDir, "captions.srt"), mergeCaptions([readFileSync(vtt, "utf8")], [0], [duration]));
writeFileSync(join(outDir, "description.txt"), description);
writeFileSync(join(outDir, "kit.json"), JSON.stringify(kit, null, 2) + "\n");
if (refs.length) plan.push("", ...refsSection(refs));
writeFileSync(join(outDir, "plan.md"), plan.join("\n") + "\n");
console.log(`deliver: short.mp4 (${duration.toFixed(1)}s), captions.srt, description.txt, plan.md in ${outDir}`);
