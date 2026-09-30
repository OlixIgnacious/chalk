#!/usr/bin/env node
// check-readability.mjs — enforce the reading-time floor and the grounding rule over a segment script.
//
//   node check-readability.mjs <script.md> [...] [--rate 0.3] [--min 0.8] [--json]
//
// Any line the learner must read holds about `rate` seconds per word, counted from when the whole
// line is SETTLED — not from when it starts animating in. Short labels get a `min` floor.
//
// It also enforces that every line carries `source:` ids — spoken as well as displayed. Narration
// carries most of a chapter's claims, so an unsourced spoken line is precisely the invented-fact
// failure the step-3 gate exists to catch.
//
// `--json` dumps the parsed scenes, so the citation each line actually resolved to can be read back
// — by a test, or by step 6 when it builds the source-citation table.
//
// This runs before any render, because a rushed line is invisible in a storyboard and obvious in
// the finished video, by which point it has cost tens of minutes of frame capture.

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const die = (m) => {
  console.error("check-readability:", m);
  process.exit(2);
};

// A missing or non-numeric value must not fall through as NaN: every reading-time comparison against
// NaN is false, which silently turns the whole floor off.
const num = (n, d) => {
  const i = argv.indexOf("--" + n);
  if (i < 0) return d;
  const v = parseFloat(argv[i + 1]);
  if (!Number.isFinite(v) || v < 0) die(`--${n} needs a non-negative number`);
  return v;
};

const RATE = num("rate", 0.3); // seconds per word
const MIN = num("min", 0.8); // floor for a short label
const JSON_OUT = argv.includes("--json");
const files = argv.filter((a) => !a.startsWith("--") && !/^[\d.]+$/.test(a));

if (!files.length) {
  console.error("usage: check-readability.mjs <script.md> [...] [--rate 0.3] [--min 0.8] [--json]");
  process.exit(2);
}

/** Strip the surrounding quotes the documented shape puts around spoken and display text. */
const unquote = (s) => s.match(/^"(.*)"$/)?.[1] ?? s;

/**
 * Parse the script shape documented in references/step-3-script.md:
 *   ## Scene N — title
 *   visual: <name> (tier N)
 *   duration: ~14s
 *   - spoken: "..."
 *     display: "..."
 *     source: [p041]
 *
 * Fields are grouped into ENTRIES rather than read as a flat stream. Anchoring `source:` to "the
 * last display line seen" instead lets a spoken-only entry silently rewrite the citation of the
 * entry above it — the script then cites a block that does not support it, and this checker reports
 * ok. A mis-citation is worse than a missing one, so anything ambiguous fails loudly below.
 */
function parse(md) {
  const sections = [];
  let cur = null; // current section
  let entry = null; // current spoken/display/source entry within it
  let inFence = false;

  const openEntry = () => {
    entry = { spoken: null, display: null, source: null };
    cur.entries.push(entry);
  };

  md.split("\n").forEach((line, i) => {
    const lineNo = i + 1;

    // A fenced block is an example, not part of the script — step-3-script.md documents the shape
    // inside one, and reading that back as a real scene invents failures.
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const heading = line.match(/^##\s+(.*)/);
    if (heading) {
      cur = {
        title: heading[1].trim(),
        visual: null,
        tier: null,
        duration: null,
        entries: [],
        malformed: [],
      };
      sections.push(cur);
      entry = null;
      return;
    }
    if (!cur) return;

    const visual = line.match(/^\s*visual:\s*(.+?)\s*(?:\(tier\s*(\d)\))?\s*$/i);
    if (visual) {
      cur.visual = visual[1];
      cur.tier = visual[2] ? Number(visual[2]) : null;
      return;
    }
    const dur = line.match(/^\s*duration:\s*~?([\d.]+)\s*s/i);
    if (dur) {
      cur.duration = parseFloat(dur[1]);
      return;
    }

    const field = line.match(/^\s*(-\s*)?(spoken|display|source):\s*(.*?)\s*$/i);
    if (!field) return;
    const bullet = Boolean(field[1]);
    const name = field[2].toLowerCase();
    const value = field[3];

    if (name === "source") {
      if (!entry) {
        cur.malformed.push(`line ${lineNo}: source: with no spoken or display line above it`);
        return;
      }
      if (entry.source) {
        cur.malformed.push(
          `line ${lineNo}: a second source: in one entry — is a leading "-" missing?`,
        );
        return;
      }
      entry.source = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      return;
    }

    // A leading "-" opens an entry. So does repeating a field the current entry already has, so an
    // entry written without its bullet becomes its own entry instead of overwriting the one before.
    if (!entry || bullet || entry[name] !== null) openEntry();
    entry[name] = unquote(value);
  });

  // A script may carry prose sections — reviewer notes, a summary — that are not scenes. Anything
  // titled "Scene ..." is always one, so an unfinished stub still fails rather than vanishing; any
  // other heading counts only if it carries scene content.
  const isScene = (s) =>
    /^scene\b/i.test(s.title) || s.visual !== null || s.duration !== null || s.entries.length > 0;
  return sections.filter(isScene);
}

let failures = 0;
const fail = (file, msg) => {
  console.error(`  FAIL ${file}: ${msg}`);
  failures++;
};
const log = (m) => {
  if (!JSON_OUT) console.log(m);
};

const dump = [];

for (const file of files) {
  let md;
  try {
    md = readFileSync(file, "utf8");
  } catch (err) {
    die(`cannot read ${file} — ${err.message}`);
  }
  const scenes = parse(md);
  log(`${file} — ${scenes.length} scene(s)`);
  dump.push({ file, scenes });

  if (!scenes.length) fail(file, "no scenes found; check the script shape in step-3-script.md");

  for (const s of scenes) {
    for (const m of s.malformed) fail(file, m);
    if (!s.visual) fail(file, `scene "${s.title}" names no visual`);
    if (s.tier === null) fail(file, `scene "${s.title}" names no tier`);
    if (s.duration === null) {
      fail(file, `scene "${s.title}" has no duration`);
      continue;
    }

    // Grounding covers every entry; reading time covers only what is actually on screen.
    let needed = 0;
    for (const e of s.entries) {
      const words = (e.display ?? "").trim().split(/\s+/).filter(Boolean).length;
      if (words) needed += Math.max(MIN, words * RATE);

      if (!e.source?.length) {
        const what = e.display ?? e.spoken ?? "";
        const kind = e.display ? "line" : "spoken line";
        fail(file, `scene "${s.title}": ${kind} has no source ids — "${what.slice(0, 48)}…"`);
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

if (JSON_OUT) console.log(JSON.stringify({ files: dump }, null, 2));

if (failures) {
  console.error(`\ncheck-readability: ${failures} failure(s)`);
  process.exit(1);
}
log("\ncheck-readability: ok");
