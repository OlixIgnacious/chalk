#!/usr/bin/env node
// manim-render.mjs — render a Tier 2 Manim scene into a Hyperframes-compositable clip.
//
//   node manim-render.mjs <scene.py> [--fps 30] [--resolution 1920x1080] [--out dir/]
//
// Three constraints, each of which is a real failure mode (see references/manim.md):
//
//   1. Cairo renderer, not OpenGL — OpenGL ignores --transparent (manim#3919).
//   2. manim -t emits .mov/qtrle, which CHROME CANNOT DECODE, and Hyperframes renders in Chrome.
//      Transcode to WebM VP9 yuva420p, which is what carries the alpha.
//   3. fps and dimensions must match the composition EXACTLY. A mismatch is an error, not something
//      to resize afterwards — a 60fps clip in a 30fps composition judders.

import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : d;
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

/** Install gate. Falls back to Tier 1 rather than failing a run halfway through. */
function preflight() {
  const missing = [];
  for (const [bin, args] of [
    ["manim", ["--version"]],
    ["ffmpeg", ["-version"]],
  ]) {
    try {
      execFileSync(bin, args, { stdio: "ignore" });
    } catch {
      missing.push(bin);
    }
  }
  try {
    execFileSync("latex", ["--version"], { stdio: "ignore" });
  } catch {
    missing.push("latex (TinyTeX or BasicTeX — not MacTeX)");
  }
  if (missing.length) {
    console.error("manim-render: Tier 2 toolchain incomplete — missing: " + missing.join(", "));
    console.error("  See references/manim.md for the install gate.");
    console.error("  Fall back to Tier 1 (KaTeX in HTML) and tell the user; do not fail the run.");
    process.exit(3); // distinct code so the caller can route to the Tier 1 fallback
  }
}

preflight();

// TODO: everything below is the intended shape, not yet exercised end to end.
//       Milestone 2 of the plan is the spike that proves the alpha actually composites.
for (const scene of scenes) {
  if (!existsSync(scene)) die(`no such scene: ${scene}`);

  console.log(`manim-render: ${scene} @ ${resolution} ${fps}fps`);

  // 1 + 2. Cairo renderer, transparent, pinned fps/resolution.
  //    execFileSync("manim", ["render", "--renderer=cairo", "-t",
  //                           "--fps", fps, "--resolution", resolution,
  //                           "--format", "mov", scene], { stdio: "inherit" });

  // 3. Transcode to a codec Chrome can actually decode, preserving alpha.
  //    execFileSync("ffmpeg", ["-y", "-i", mov,
  //                            "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
  //                            "-r", fps, webm], { stdio: "inherit" });

  console.warn("manim-render: TODO — not implemented. See references/manim.md.");
  process.exit(1);
}
