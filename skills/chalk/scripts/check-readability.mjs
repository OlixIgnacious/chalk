#!/usr/bin/env node
// check-readability.mjs — enforce the reading-time floor over a segment script.
//
//   node check-readability.mjs <script.md> [...] [--rate 0.3] [--min 0.8]
//
// Any line the learner must read holds about `rate` seconds per word, counted from when the whole
// line is SETTLED — not from when it starts animating in. Short labels get a `min` floor.
//
// This runs before any render, because a rushed line is invisible in a storyboard and obvious in
// the finished video, by which point it has cost tens of minutes of frame capture.

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? parseFloat(argv[i + 1]) : d;
};

const RATE = flag("rate", 0.3); // seconds per word
const MIN = flag("min", 0.8); // floor for a short label
const files = argv.filter((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a));

if (!files.length) {
  console.error("usage: check-readability.mjs <script.md> [...]");
  process.exit(2);
}

/**
 * Parse the script shape documented in references/step-3-script.md:
 *   ## Scene N — title
 *   visual: <name> (tier N)
 *   duration: ~14s
 *   - spoken: "..."
 *     display: "..."
 *     source: [p041]
 */
function parse(md) {
  const scenes = [];
  let cur = null;
  for (const line of md.split("\n")) {
    const scene = line.match(/^##\s+(.*)/);
    if (scene) {
      cur = { title: scene[1].trim(), visual: null, tier: null, duration: null, lines: [] };
      scenes.push(cur);
      continue;
    }
    if (!cur) continue;

    const visual = line.match(/^\s*visual:\s*(.+?)\s*(?:\(tier\s*(\d)\))?\s*$/i);
    if (visual) {
      cur.visual = visual[1];
      cur.tier = visual[2] ? Number(visual[2]) : null;
      continue;
    }
    const dur = line.match(/^\s*duration:\s*~?([\d.]+)\s*s/i);
    if (dur) {
      cur.duration = parseFloat(dur[1]);
      continue;
    }
    const disp = line.match(/^\s*-?\s*display:\s*"(.*)"\s*$/);
    if (disp) {
      cur.lines.push({ text: disp[1], source: null });
      continue;
    }
    const src = line.match(/^\s*source:\s*\[(.*)\]\s*$/);
    if (src && cur.lines.length) {
      cur.lines[cur.lines.length - 1].source = src[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return scenes;
}

let failures = 0;
const fail = (file, msg) => {
  console.error(`  FAIL ${file}: ${msg}`);
  failures++;
};

for (const file of files) {
  const scenes = parse(readFileSync(file, "utf8"));
  console.log(`${file} — ${scenes.length} scene(s)`);

  if (!scenes.length) fail(file, "no scenes found; check the script shape in step-3-script.md");

  for (const s of scenes) {
    if (!s.visual) fail(file, `scene "${s.title}" names no visual`);
    if (s.tier === null) fail(file, `scene "${s.title}" names no tier`);
    if (s.duration === null) {
      fail(file, `scene "${s.title}" has no duration`);
      continue;
    }

    // Reading-time floor across every display line in the scene.
    let needed = 0;
    for (const l of s.lines) {
      const words = l.text.trim().split(/\s+/).filter(Boolean).length;
      needed += Math.max(MIN, words * RATE);
      if (!l.source || !l.source.length) {
        fail(file, `scene "${s.title}": line has no source ids — "${l.text.slice(0, 48)}…"`);
      }
    }
    if (needed > s.duration) {
      fail(
        file,
        `scene "${s.title}" needs ~${needed.toFixed(1)}s of reading time but is ${s.duration}s`,
      );
    }
  }
}

if (failures) {
  console.error(`\ncheck-readability: ${failures} failure(s)`);
  process.exit(1);
}
console.log("\ncheck-readability: ok");
