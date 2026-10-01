#!/usr/bin/env node
// fix-index.mjs — correct the assembled index, after every assemble.
//
//   node fix-index.mjs <index.html> [--color #111111]
//
// Two corrections, both to things `assemble-index` regenerates every run, so this must run every
// run too. It is idempotent.
//
// 1. THE BASE GROUND.
//    `assemble-index.mjs` and `captions.mjs` both resolve the SAME `canvas` role out
// of frame.md, and for a dark-register series they want opposite values:
//
//   · the video ground must be the dark canvas. A per-frame background cannot serve, because a
//     frame root is clip-gated to its own window — so the assembler paints the ground on the root
//     composition instead, from the canvas role.
//   · the caption skin uses that same role for its pill TEXT, against an ink pill.
//
// Pinning `canvas` dark in frame.md therefore makes captions ink-on-ink: 1:1 contrast, invisible.
// Leaving it light makes the base ground cream, which is hidden behind each frame's own ground
// clip EXCEPT during a crossfade, when both frames are partly transparent and the cream shows
// through as a grey wash on every transition.
//
//    So frame.md keeps the preset's light canvas (captions correct by construction) and the ground
//    is corrected here. It exits non-zero if there is no ground rule to correct, rather than
//    passing silently.
//
// 2. GSAP FROM A LOCAL FILE. `hyperframes init` points the index at a jsdelivr CDN build. A
//    composition must not fetch over the network at render time, and this one is not a soft
//    failure: without gsap, `gsap.timeline` is undefined and every frame's script throws, so the
//    whole video renders static. assets/gsap.min.js is staged beside the other assets. The
//    caption rail beside the index carries the same CDN reference and is regenerated just as
//    often, so it is corrected in the same pass.
//
// (An `http://www.w3.org/2000/svg` xmlns is an identifier, not a fetch — it is left alone.)

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const die = (m) => {
  console.error("fix-index:", m);
  process.exit(2);
};

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("usage: fix-index.mjs <index.html> [--color #111111]");
  process.exit(2);
}
const ci = argv.indexOf("--color");
const color = ci >= 0 ? argv[ci + 1] : "#111111";
if (!/^#[0-9a-fA-F]{3,8}$/.test(color ?? "")) die(`--color needs a hex colour, got ${JSON.stringify(color)}`);

let html;
try {
  html = readFileSync(file, "utf8");
} catch (err) {
  die(`cannot read ${file} — ${err.message}`);
}

const rule = /(#root\s*\{[^}]*?background:\s*)(#[0-9a-fA-F]{3,8}|[a-z]+)/;
const m = html.match(rule);
if (!m) {
  die(
    `${file} has no \`#root { … background: … }\` rule to correct.\n` +
      "  assemble-index writes one whenever frame.md resolves a canvas colour; if it did not,\n" +
      "  the ground is the bare body letterbox and every crossfade will show it.",
  );
}
const already = m[2].toLowerCase() === color.toLowerCase();
if (!already) html = html.replace(rule, `$1${color}`);

// GSAP: any CDN build becomes the staged local one.
const CDN_GSAP = /https?:\/\/[^"']*\/gsap[^"']*\.js/g;
const swapped = (html.match(CDN_GSAP) ?? []).length;
html = html.replace(CDN_GSAP, "assets/gsap.min.js");

try {
  writeFileSync(file, html);
} catch (err) {
  die(`cannot write ${file} — ${err.message}`);
}
// The caption rail is generated beside the index and carries the same CDN gsap.
let railSwapped = 0;
const rail = join(dirname(file), "compositions", "captions.html");
if (existsSync(rail)) {
  try {
    const before = readFileSync(rail, "utf8");
    railSwapped = (before.match(CDN_GSAP) ?? []).length;
    if (railSwapped) writeFileSync(rail, before.replace(CDN_GSAP, "assets/gsap.min.js"));
  } catch (err) {
    die(`cannot correct ${rail} — ${err.message}`);
  }
}

console.log(
  `fix-index: ${file} — ground ${already ? `already ${color}` : `${m[2]} → ${color}`}, ` +
    `${swapped + railSwapped} CDN gsap reference(s) localised` +
    (railSwapped ? " (index + caption rail)" : ""),
);
