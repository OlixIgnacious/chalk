#!/usr/bin/env node
// apply-display.mjs — put the aligned DISPLAY tokens where the caption builder reads its words.
//
//   node apply-display.mjs --script segments/NN/script.md --captions work/NN/captions.json \
//        --audio-meta <project>/audio_meta.json
//
// `align-captions` maps the transcript's words onto the display layer, but the caption builder
// (`faceless-explainer`'s captions.mjs) reads `audio_meta.json` voices[].words — which still hold the
// raw transcript, with its mishearings ("Amine" for "A mean"). Nothing connects the two, so without
// this the captions show the transcript, not the script.
//
// A frame is a script scene, and a scene holds one or more spoken entries; the captions file has one
// line per entry, in order. Aligned times are absolute across the segment, so each frame's tokens are
// shifted back by where that frame starts. A word ends where the next begins, and the last ends where
// the transcript's own last word did.
//
// The raw transcript is kept as audio_meta.transcript.json and every run starts from it, so running
// this twice never compounds; a freshly generated audio_meta.json replaces that backup. Nothing is written if the script and the captions disagree.

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const die = (m) => {
  console.error("apply-display:", m);
  process.exit(2);
};
const flag = (n) => {
  const i = argv.indexOf("--" + n);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`--${n} needs a value`);
  return v;
};
const scriptPath = flag("script");
const captionsPath = flag("captions");
const metaPath = flag("audio-meta");
if (!scriptPath || !captionsPath || !metaPath) {
  die("usage: apply-display.mjs --script <script.md> --captions <captions.json> --audio-meta <audio_meta.json>");
}
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch (e) {
    return die(`cannot read ${p} — ${e.message}`);
  }
};
const json = (p) => {
  try {
    return JSON.parse(read(p));
  } catch (e) {
    return die(`${p} is not valid JSON — ${e.message}`);
  }
};

// Spoken entries per scene, in order. A fenced block is an example, not part of the script.
const counts = [];
let fenced = false;
for (const line of read(scriptPath).split("\n")) {
  if (/^\s*(```|~~~)/.test(line)) {
    fenced = !fenced;
    continue;
  }
  if (fenced) continue;
  if (/^##\s/.test(line)) counts.push(0);
  else if (counts.length && /^\s*-?\s*spoken:/.test(line)) counts[counts.length - 1]++;
}
const scenes = counts.filter((n) => n > 0);

const lines = json(captionsPath).lines ?? die(`${captionsPath} has no lines[]`);
const entries = scenes.reduce((a, b) => a + b, 0);
if (entries !== lines.length) {
  die(`${entries} spoken entries in the script but ${lines.length} caption lines — re-run build-tokens and align-captions.`);
}

// Always start from the raw transcript. A meta this script already rewrote carries `display_applied`,
// so its raw words are in the backup. A meta without the flag is freshly generated — the VO was
// re-made — and is itself the raw transcript, so it replaces the backup. Trusting an old backup there
// would put the previous take's words on the new voice.
const backup = join(dirname(metaPath), "audio_meta.transcript.json");
if (!existsSync(metaPath)) die(`cannot read ${metaPath} — no such file`);
const current = json(metaPath);
if (current.display_applied) {
  if (!existsSync(backup)) die(`${metaPath} was already rewritten but ${backup} is gone — re-run the audio step.`);
} else {
  copyFileSync(metaPath, backup);
}
const meta = json(backup);
if (scenes.length !== meta.voices?.length) {
  die(`the script has ${scenes.length} scenes but ${meta.voices?.length ?? 0} voiced frame(s) — a frame is a scene.`);
}

let base = 0;
let at = 0;
for (const [fi, v] of meta.voices.entries()) {
  const tokens = lines.slice(at, at + scenes[fi]).flatMap((l) => l.w.map(([text, start]) => [text, start - base]));
  at += scenes[fi];
  const lastEnd = v.words.at(-1)?.end ?? v.duration_s;
  // Starts never go backwards: two display tokens sharing one misheard spoken word can come out of the
  // aligner a millisecond apart in the wrong order, and a caption cannot precede the word before it.
  let prev = 0;
  const starts = tokens.map(([, s]) => (prev = Math.max(prev, Math.max(0, Number(s.toFixed(3))))));
  v.words = tokens.map(([text], i) => {
    const start = starts[i];
    const next = i + 1 < tokens.length ? starts[i + 1] : lastEnd;
    return { id: `w${i}`, text, start, end: Number(Math.max(next, start + 0.05).toFixed(3)) };
  });
  base += v.duration_s;
}
meta.display_applied = true;
// Three or more words on one start time means the alignment broke (a misheard word made the aligner skip
// ahead and squeeze the rest together), and it prints no MISMATCH. Refuse rather than write broken captions.
for (const v of meta.voices) {
  for (let i = 0; i < v.words.length; ) {
    let j = i;
    while (j + 1 < v.words.length && v.words[j + 1].start === v.words[i].start) j++;
    if (j - i >= 2) {
      console.error(
        `apply-display: frame ${v.frame}: ${j - i + 1} words share one start time (${v.words[i].start}s): ` +
          `"${v.words.slice(i, j + 1).map((w) => w.text).join(" ")}". The transcript probably misheard a word just ` +
          "before them. Reword that line, or add a lexicon `heard` form, and align again. Nothing was written.",
      );
      process.exit(1);
    }
    i = j + 1;
  }
}
writeFileSync(metaPath, JSON.stringify(meta, null, 2));
console.log(`apply-display: ${meta.voices.length} frame(s), ${meta.voices.map((v) => v.words.length).join("/")} display words → ${metaPath}`);
