#!/usr/bin/env node
// manim-render.mjs — render a Tier 2 Manim scene into a Hyperframes-compositable clip.
//
//   node manim-render.mjs <scene.py> [--fps 30] [--resolution 1920x1080] [--out dir/]
//                         [--scene ClassName] [--quality h] [--keep-mov] [--print]
//
// Three constraints, each of which is a real failure mode (see references/manim.md):
//
//   1. Cairo renderer, not OpenGL — OpenGL ignores --transparent (manim#3919).
//   2. manim -t emits .mov/qtrle, which CHROME CANNOT DECODE, and Hyperframes renders in Chrome.
//      Transcode to WebM VP9 yuva420p, which is what carries the alpha.
//   3. fps and dimensions must match the composition EXACTLY. A mismatch is an error, not something
//      to resize afterwards — a 60fps clip in a 30fps composition judders.
//
// Exit codes: 0 rendered · 2 usage or render error · 3 toolchain incomplete, fall back to Tier 1.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { basename, join, resolve, dirname } from "node:path";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`--${n} needs a value`);
  return v;
};
const die = (m) => {
  console.error("manim-render:", m);
  process.exit(2);
};

const scenes = argv.filter((a) => a.endsWith(".py"));
if (!scenes.length) die("usage: manim-render.mjs <scene.py> [...] [--fps 30] [--resolution WxH]");

const fps = flag("fps", "30");
const resolution = flag("resolution", "1920x1080");
const outDir = flag("out", "assets");
const sceneName = flag("scene", null);
const quality = flag("quality", "h");
const keepMov = argv.includes("--keep-mov");
const printOnly = argv.includes("--print");

if (!/^\d+$/.test(fps)) die(`--fps must be a whole number of frames, got "${fps}"`);
const dims = resolution.match(/^(\d+)x(\d+)$/);
if (!dims) die(`--resolution must look like 1920x1080, got "${resolution}"`);
const [, width, height] = dims;

// manim wants the resolution the other way round, and as a single comma-joined value.
const manimResolution = `${width},${height}`;

/** Whichever manim is reachable: a repo venv first, then PATH. */
function findManim() {
  const local = resolve(process.cwd(), ".venv/bin/manim");
  if (existsSync(local)) return local;
  return spawnSync("manim", ["--version"], { stdio: "ignore" }).status === 0 ? "manim" : null;
}

/**
 * Install gate. Falls back to Tier 1 rather than failing a run halfway through.
 *
 * LaTeX is deliberately not a hard requirement: manim needs it only for MathTex and Tex, and a
 * construction or a parametric sweep needs none of it. Requiring it up front turned away scenes
 * that would have rendered perfectly well.
 */
function preflight(files) {
  const manim = findManim();
  const missing = [];
  if (!manim) missing.push("manim");
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) missing.push("ffmpeg");

  const usesLatex = files.some((f) => /\b(MathTex|Tex)\s*\(/.test(readFileSync(f, "utf8")));
  const haveLatex = spawnSync("latex", ["--version"], { stdio: "ignore" }).status === 0;
  if (usesLatex && !haveLatex) missing.push("latex (TinyTeX or BasicTeX — not MacTeX), needed by MathTex/Tex");

  if (missing.length) {
    console.error("manim-render: Tier 2 toolchain incomplete — missing: " + missing.join(", "));
    console.error("  See references/manim.md for the install gate.");
    console.error("  Fall back to Tier 1 (KaTeX in HTML) and tell the user; do not fail the run.");
    process.exit(3); // distinct code so the caller can route to the Tier 1 fallback
  }
  if (!usesLatex && !haveLatex) {
    console.warn("manim-render: no LaTeX found; fine for these scenes, but MathTex/Tex would need it.");
  }
  return manim;
}

const manim = preflight(scenes);

/** The newest file under dir matching a predicate — manim buries output under a quality folder. */
function newestUnder(dir, match) {
  if (!existsSync(dir)) return null;
  const out = [];
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (match(entry.name)) out.push(p);
    }
  };
  walk(dir);
  if (!out.length) return null;
  return out.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

mkdirSync(outDir, { recursive: true });
const results = [];

for (const scene of scenes) {
  if (!existsSync(scene)) die(`no such scene: ${scene}`);

  const media = join(outDir, ".manim", basename(scene, ".py"));
  const stem = sceneName || basename(scene, ".py");

  // 1. Cairo renderer, transparent, pinned fps and resolution.
  const manimArgs = [
    "render",
    "--renderer=cairo",
    "-t",
    "--format", "mov",
    "--fps", fps,
    "--resolution", manimResolution,
    "--quality", quality,
    "--media_dir", media,
    scene,
    ...(sceneName ? [sceneName] : []),
  ];

  // 2. Transcode to a codec Chrome can actually decode, preserving alpha.
  const webm = join(outDir, `${stem}.webm`);
  const ffmpegArgs = (mov) => [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", mov,
    "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
    "-b:v", "0", "-crf", "28", "-row-mt", "1",
    "-r", fps,
    "-an",
    webm,
  ];

  if (printOnly) {
    console.log([manim, ...manimArgs].join(" "));
    console.log(["ffmpeg", ...ffmpegArgs("<scene.mov>")].join(" "));
    results.push({ scene, webm });
    continue;
  }

  console.log(`manim-render: ${scene} @ ${width}x${height} ${fps}fps`);
  try {
    execFileSync(manim, manimArgs, { stdio: "inherit" });
  } catch {
    die(`manim failed on ${scene}. Its own output is above.`);
  }

  const mov = newestUnder(media, (n) => n.endsWith(".mov"));
  if (!mov) die(`manim produced no .mov under ${media} — did the scene class render anything?`);

  try {
    execFileSync("ffmpeg", ffmpegArgs(mov), { stdio: "inherit" });
  } catch {
    die(`ffmpeg could not transcode ${mov} to WebM VP9.`);
  }

  // 3. Verify what we actually produced, rather than trusting the flags.
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json", webm],
      { encoding: "utf8" },
    ),
  ).streams?.[0];

  // WebM carries alpha in a SEPARATE track, flagged by the container's AlphaMode element — so the
  // video stream legitimately reads back as yuv420p even when the alpha is intact. Checking
  // pix_fmt for "yuva420p" here rejects perfectly good clips; alpha_mode is the real signal.
  // Verified in Chrome: a page background shows through a clip that probes this way.
  if (probe?.tags?.alpha_mode !== "1") {
    die(
      `${webm} has no alpha track (AlphaMode unset) — it would composite as an opaque rectangle.\n` +
        "  Check that the scene rendered with --transparent and that the .mov is argb.",
    );
  }
  const gotFps = String(probe.r_frame_rate ?? "").split("/");
  const fpsOut = Number(gotFps[0]) / Number(gotFps[1] || 1);
  if (Math.abs(fpsOut - Number(fps)) > 0.01) {
    die(`${webm} is ${fpsOut}fps but the composition is ${fps}fps — a mismatch judders, so it is an error.`);
  }
  if (Number(probe.width) !== Number(width) || Number(probe.height) !== Number(height)) {
    die(`${webm} is ${probe.width}x${probe.height}, not ${resolution}. Pin it at render, do not resize after.`);
  }

  if (!keepMov) rmSync(media, { recursive: true, force: true });
  // Report the alpha track, not pix_fmt — pix_fmt reads yuv420p here and saying so invites someone
  // to "fix" a clip that is already correct.
  console.log(`manim-render: → ${webm} (${probe.width}x${probe.height}, ${fpsOut}fps, alpha track present)`);
  results.push({ scene, webm });
}

console.log(
  `manim-render: ${results.length} clip(s) ready. Composite with ` +
    `<video src="..." data-start data-duration data-media-start> and let Hyperframes drive playback — ` +
    "never call play(), pause() or set currentTime.",
);
