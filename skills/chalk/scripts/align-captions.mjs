#!/usr/bin/env node
//
// VENDORED from heygen-com/hyperframes (Apache-2.0), 2026-09-30:
//   .claude/skills/changelog-video/scripts/align-captions.mjs
// That file lives in the repo-native skills tree, which is not marketplace-distributed, so it
// cannot be installed as a dependency. Two local fixes, both recorded in CREDITS.md: guard the
// line-end scan against a line with no tokens, and against a final word that carries no `end`.
// align-captions.mjs — map SPOKEN-layer word timestamps back onto DISPLAY tokens.
//
//   node align-captions.mjs --tokens script-tokens.json --words vo-words.json \
//        --out captions.json [--tail 0.6]
//
// tokens: { lines: [{ id, tokens: [ "word" | {display, spoken} ] }] }
// words:  [ { text, start, end } ] — timestamps of the spoken text (heygen-tts --words)
// out:    { lines: [{ id, end, w: [[display, start], ...] }] } — caption-rail input
//
// Each display token consumes the spoken words of its `spoken` form (one display
// token may be several spoken words: "C L I" = 3). The display word's time = its
// FIRST spoken word's start. Line end = next line's first word start (last line:
// last spoken end + tail). Fuzzy matching absorbs TTS/timestamp quirks; anything
// it can't absorb prints MISMATCH — resolve every one before trusting captions.

import { readFileSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  return i >= 0 ? argv[i + 1] : d;
};
const die = (m) => {
  console.error("align-captions:", m);
  process.exit(2);
};

const tokensFile = flag("tokens", null) ?? die("--tokens required");
const wordsFile = flag("words", null) ?? die("--words required");
const outFile = flag("out", "captions.json");
const tail = parseFloat(flag("tail", "0.6"));

const script = JSON.parse(readFileSync(tokensFile, "utf8"));
const stream = JSON.parse(readFileSync(wordsFile, "utf8"));
if (!script.lines?.length) die("tokens file has no lines[]");
if (!stream.length) die("words file is empty");

// LOCAL FIX: a transcript whose final word carries no `end` made every downstream time NaN, which
// JSON then wrote out as null — silently, so the caption rail simply had no end time.
const lastEnd = stream.at(-1).end ?? stream.at(-1).start ?? 0;

// LOCAL FIX: whisper digitises number words unpredictably — the same VO returns "one" in one
// sentence and "1" in the next — so a bare numeral and its word must normalise alike. Whole-token
// only: this must not rewrite digits inside a longer string such as "1.73".
const NUMBER_WORDS = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", nought: "0",
};
const norm = (s) => {
  const t = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return NUMBER_WORDS[t] ?? t;
};
const lev = (a, b) => {
  if (a === b) return 0;
  const m = a.length,
    n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
};
const close = (a, b) => {
  if (!a || !b) return false;
  if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
  return lev(a, b) <= Math.max(1, Math.floor(Math.min(a.length, b.length) / 3));
};

let si = 0; // stream cursor
let soff = 0; // character offset into stream[si], for a word shared by several display tokens
let mismatches = 0;
const outLines = [];

// Greedily consume stream words from `from` whose concatenated norm builds the
// token's full spoken norm ("hey-jen" may arrive as one word or several; "C L I"
// as three). Returns { start, next, off } or null.
//
// LOCAL FIX: the cursor carries a CHARACTER OFFSET into the current stream word, so one spoken
// word can serve several display tokens. whisper renders a standalone single letter as "X"/"Y"
// and glues it to the word after it ("Yand", "Xare", "Xplus"), and previously the first token
// matched the whole glued word by prefix and swallowed it, desynchronising every token after.
// A maths chapter is mostly single-letter variables, so that is the common case here. Tokens
// sharing one spoken word share its start — the word was said once, at one time.
function consume(from, fromOff, spokenNorm) {
  let acc = "",
    start = null,
    k = from,
    off = fromOff;
  while (k < stream.length) {
    const full = norm(stream[k].text);
    const wn = full.slice(off);
    if (!wn) {
      k++;
      off = 0;
      continue;
    }
    const need = spokenNorm.slice(acc.length);
    // This word covers the rest of the token and may have characters left over for the next one.
    if (need && wn.startsWith(need)) {
      if (start === null) start = stream[k].start;
      const end = off + need.length;
      const done = end >= full.length;
      return { start, next: done ? k + 1 : k, off: done ? 0 : end };
    }
    const cand = acc + wn;
    if (spokenNorm.startsWith(cand) || close(cand, spokenNorm)) {
      if (start === null) start = stream[k].start;
      acc = cand;
      k++;
      off = 0;
      if (close(acc, spokenNorm)) return { start, next: k, off: 0 };
      continue;
    }
    break;
  }
  return acc && close(acc, spokenNorm) ? { start, next: k, off } : null;
}

for (const line of script.lines) {
  const w = [];
  for (const tok of line.tokens) {
    const display = typeof tok === "string" ? tok : tok.display;
    const spoken = typeof tok === "string" ? tok : tok.spoken;
    const spokenNorm = norm(spoken);
    if (!spokenNorm) {
      w.push([display, si < stream.length ? stream[si].start : 0]);
      continue;
    }
    // try at the cursor, then resync up to 4 words ahead
    let hit = null;
    for (let skip = 0; skip <= 4 && !hit; skip++) {
      hit = consume(si + skip, skip === 0 ? soff : 0, spokenNorm);
    }
    if (!hit) {
      console.error(
        `MISMATCH line=${line.id} display="${display}" expected~"${spoken}" heard="${stream[si]?.text ?? "<eof>"}" @${stream[si]?.start?.toFixed(2) ?? "?"}s`,
      );
      mismatches++;
      w.push([display, si < stream.length ? stream[si].start : lastEnd]);
      soff = 0;
      continue;
    }
    si = hit.next;
    soff = hit.off;
    w.push([display, +hit.start.toFixed(2)]);
  }
  outLines.push({ id: line.id, w });
}

// LOCAL FIX: a line with an empty tokens[] has no first word to borrow a time from, and indexing
// outLines[i + 1].w[0] blind threw a TypeError on it. Scan forward to the next line that has one.
for (let i = 0; i < outLines.length; i++) {
  const next = outLines.slice(i + 1).find((l) => l.w.length);
  outLines[i].end = next ? next.w[0][1] : +(lastEnd + tail).toFixed(2);
}

writeFileSync(outFile, JSON.stringify({ lines: outLines }, null, 1));
const status = mismatches ? `${mismatches} MISMATCH(ES) — resolve before building` : "clean";
console.log(
  `aligned ${outLines.length} lines / ${stream.length} spoken words → ${outFile} (${status})`,
);
process.exit(mismatches ? 1 : 0);
