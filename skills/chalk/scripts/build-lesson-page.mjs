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
const die = (m) => {
  console.error("build-lesson-page:", m);
  process.exit(2);
};

const FLAGS = ["out", "player"];
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`--${n} needs a value`);
  return v;
};
// Positional args only — a flag's value may well end in .json, and picking that as the manifest
// silently builds the wrong page.
const flagValueIndexes = new Set(
  FLAGS.map((n) => argv.indexOf("--" + n))
    .filter((i) => i >= 0)
    .map((i) => i + 1),
);
const positional = argv.filter((a, i) => !a.startsWith("--") && !flagValueIndexes.has(i));

const manifestPath = positional.find((a) => a.endsWith(".json"));
if (!manifestPath) die("usage: build-lesson-page.mjs <lesson.json> [--out lesson.html]");

const outFile = flag("out", join(dirname(manifestPath), "lesson.html"));
const playerDir = flag("player", resolve(fileURLToPath(new URL("../assets/player", import.meta.url))));

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
} catch (err) {
  die(`cannot read ${manifestPath} — ${err.message}`);
}

// Validate what the player depends on, rather than shipping a page that silently half-works.
// Presence is not enough: a null or non-numeric duration, or a checkpoint whose answer indexes
// past its options, produces a page that loads and then cannot be used. A checkpoint HOLDS until
// answered, so an unreachable answer is a lesson no learner can finish.
const str = (v) => typeof v === "string" && v.trim() !== "";
const label = (s, i) => (str(s?.id) ? `segment ${s.id}` : `segment #${i + 1}`);

if (!Array.isArray(manifest.segments) || !manifest.segments.length) die("manifest has no segments[]");

const seen = new Set();
manifest.segments.forEach((s, i) => {
  const at = label(s, i);
  for (const field of ["id", "title", "mp4"]) {
    if (s[field] === undefined) die(`${at} is missing "${field}"`);
    if (!str(s[field])) die(`${at} has a non-string or empty "${field}"`);
  }
  if (s.duration === undefined) die(`${at} is missing "duration"`);
  if (typeof s.duration !== "number" || !Number.isFinite(s.duration) || s.duration <= 0) {
    die(`${at} has a duration that is not a positive number: ${JSON.stringify(s.duration)}`);
  }
  if (seen.has(s.id)) die(`duplicate segment id "${s.id}" — the player keys its state on id`);
  seen.add(s.id);

  if (s.checkpoint === undefined) return;
  const c = s.checkpoint;
  if (!str(c.prompt) || !Array.isArray(c.options) || c.answer === undefined) {
    die(`${at}: checkpoint needs prompt, options[] and answer`);
  }
  if (c.options.length < 2) die(`${at}: checkpoint needs at least two options`);
  if (!c.options.every(str)) die(`${at}: checkpoint has a non-string or empty option`);
  if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer >= c.options.length) {
    die(
      `${at}: checkpoint answer ${JSON.stringify(c.answer)} is not an index into its ` +
        `${c.options.length} options — no learner could ever pass this checkpoint`,
    );
  }
  if (!Array.isArray(c.source) || !c.source.length || !c.source.every(str)) {
    die(`${at}: checkpoint has no source ids — every answer cites the chapter`);
  }
});

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
