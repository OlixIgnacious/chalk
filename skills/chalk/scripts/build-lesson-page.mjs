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

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
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

// ── captions ──────────────────────────────────────────────────────────────────────────────────────
// Captions are embedded as cues rather than linked with <track>. A browser treats every file:// page
// as its own origin and blocks the text track, so a linked VTT silently shows nothing in exactly the
// place this page is meant to be opened from. Parsing at build time also keeps the page standalone.

/** HH:MM:SS.mmm or MM:SS.mmm → seconds. */
function vttTime(s) {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  if (!m) return null;
  return (
    Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000
  );
}

function parseVtt(text) {
  const cues = [];
  for (const block of text.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [rawStart, rawEnd] = lines[i].split("-->");
    const start = vttTime(rawStart ?? "");
    const end = vttTime((rawEnd ?? "").split(/\s+/).filter(Boolean)[0] ?? "");
    if (start === null || end === null) continue;
    const body = lines
      .slice(i + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "") // voice and class spans carry no meaning for our own rail
      .trim();
    if (body) cues.push({ start, end, text: body });
  }
  return cues;
}

const manifestDir = dirname(resolve(manifestPath));
let cueCount = 0;
let missingCaptions = 0;

// The embedded copy carries the cues; lesson.json on disk is left exactly as the pipeline wrote it.
const embedded = {
  ...manifest,
  segments: manifest.segments.map((s) => {
    if (!s.captions) return s;
    const p = isAbsolute(s.captions) ? s.captions : join(manifestDir, s.captions);
    if (!existsSync(p)) {
      missingCaptions++;
      return s;
    }
    const cues = parseVtt(readFileSync(p, "utf8"));
    cueCount += cues.length;
    return { ...s, cues };
  }),
};

// ── assemble ──────────────────────────────────────────────────────────────────────────────────────

const asset = (name) => {
  const p = join(playerDir, name);
  if (!existsSync(p)) die(`player asset missing: ${p}\n  See references/step-5-player.md.`);
  return readFileSync(p, "utf8");
};

// The template's own "this is a template" note must not ship in the built page.
const shell = asset("player.html").replace(
  /<!--[\s\S]*?-->\n/,
  `<!-- Built by chalk from lesson.json. Self-contained: styles, script and captions are inline,\n` +
    `     media paths are relative, so this folder can be moved or zipped as it is. -->\n`,
);
const css = asset("player.css");
const js = asset("player.js");

// A chapter's own words end up inside a <script> tag, so anything that could close that tag early
// has to go. Escaping "<" covers </script>, and the JSON parser reads \u003c back as "<".
const json = JSON.stringify(embedded, null, 1).replace(/</g, "\\u003c");

const title = typeof manifest.title === "string" && manifest.title.trim() ? manifest.title : "Lesson";
const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const marker = (name) => {
  const token = `/*@chalk:${name}@*/`;
  if (!shell.includes(token)) die(`player.html has no ${token} marker`);
  return token;
};

const page = shell
  .replace(marker("css"), () => css)
  .replace(marker("manifest"), () => json)
  .replace(marker("js"), () => js)
  .replace(/@chalk:title@/g, () => escapeHtml(title))
  .replace(/@chalk:lang@/g, () => escapeHtml(manifest.lang || "en"));

for (const leftover of page.match(/@chalk:[a-z]+@/g) ?? []) {
  die(`player.html left an unreplaced marker: ${leftover}`);
}

try {
  writeFileSync(outFile, page);
} catch (err) {
  die(`cannot write ${outFile} — ${err.message}`);
}

const checkpoints = manifest.segments.filter((s) => s.checkpoint).length;
console.log(
  `build-lesson-page: ${manifest.segments.length} segment(s), ${checkpoints} checkpoint(s), ` +
    `${cueCount} caption cue(s) → ${outFile}`,
);
if (missingCaptions) {
  console.warn(
    `build-lesson-page: ${missingCaptions} segment(s) name a captions file that is not there — ` +
      "those segments will play without captions.",
  );
}
