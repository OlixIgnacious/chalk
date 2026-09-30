#!/usr/bin/env node
// build-lesson-page.mjs — lesson.json + the player assets → a self-contained lesson.html.
//
//   node build-lesson-page.mjs <lesson.json> [--out lesson.html] [--player <dir>]
//
// The page is static, has no build step, and uses relative paths so the output folder stays
// portable. Constraints that are easy to get wrong (see references/step-5-player.md):
//
//   · audio cannot autoplay — open on a click-to-start poster
//   · every localStorage read and write is wrapped in try/catch; the page must work without it
//   · captions on by default, keyboard navigable, honour prefers-reduced-motion
//   · a checkpoint HOLDS until answered, then shows the explanation with its source citation

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : d;
};
const die = (m) => {
  console.error("build-lesson-page:", m);
  process.exit(2);
};

const manifestPath = argv.find((a) => a.endsWith(".json"));
if (!manifestPath) die("usage: build-lesson-page.mjs <lesson.json> [--out lesson.html]");

const outFile = flag("out", join(dirname(manifestPath), "lesson.html"));
const playerDir = flag("player", resolve(fileURLToPath(new URL("../assets/player", import.meta.url))));

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

// Validate what the player depends on, rather than shipping a page that silently half-works.
if (!manifest.segments?.length) die("manifest has no segments[]");
for (const s of manifest.segments) {
  for (const field of ["id", "title", "mp4", "duration"]) {
    if (s[field] === undefined) die(`segment ${s.id ?? "?"} is missing "${field}"`);
  }
  if (s.checkpoint) {
    const c = s.checkpoint;
    if (!c.prompt || !Array.isArray(c.options) || c.answer === undefined) {
      die(`segment ${s.id}: checkpoint needs prompt, options[] and answer`);
    }
    if (!c.source?.length) {
      die(`segment ${s.id}: checkpoint has no source ids — every answer cites the chapter`);
    }
  }
}

// TODO: inline player.html / player.css / player.js from `playerDir`, with the manifest embedded
//       as a JSON script tag. Milestone 8 of the plan.
console.error(`build-lesson-page: TODO — player assets not written yet (looked in ${playerDir}).`);
console.error("  See references/step-5-player.md.");
console.log(
  `build-lesson-page: manifest valid — ${manifest.segments.length} segment(s), ` +
    `${manifest.segments.filter((s) => s.checkpoint).length} checkpoint(s), ` +
    `would write ${outFile}`,
);
process.exit(1);
