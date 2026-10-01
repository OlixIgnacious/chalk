#!/usr/bin/env node
// emit-vtt.mjs — caption groups → segment.vtt, in VIDEO time.
//
//   node emit-vtt.mjs <caption_groups.json> <out.vtt>
//
// NOT `hyperframes transcribe <vo.wav> --to vtt`. That emits cues in NARRATION time, and a chalk
// segment's video is longer than its narration — every frame can end in a hold, so video time and
// narration time drift apart by the accumulated hold before each cue. The caption groups the
// engine builds are already absolute video time, and already carry the DISPLAY layer (`dy/dx`,
// `30°`) rather than the phonetic spoken layer, which is what must reach the screen.
//
// Input: [{ start, end, text }] or { groups: [...] } — both shapes the builder emits.

import { readFileSync, writeFileSync } from "node:fs";

const die = (m) => {
  console.error("emit-vtt:", m);
  process.exit(2);
};

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error("usage: emit-vtt.mjs <caption_groups.json> <out.vtt>");
  process.exit(2);
}

let raw;
try {
  raw = JSON.parse(readFileSync(src, "utf8"));
} catch (err) {
  die(`cannot read ${src} — ${err.message}`);
}

const groups = Array.isArray(raw) ? raw : (raw.groups ?? raw.lines ?? null);
if (!Array.isArray(groups)) die(`${src} has no caption groups`);
if (!groups.length) die(`${src} has no cues — captions were skipped, so there is no VTT to write`);

const ts = (s) => {
  if (typeof s !== "number" || !Number.isFinite(s) || s < 0) die(`cue time is not a usable number: ${JSON.stringify(s)}`);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec.toFixed(3).padStart(6, "0")}`;
};

const out = ["WEBVTT", ""];
groups.forEach((g, i) => {
  // A zero-length or reversed cue renders as a flash or not at all; catch it here rather than in
  // a player that silently drops it.
  if (!(g.end > g.start)) die(`cue ${i + 1} does not advance: ${g.start} → ${g.end}`);
  const text = String(g.text ?? "").trim();
  if (!text) die(`cue ${i + 1} has no text`);
  out.push(String(i + 1), `${ts(g.start)} --> ${ts(g.end)}`, text, "");
});

try {
  writeFileSync(dest, out.join("\n"));
} catch (err) {
  die(`cannot write ${dest} — ${err.message}`);
}
console.log(`emit-vtt: ${groups.length} cue(s) → ${dest}`);
