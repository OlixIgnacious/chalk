#!/usr/bin/env node
// deliver.mjs — step 5: the stitched video and the upload kit.
//
//   node deliver.mjs <output-dir> [--notebook] [--keep-work] [--dry-run]
//
// Reads video.json (optionally naming the thumbnail frame) and writes video.mp4, captions.srt, chapters.txt, description.txt, thumbnail.png,
// plan.md and, with --notebook, notebook.ipynb.
//
// Order matters. The grounding gate runs FIRST: stitching video only to refuse it afterwards wastes
// the slow part, and a kit written over an ungrounded script is exactly what the gate is for. The
// size and chapter checks run next, for the same reason. Only then does anything get written.

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, renameSync, copyFileSync } from "node:fs";

// An unchanged output keeps its timestamp, so the reports read from it (learner.md reads captions.srt)
// do not go stale every time the kit is re-delivered for a change elsewhere, such as the notebook.
const writeIfChanged = (f, text) => { if (!existsSync(f) || readFileSync(f, "utf8") !== text) writeFileSync(f, text); };
import { join, dirname, resolve, basename } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { master } from "chalk-core/scripts/loudness.mjs";
import { longKit, describe, citedRefs, refSources, refsSection } from "../../../../../publish/lib/kit.mjs";
import { packOf } from "../../../../index.mjs";
import { stamp, buildChapters, chaptersText, mergeCaptions, buildDescription, notebookLinks } from "./kit.mjs";
import { buildNotebook, checkSyntax, executeNotebook, loadScenes, findFragments } from "./build-notebook.mjs";

import { fileURLToPath } from "node:url";

/** This repo's core, called directly so it resolves wherever the output dir sits. */
const CORE = fileURLToPath(new URL("../../../../../core/bin/chalk-core.mjs", import.meta.url));

const argv = process.argv.slice(2);
const die = (m) => {
  console.error("deliver:", m);
  process.exit(2);
};
const outDir = resolve(argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--channel") ?? ".");
const wantNotebook = argv.includes("--notebook");
const keepWork = argv.includes("--keep-work");
const dryRun = argv.includes("--dry-run");
const channelArg = argv.indexOf("--channel") >= 0 ? argv[argv.indexOf("--channel") + 1] : null;

const WIDTH = 1920;
const HEIGHT = 1080;

for (const bin of ["ffmpeg", "ffprobe"]) {
  if (spawnSync(bin, ["-version"], { stdio: "ignore" }).status !== 0) die(`${bin} is not on PATH.`);
}
const run = (bin, args) => execFileSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 28 });
const probe = (file, stream) =>
  JSON.parse(run("ffprobe", ["-v", "error", "-select_streams", stream, "-show_streams", "-show_format", "-of", "json", file]));

const manifestPath = join(outDir, "video.json");
if (!existsSync(manifestPath)) die(`no video.json in ${outDir} — step 4 has not produced the segments.`);
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (e) {
  die(`cannot read ${manifestPath} — ${e.message}`);
}
const segments = manifest.segments;
if (!Array.isArray(segments) || !segments.length) die("video.json has no segments[]");

const mp4s = [];
const vtts = [];
for (const s of segments) {
  for (const k of ["id", "title", "mp4", "vtt"]) if (!s[k]) die(`a segment is missing "${k}" in video.json`);
  const mp4 = join(outDir, s.mp4);
  if (!existsSync(mp4)) die(`segment ${s.id}: ${s.mp4} is not there — step 4 has not finished.`);
  const vtt = join(outDir, s.vtt);
  if (!existsSync(vtt)) die(`segment ${s.id}: ${s.vtt} is not there — emit the VTT in step 4.`);
  mp4s.push(mp4);
  vtts.push(vtt);
}

// ── gate 1: grounding ─────────────────────────────────────────────────────────────────────────────

const scriptFiles = segments.map((s) => join(outDir, "segments", s.id, "script.md")).filter(existsSync);
if (!scriptFiles.length) die("no segments/NN/script.md found, so nothing can be shown to be grounded.");
const chapterJsonPath = join(outDir, "chapter.json");
const gate = spawnSync(process.execPath, [CORE, "check-readability", ...scriptFiles, ...(existsSync(chapterJsonPath) ? ["--chapter", chapterJsonPath] : [])], { encoding: "utf8" });
if (gate.error) die(`cannot run chalk-core (${gate.error.message}).`);
if (gate.status !== 0) {
  console.error("deliver: the scripts do not pass the step-3 gate:\n" + gate.stderr.trim());
  console.error("deliver: refusing to deliver. Nothing was written.");
  process.exit(1);
}
const scenesBySegment = loadScenes(outDir, segments);
// A derived example's numbers come from its script; a missing script leaves them with no origin.
const missingScripts = segments.flatMap((seg) => (scenesBySegment[seg.id] ?? [])
  .filter((sc) => sc.computedBy && !existsSync(join(outDir, "segments", seg.id, sc.computedBy)))
  .map((sc) => `segment ${seg.id}: scene "${sc.title}" computes its example in ${sc.computedBy}, which is missing`));
if (missingScripts.length) {
  console.error("deliver:\n  " + missingScripts.join("\n  ") + "\ndeliver: refusing to deliver. Nothing was written.");
  process.exit(1);
}

// ── gate 1b: the channel's rules — the viewer never hears the source, and hears the chosen voice ──────
//
// channel.json (--channel, or the nearest one above the output dir) is what makes a video part of a
// channel. When there is one, a script line, title or thesis that names the source (chapter, book,
// section, the author, or a channel banned term) is refused, and so is a part narrated in another voice.

const channelPath = channelArg ? resolve(channelArg) : (() => {
  for (let d = outDir; ; d = dirname(d)) {
    if (existsSync(join(d, "channel.json"))) return join(d, "channel.json");
    if (dirname(d) === d) return null;
  }
})();
let channel = null;
if (channelPath) {
  try {
    channel = JSON.parse(readFileSync(channelPath, "utf8"));
  } catch (e) {
    die(`cannot read ${channelPath} — ${e.message}`);
  }
  const banned = ["chapter", "chapters", "book", "section", "the author", ...(channel.banned_terms ?? [])];
  const channelProblems = [];
  const spoken = spawnSync(process.execPath, [CORE, "check-spoken", ...scriptFiles, "--banned", banned.join(",")], { encoding: "utf8" });
  for (const l of spoken.stderr.split("\n")) if (/says ".*", which this video must not/.test(l)) channelProblems.push(l.trim().replace(/^FAIL /, ""));
  const re = new RegExp(`(^|[^\\w])(${banned.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\w])`, "i");
  for (const [what, text] of [["title", manifest.title], ["thesis", manifest.thesis], ...segments.map((s) => [`part ${s.id} title`, s.title])]) {
    const m = (text ?? "").match(re);
    if (m) channelProblems.push(`video.json ${what} says "${m[2]}": "${text}"`);
  }
  if (channel.voice) {
    for (const s of segments) {
      const meta = join(outDir, "segments", s.id, "video", "audio_meta.json");
      if (!existsSync(meta)) continue;
      const v = JSON.parse(readFileSync(meta, "utf8")).voice_id;
      if (v && v !== channel.voice) channelProblems.push(`part ${s.id} was narrated as ${v}; ${basename(channelPath)} says ${channel.voice}`);
    }
  }
  if (channelProblems.length) {
    console.error(`deliver: the video breaks ${channelPath}'s rules:\n  ` + channelProblems.join("\n  "));
    console.error("deliver: refusing to deliver. Nothing was written.");
    process.exit(1);
  }
}

// ── gate 2: size and chapters ─────────────────────────────────────────────────────────────────────

const durations = [];
const sizeProblems = [];
for (const [i, mp4] of mp4s.entries()) {
  const info = probe(mp4, "v:0");
  const v = info.streams?.[0];
  if (!v) die(`segment ${segments[i].id}: ${segments[i].mp4} has no video stream.`);
  if (v.width !== WIDTH || v.height !== HEIGHT) {
    sizeProblems.push(`segment ${segments[i].id} is ${v.width}x${v.height}, not ${WIDTH}x${HEIGHT}`);
  }
  durations.push(Number(info.format?.duration ?? 0));
}
const { chapters, problems } = buildChapters(segments, durations);
if (sizeProblems.length || problems.length) {
  console.error("deliver: the video is not ready for YouTube:\n  " + [...sizeProblems, ...problems].join("\n  "));
  console.error("deliver: nothing was written.");
  process.exit(1);
}
const starts = chapters.map((c) => c.at);

// The thumbnail: the manifest may name a frame, because the automatic pick is only the longest still
// span and can land mid-animation under a caption. A bad name fails here, before anything is written.
let thumbIndex = 0;
let thumbAt = null;
// A designed thumbnail (`"thumbnail": { "image": "thumbnail-src/x.png" }`) is used as it is; the frame grab
// then goes to thumbnail-frame.png, so a re-delivery never overwrites the design.
const thumbImage = manifest.thumbnail?.image ? resolve(outDir, manifest.thumbnail.image) : null;
if (thumbImage && !existsSync(thumbImage)) {
  console.error(`deliver: thumbnail image ${manifest.thumbnail.image} is not there. Nothing was written.`);
  process.exit(1);
}
if (manifest.thumbnail?.segment !== undefined) {
  const { segment, at } = manifest.thumbnail;
  thumbIndex = segments.findIndex((s) => s.id === String(segment));
  if (thumbIndex < 0) {
    console.error(`deliver: thumbnail names segment "${segment}", which is not in video.json. Nothing was written.`);
    process.exit(1);
  }
  thumbAt = Number(at);
  if (!(thumbAt >= 0 && thumbAt < durations[thumbIndex])) {
    console.error(
      `deliver: thumbnail time ${at} is outside segment ${segments[thumbIndex].id} ` +
        `(0–${durations[thumbIndex].toFixed(2)}s). Nothing was written.`,
    );
    process.exit(1);
  }
}

let captions;
try {
  captions = mergeCaptions(vtts.map((f) => readFileSync(f, "utf8")), starts, durations);
} catch (e) {
  console.error(`deliver: cannot merge captions — ${e.message}`);
  process.exit(1);
}

if (dryRun) {
  console.log(chaptersText(chapters).trimEnd());
  console.log(`deliver: (dry run) ${chapters.length} chapters, ${stamp(starts.at(-1) + durations.at(-1))} total; nothing written.`);
  process.exit(0);
}

// ── thumbnail: a settled frame of the hook ────────────────────────────────────────────────────────

/** Spans where nothing moves, from ffmpeg's freezedetect. A settled card is, by definition, frozen. */
function freezeSpans(file) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-i", file, "-vf", "freezedetect=n=-55dB:d=0.3", "-map", "0:v:0", "-f", "null", "-"], { encoding: "utf8" });
  const log = (r.stderr ?? "") + (r.stdout ?? "");
  const spans = [];
  let start = null;
  for (const line of log.split("\n")) {
    const s = line.match(/freeze_start:\s*([\d.]+)/);
    if (s) start = Number(s[1]);
    const e = line.match(/freeze_end:\s*([\d.]+)/);
    if (e && start !== null) {
      spans.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return spans;
}
function settledTime(file, duration) {
  const after = duration * 0.15;
  const spans = freezeSpans(file).filter((s) => s.end - s.start >= 0.3 && s.end > after);
  if (!spans.length) return Math.min(duration * 0.6, Math.max(0, duration - 0.1));
  const best = spans.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  return Math.min(Math.max(best.start, after) + 0.25, best.end - 0.05, duration - 0.05);
}

const at = thumbAt ?? settledTime(mp4s[thumbIndex], durations[thumbIndex]);
const frameOut = join(outDir, thumbImage ? "thumbnail-frame.png" : "thumbnail.png");
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", mp4s[thumbIndex],
               "-frames:v", "1", "-vf", "scale=1280:720", frameOut]);
if (thumbImage) {
  copyFileSync(thumbImage, join(outDir, "thumbnail.png"));
  console.log(`deliver: thumbnail.png from ${manifest.thumbnail.image} (frame grab: thumbnail-frame.png)`);
} else console.log(`deliver: thumbnail.png from ${segments[thumbIndex].id} at ${at.toFixed(2)}s`);

// ── the stitched video ────────────────────────────────────────────────────────────────────────────

const sig = (f) => {
  const v = probe(f, "v:0").streams?.[0] ?? {};
  const a = probe(f, "a:0").streams?.[0] ?? {};
  return [v.codec_name, v.width, v.height, v.r_frame_rate, a.codec_name, a.sample_rate, a.channels].join("|");
};
const uniform = new Set(mp4s.map(sig)).size === 1;
const listFile = join(outDir, "work", "concat.txt");
mkdirSync(dirname(listFile), { recursive: true });
writeFileSync(listFile, mp4s.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");
const base = ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile];
const video = join(outDir, "video.mp4");
// the same segments make the same video: an encode is not byte-stable, so compare what went in, not what came out
const inputsHash = createHash("sha1").update(JSON.stringify(mp4s.map((f) => [basename(dirname(f)), readFileSync(f).length,
  createHash("sha1").update(readFileSync(f)).digest("hex")]))).update("loudness:-14/-1").digest("hex");
const hashFile = join(outDir, "work", "video.inputs");
if (existsSync(video) && existsSync(hashFile) && readFileSync(hashFile, "utf8") === inputsHash) {
  console.log("deliver: video.mp4 unchanged (same segments)");
} else {
  const joined = join(outDir, "work", "video.concat.mp4");
  const fresh = join(outDir, "work", "video.new.mp4");
  run("ffmpeg", uniform
    ? [...base, "-c", "copy", joined]
    : [...base, "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", joined]);
  // one loudness for the whole video, the same as a Short's and a lesson's (core/scripts/loudness.mjs)
  master(joined, fresh);
  rmSync(joined);
  renameSync(fresh, video);
  writeFileSync(hashFile, inputsHash);
  console.log(`deliver: video.mp4 ${uniform ? "concatenated without re-encoding the picture" : "re-encoded (segments differ)"}, mastered to −14 LUFS`);
}

// ── the written kit ───────────────────────────────────────────────────────────────────────────────

writeIfChanged(join(outDir, "captions.srt"), captions);
writeIfChanged(join(outDir, "chapters.txt"), chaptersText(chapters));

let notebookMade = false;
if (wantNotebook) {
  const chapterPath = join(outDir, "chapter.json");
  if (!existsSync(chapterPath)) die("--notebook needs chapter.json beside video.json.");
  const chapterJson = JSON.parse(readFileSync(chapterPath, "utf8"));
  const { notebook, skipped, problems: nbProblems } = buildNotebook({
    chapter: chapterJson,
    fragments: findFragments(chapterJson),
    manifest,
    links: notebookLinks(channel, manifest),
    readSegmentFile: (id, f) => {
      const p = join(outDir, "segments", id, f);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    },
  });
  if (nbProblems.length) {
    console.error("deliver: the notebook cannot be built:\n  " + nbProblems.join("\n  "));
    process.exit(1);
  }
  const { errors } = checkSyntax(notebook);
  if (errors.length) {
    console.error("deliver: the notebook has invalid Python:\n  " +
      errors.map(([i, msg, line]) => `code cell ${i + 1}: ${msg} (line ${line})`).join("\n  "));
    process.exit(1);
  }
  const run = executeNotebook(notebook);
  if (run.errors.length) {
    console.error("deliver: a notebook cell fails when run in order:\n  " + run.errors.join("\n  "));
    process.exit(1);
  }
  writeFileSync(join(outDir, "notebook.ipynb"), JSON.stringify(notebook, null, 1) + "\n");
  for (const s of skipped) console.warn(`deliver: notebook skipped ${s.id} (${s.why})`);
  notebookMade = true;
  console.log(`deliver: notebook.ipynb, ${notebook.cells.length} cells`);
}

// the neutral kit every destination shapes (publish/), and YouTube's description from it, as it has always read
const refs = citedRefs(existsSync(chapterJsonPath) ? JSON.parse(readFileSync(chapterJsonPath, "utf8")) : null,
  scriptFiles.map((f) => readFileSync(f, "utf8")));
const kit = longKit({
  manifest: { ...manifest, title: manifest.title ?? basename(outDir), sources: manifest.sources ?? refSources(refs) },
  chapters,
  notebook: notebookMade,
  links: notebookMade ? notebookLinks(channel, manifest) : null,
  duration: starts.at(-1) + durations.at(-1),
  pack: packOf("long", { manifest, channel }),
});
writeFileSync(join(outDir, "kit.json"), JSON.stringify(kit, null, 2) + "\n");
writeFileSync(join(outDir, "description.txt"), describe(kit));

// plan.md — the audit trail: what each chapter claims, which example it uses, and where it came from.
const parsed = JSON.parse(
  spawnSync(process.execPath, [CORE, "check-readability", ...scriptFiles, "--json"], { encoding: "utf8" }).stdout,
);
const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const plan = [`# ${manifest.title ?? basename(outDir)}`, ""];
if (manifest.source) plan.push(`Source: \`${manifest.source}\``, "");
plan.push(
  "Every line below traces to a block id in `chapter.json`. This file is the audit trail for the",
  "grounding claim, not a summary.",
  "",
  "## Chapters and examples",
  "",
);
for (const [i, s] of segments.entries()) {
  plan.push(`### ${stamp(starts[i])} · ${s.title}`, "");
  for (const sc of scenesBySegment[s.id] ?? []) {
    if (!sc.example) continue;
    plan.push(
      sc.example === "derived"
        ? `- Example (derived, not from the chapter): "${sc.title}", computed by \`${sc.computedBy}\``
        : `- Example (from the chapter): "${sc.title}"`,
    );
  }
  plan.push("");
}
plan.push("## Source citations", "", "| Segment | Scene | Line | Source |", "|---|---|---|---|");
let rows = 0;
for (const f of parsed.files) {
  for (const sc of f.scenes) {
    for (const e of sc.entries) {
      const text = e.display ?? e.spoken ?? "";
      plan.push(`| ${esc(basename(dirname(f.file)))} | ${esc(sc.title)} | ${esc(text)}${e.display ? "" : " _(spoken only)_"} | ${(e.source ?? []).map((b) => `\`${b}\``).join(" ")} |`);
      rows++;
    }
  }
}
plan.push("", `${rows} line(s) cited.`, "", ...refsSection(refs));
writeFileSync(join(outDir, "plan.md"), plan.join("\n"));

if (!keepWork) rmSync(join(outDir, "work"), { recursive: true, force: true });
console.log(`deliver: video.mp4, captions.srt, chapters.txt, description.txt, thumbnail.png, plan.md${notebookMade ? ", notebook.ipynb" : ""} in ${outDir}`);
