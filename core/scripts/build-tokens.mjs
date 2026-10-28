#!/usr/bin/env node
// build-tokens.mjs — script.md + lexicon.json → the script-tokens.json align-captions reads.
//
//   node build-tokens.mjs <script.md> <lexicon.json> <out.json>
//
// step-4-segments.md names script-tokens.json as an input to align-captions.mjs, and nothing
// produced it. This does.
//
// A display token is paired with the form the TRANSCRIPT will carry, not the form the voice was
// told to say. Those differ more often than they look: `hyperframes transcribe` renormalises
// speech back into notation, so "one over one point seven three" comes back as `1 over 1.73` and
// "thirty degrees" as `30 degrees`. The lexicon therefore carries three fields — `display` (on
// screen), `spoken` (what TTS says) and `heard` (what the transcript returns) — and the aligner
// is matched against `heard`, falling back to `spoken` when they are the same.
//
// Output shape (align-captions.mjs):
//   { lines: [{ id, scene, tokens: [ "word" | {display, spoken} ] }] }

import { readFileSync, writeFileSync } from "node:fs";

const die = (m) => {
  console.error("build-tokens:", m);
  process.exit(2);
};

const [scriptPath, lexPath, outPath] = process.argv.slice(2);
if (!scriptPath || !lexPath || !outPath) {
  console.error("usage: build-tokens.mjs <script.md> <lexicon.json> <out.json>");
  process.exit(2);
}

let lex, md;
try {
  lex = JSON.parse(readFileSync(lexPath, "utf8"));
} catch (err) {
  die(`cannot read ${lexPath} — ${err.message}`);
}
try {
  md = readFileSync(scriptPath, "utf8");
} catch (err) {
  die(`cannot read ${scriptPath} — ${err.message}`);
}
if (!Array.isArray(lex.terms)) die(`${lexPath} has no terms[]`);
for (const t of lex.terms) {
  if (!t || typeof t.display !== "string" || !t.display) die("a lexicon term has no display form");
  if (typeof t.spoken !== "string" || !t.spoken) die(`lexicon term "${t.display}" has no spoken form`);
}
// Longest display form first, so "x + dx" wins over a bare "x".
const terms = [...lex.terms].sort((a, b) => b.display.length - a.display.length);

// Parse the two-layer script. Entries are grouped the way check-readability groups them: a leading
// "-" opens an entry, and so does repeating a field the current entry already has.
const entries = [];
let scene = null;
let cur = null;
let inFence = false;
for (const raw of md.split("\n")) {
  if (/^\s*(```|~~~)/.test(raw)) {
    inFence = !inFence;
    continue;
  }
  if (inFence) continue;
  const h = raw.match(/^##\s+(.*)/);
  if (h) {
    scene = h[1].trim();
    cur = null;
    continue;
  }
  const f = raw.match(/^\s*(-\s*)?(spoken|display):\s*"(.*)"\s*$/);
  if (!f || !scene) continue;
  const [, bullet, name, value] = f;
  if (bullet || !cur || cur[name] !== null) {
    cur = { scene, spoken: null, display: null };
    entries.push(cur);
  }
  cur[name] = value;
}

/** Split a display line into tokens, pairing any lexicon term with the form the transcript returns. */
function tokenize(display) {
  const out = [];
  let rest = display;
  outer: while (rest.length) {
    rest = rest.replace(/^\s+/, "");
    if (!rest) break;
    for (const t of terms) {
      if (!rest.startsWith(t.display)) continue;
      const after = rest.slice(t.display.length);
      // Only a whole token: "x" must not match inside "exact".
      if (/^[A-Za-z0-9]/.test(after)) continue;
      // Trailing punctuation rides on the display side so captions read correctly.
      const punct = after.match(/^[.,;:!?)]+/)?.[0] ?? "";
      out.push({ display: t.display + punct, spoken: t.heard ?? t.spoken });
      rest = after.slice(punct.length);
      continue outer;
    }
    const word = rest.match(/^\S+/)[0];
    out.push(word);
    rest = rest.slice(word.length);
  }
  return out;
}

const lines = entries
  .filter((e) => e.display)
  .map((e, i) => ({
    id: `l${String(i + 1).padStart(3, "0")}`,
    scene: e.scene,
    tokens: tokenize(e.display),
  }));

if (!lines.length) die(`${scriptPath} has no display lines — check the shape in step-3-script.md`);

try {
  writeFileSync(outPath, JSON.stringify({ lines }, null, 2) + "\n");
} catch (err) {
  die(`cannot write ${outPath} — ${err.message}`);
}

const paired = lines.flatMap((l) => l.tokens).filter((t) => typeof t === "object").length;
const total = lines.reduce((n, l) => n + l.tokens.length, 0);
console.log(`build-tokens: ${lines.length} line(s), ${total} display token(s), ${paired} paired → ${outPath}`);
