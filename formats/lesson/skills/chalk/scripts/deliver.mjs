#!/usr/bin/env node
// deliver.mjs — step 6: posters, the concatenated lesson.mp4, and the written companion.
//
//   node deliver.mjs <output-dir> [--no-bake] [--keep-work] [--dry-run]
//
// Three jobs, each of which is a documented failure mode (see references/step-6-deliver.md):
//
//   1. A poster must be a SETTLED frame — text fully in, not mid-transition. A poster grabbed at an
//      arbitrary timestamp is how a good lesson ends up with a thumbnail of half-faded text. We find
//      still spans with ffmpeg's freezedetect and take the frame from inside the longest one.
//   2. The poster replaces frame 0 rather than being prepended, so duration and audio sync are
//      unchanged. That costs a video re-encode; --no-bake writes the poster files and skips it.
//   3. lesson-plan.md carries the source-citation table. That table is what makes "every claim is
//      traceable" checkable rather than a marketing line, so an unsourced line fails the step.

import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

import { fileURLToPath } from "node:url";

/** This repo's core, called directly so it resolves wherever the output dir sits. */
const CORE = fileURLToPath(new URL("../../../../../core/bin/chalk-core.mjs", import.meta.url));

const argv = process.argv.slice(2);
const die = (m) => {
  console.error("deliver:", m);
  process.exit(2);
};

const positional = argv.filter((a) => !a.startsWith("--"));
const outDir = resolve(positional[0] ?? ".");
const noBake = argv.includes("--no-bake");
const keepWork = argv.includes("--keep-work");
const dryRun = argv.includes("--dry-run");

for (const bin of ["ffmpeg", "ffprobe"]) {
  if (spawnSync(bin, ["-version"], { stdio: "ignore" }).status !== 0) die(`${bin} is not on PATH.`);
}

const manifestPath = join(outDir, "lesson.json");
if (!existsSync(manifestPath)) die(`no lesson.json in ${outDir} — step 5 has not run.`);

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (err) {
  die(`cannot read ${manifestPath} — ${err.message}`);
}
if (!Array.isArray(manifest.segments) || !manifest.segments.length) die("lesson.json has no segments[]");

const run = (bin, args) => execFileSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 28 });
const probe = (file, stream) =>
  JSON.parse(
    run("ffprobe", ["-v", "error", "-select_streams", stream, "-show_streams", "-show_format", "-of", "json", file]),
  );

// ── 1. the settled frame ──────────────────────────────────────────────────────────────────────────

/**
 * Spans where nothing is moving, from ffmpeg's freezedetect. A settled caption or diagram is by
 * definition frozen, so the longest freeze is the frame the lesson most wants to be seen by.
 */
function freezeSpans(file) {
  const r = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-vf", "freezedetect=n=-55dB:d=0.3", "-map", "0:v:0", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const log = (r.stderr ?? "") + (r.stdout ?? "");
  const spans = [];
  let start = null;
  for (const line of log.split("\n")) {
    const s = line.match(/freeze_start:\s*([\d.]+)/);
    if (s) {
      start = Number(s[1]);
      continue;
    }
    const e = line.match(/freeze_end:\s*([\d.]+)/);
    if (e && start !== null) {
      spans.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return spans;
}

function settledTime(file, duration) {
  const spans = freezeSpans(file).filter((s) => s.end - s.start >= 0.3);
  // Skip the opening, where a scene is usually still animating in or simply blank.
  const after = duration * 0.15;
  const candidates = spans.filter((s) => s.end > after);
  if (!candidates.length) return Math.min(duration * 0.6, Math.max(0, duration - 0.1));
  const best = candidates.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
  // A quarter-second inside the still span, never past its end.
  return Math.min(Math.max(best.start, after) + 0.25, best.end - 0.05, duration - 0.05);
}

// ── 2. bake it as frame 0 ─────────────────────────────────────────────────────────────────────────

/** Frames without decoding the whole file where the container already knows. */
function frameCount(file) {
  const fromHeader = probe(file, "v:0").streams?.[0]?.nb_frames;
  if (fromHeader && Number(fromHeader) > 0) return Number(fromHeader);
  return Number(
    run("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
                    "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", file]).trim(),
  );
}

function bakePoster(mp4, poster, video) {
  const tmp = mp4.replace(/\.mp4$/, ".baked.mp4");
  // setpts=PTS-STARTPTS and passthrough framing are both load-bearing. A segment that came out of
  // a concat starts at a non-zero pts (0.023s, say); against that offset `-r` duplicates a frame at
  // the head and `enable` gates the wrong one — so the poster got PREPENDED and a frame of the
  // lesson was pushed out. Normalising the timestamps first makes "frame 0" mean frame 0.
  run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", mp4, "-i", poster,
    "-filter_complex",
    `[0:v]setpts=PTS-STARTPTS[v0];` +
      `[1:v]scale=${video.width}:${video.height},setsar=1[p];` +
      `[v0][p]overlay=enable='lt(n,1)'[v]`,
    "-map", "[v]", "-map", "0:a?",
    "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p",
    "-fps_mode", "passthrough",
    "-c:a", "copy", "-movflags", "+faststart",
    tmp,
  ]);
  return tmp;
}

// ── 3. the written companion ──────────────────────────────────────────────────────────────────────

/** Parsed scripts, via chalk-core's check-readability — one shape for grounding, not two. */
function readScripts(segments) {
  const files = segments
    .map((s) => join(outDir, "segments", s.id, "script.md"))
    .filter((f) => existsSync(f));
  if (!files.length) return null;
  const r = spawnSync(process.execPath, [CORE, "check-readability", ...files, "--json"], { encoding: "utf8" });
  if (r.error) die(`cannot run chalk-core (${r.error.message}) — see references/core/ and the README.`);
  // Exit 1 means the gate failed, and its complaints matter more than this step does.
  if (r.status !== 0 && r.status !== 1) die(`check-readability could not read the scripts:\n${r.stderr}`);
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch {
    die(`check-readability --json produced nothing usable:\n${r.stderr}`);
  }
  return { files: parsed.files, gateFailed: r.status === 1, complaints: r.stderr.trim() };
}

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function lessonPlan(segments, scripts) {
  const lines = [];
  const title = manifest.title ?? basename(outDir);
  lines.push(`# ${title}`, "");
  if (manifest.source) lines.push(`Source: \`${manifest.source}\``, "");
  lines.push(
    "Every line below traces to a block id in `chapter.json`. That is the point of this file: it is",
    "the audit trail for the grounding claim, not a summary.",
    "",
    "## Syllabus",
    "",
  );

  for (const [i, s] of segments.entries()) {
    lines.push(`### ${String(i + 1).padStart(2, "0")} · ${s.title}`, "");
    if (s.objective) lines.push(`**Objective.** ${s.objective}`, "");
    if (s.checkpoint) {
      lines.push(`**Checkpoint.** ${s.checkpoint.prompt}`, "");
      const right = s.checkpoint.options?.[s.checkpoint.answer];
      if (right) lines.push(`Answer: ${right} — ${s.checkpoint.explanation ?? ""}`.trim(), "");
      if (s.checkpoint.source?.length) {
        lines.push(`Cites: ${s.checkpoint.source.map((b) => `\`${b}\``).join(" ")}`, "");
      }
    }
  }

  lines.push("## Source citations", "");
  if (!scripts) {
    lines.push(
      "_No `segments/NN/script.md` found, so there is no citation table. This lesson cannot claim",
      "its lines are traceable until step 3's scripts are on disk._",
      "",
    );
    return lines.join("\n");
  }

  lines.push("| Segment | Scene | Line | Source |", "|---|---|---|---|");
  let rows = 0;
  for (const file of scripts.files) {
    const seg = basename(dirname(file.file));
    for (const scene of file.scenes) {
      for (const e of scene.entries) {
        const text = e.display ?? e.spoken ?? "";
        const layer = e.display ? "" : " _(spoken only)_";
        lines.push(
          `| ${esc(seg)} | ${esc(scene.title)} | ${esc(text)}${layer} | ` +
            `${(e.source ?? []).map((b) => `\`${b}\``).join(" ") || "**none**"} |`,
        );
        rows++;
      }
    }
  }
  lines.push("", `${rows} line(s) cited.`, "");

  const flagged = join(outDir, "flagged.md");
  lines.push("## Flagged during planning", "");
  lines.push(
    existsSync(flagged)
      ? readFileSync(flagged, "utf8").trim()
      : "_Nothing was recorded in `flagged.md`. Anything the chapter asserts without explaining, or\n" +
        "anything ambiguous, outdated or contested, belongs there — written during step 2, not now._",
  );
  lines.push("");
  return lines.join("\n");
}

// ── run ───────────────────────────────────────────────────────────────────────────────────────────

const segments = manifest.segments;
const mp4s = [];

for (const [i, s] of segments.entries()) {
  const mp4 = join(outDir, s.mp4 ?? "");
  if (!existsSync(mp4)) die(`segment ${s.id}: ${s.mp4} is not there — step 4 has not finished.`);
  const info = probe(mp4, "v:0");
  const video = info.streams?.[0];
  if (!video) die(`segment ${s.id}: ${s.mp4} has no video stream.`);
  const duration = Number(info.format?.duration ?? s.duration ?? 0);

  const at = settledTime(mp4, duration);
  const poster = join(dirname(mp4), "poster.jpg");
  console.log(`deliver: ${s.id} settled frame at ${at.toFixed(2)}s of ${duration.toFixed(2)}s`);

  if (!dryRun) {
    run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", String(at), "-i", mp4,
                   "-frames:v", "1", "-q:v", "2", poster]);
    s.poster = join(dirname(s.mp4), "poster.jpg");

    if (!noBake) {
      const framesBefore = frameCount(mp4);
      const baked = bakePoster(mp4, poster, video);
      const framesAfter = frameCount(baked);
      const after = Number(probe(baked, "v:0").format?.duration ?? 0);

      // Frame count is the check that matters. A prepended frame barely moves the duration but
      // pushes every frame of the lesson one later and drifts the audio against it, which is the
      // whole reason step 6 says replace rather than prepend.
      const drifted = framesAfter !== framesBefore;
      if (drifted || Math.abs(after - duration) > 0.12) {
        rmSync(baked, { force: true });
        console.warn(
          `deliver: ${s.id}: baking changed the video ` +
            (drifted
              ? `(${framesBefore} frames → ${framesAfter}) — a frame was added or dropped`
              : `(${duration.toFixed(2)}s → ${after.toFixed(2)}s)`) +
            ". Keeping the original; poster.jpg is still written.",
        );
      } else {
        rmSync(mp4, { force: true });
        execFileSync("mv", [baked, mp4]);
      }
    }
  }
  mp4s.push(mp4);
  if (i === segments.length - 1) console.log(`deliver: ${segments.length} poster(s) written`);
}

// Concatenate, copying the streams when every segment agrees on their parameters.
const lessonMp4 = join(outDir, "lesson.mp4");
if (!dryRun) {
  const sig = (f) => {
    const v = probe(f, "v:0").streams?.[0] ?? {};
    const a = probe(f, "a:0").streams?.[0] ?? {};
    return [v.codec_name, v.width, v.height, v.r_frame_rate, a.codec_name, a.sample_rate, a.channels].join("|");
  };
  const uniform = new Set(mp4s.map(sig)).size === 1;
  const listFile = join(outDir, "work", "concat.txt");
  mkdirSync(dirname(listFile), { recursive: true });
  writeFileSync(listFile, mp4s.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n");

  const args = ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile];
  run("ffmpeg", uniform
    ? [...args, "-c", "copy", "-movflags", "+faststart", lessonMp4]
    : [...args, "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-pix_fmt", "yuv420p",
       "-c:a", "aac", "-movflags", "+faststart", lessonMp4]);
  console.log(`deliver: lesson.mp4 ${uniform ? "concatenated without re-encoding" : "re-encoded (segments differ)"}`);
}

// The written companion, and the grounding gate that goes with it.
const scripts = readScripts(segments);
const plan = lessonPlan(segments, scripts);
if (!dryRun) {
  writeFileSync(join(outDir, "lesson-plan.md"), plan);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

let failed = false;
if (scripts?.gateFailed) {
  console.error("deliver: the scripts do not pass the step-3 gate:\n" + scripts.complaints);
  console.error("deliver: refusing to call this delivered — lesson-plan.md is the audit trail.");
  failed = true;
}
if (!scripts) {
  console.warn("deliver: no segments/NN/script.md found, so lesson-plan.md has no citation table.");
}

if (!dryRun && !keepWork && !failed) {
  rmSync(join(outDir, "work"), { recursive: true, force: true });
}

if (failed) {
  console.error(
    `deliver: lesson.mp4 and the posters are written, but ${outDir} is not delivered. ` +
      "Fix the citations in the scripts and re-run; work/ was kept.",
  );
} else {
  console.log(
    `deliver: ${dryRun ? "(dry run) " : ""}lesson.mp4, lesson-plan.md and ` +
      `${segments.length} poster(s) in ${outDir}`,
  );
}
process.exit(failed ? 1 : 0);
