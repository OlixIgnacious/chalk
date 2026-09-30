#!/usr/bin/env node
// ingest.mjs — normalize a chapter into chapter.json: paragraph-addressed blocks with stable ids.
//
//   node ingest.mjs <input> [--out chapter.json]
//
// Chapter selection lives at the skill level, not here: .md and .txt are a single chapter each.
// It becomes an ingest concern when EPUB and PDF land, which need the nav/ncx or page range.
//
// Those block ids are the grounding currency for the whole pipeline: every narration line and every
// piece of on-screen text cites them. They must be stable across re-runs of the same input.
//
// Supported: .md, .txt today. .epub, .pdf are TODO — see references/step-1-ingest.md.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, extname, dirname } from "node:path";

const argv = process.argv.slice(2);
const die = (m) => {
  console.error("ingest:", m);
  process.exit(2);
};

const FLAGS = ["out"];
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`--${n} needs a value`);
  return v;
};
// Positional args only. Matching on "the token before this one is not a flag" instead breaks on a
// repeated string, because indexOf finds the first occurrence rather than this one.
const flagValueIndexes = new Set(
  FLAGS.map((n) => argv.indexOf("--" + n))
    .filter((i) => i >= 0)
    .map((i) => i + 1),
);
const positional = argv.filter((a, i) => !a.startsWith("--") && !flagValueIndexes.has(i));

const input = positional[0];
if (!input) die("usage: ingest.mjs <input> [--out chapter.json]");

const outFile = flag("out", "chapter.json");
const ext = extname(input).toLowerCase();

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch (err) {
    die(`cannot read ${p} — ${err.message}`);
  }
};

/** Pad a counter into a stable id, e.g. p012. */
const id = (prefix, n) => `${prefix}${String(n).padStart(3, "0")}`;

/**
 * Markdown / plain text. Blocks split on blank lines; headings, quotes and lists detected by prefix.
 * Deliberately simple — this is the path everything else is tested against.
 */
function ingestMarkdown(text) {
  const blocks = [];
  let n = 0;
  for (const raw of text.split(/\n\s*\n/)) {
    const t = raw.trim();
    if (!t) continue;
    let kind = "para";
    if (/^#{1,6}\s/.test(t)) kind = "heading";
    else if (/^>/.test(t)) kind = "quote";
    else if (/^([-*+]|\d+\.)\s/m.test(t)) kind = "list";
    blocks.push({
      id: id(kind === "heading" ? "h" : "p", ++n),
      kind,
      text: t.replace(/^#{1,6}\s*/, "").replace(/^>\s?/gm, ""),
    });
  }
  return blocks;
}

function unsupported(what) {
  die(
    `${what} ingestion is not implemented yet.\n` +
      `  See references/step-1-ingest.md and references/edge-cases.md.\n` +
      `  For now, convert to Markdown and re-run.`,
  );
}

let blocks;
let quality = "clean";

switch (ext) {
  case ".md":
  case ".markdown":
  case ".txt":
    blocks = ingestMarkdown(read(input));
    break;
  case ".epub":
    // TODO: a zip of XHTML. Read nav/ncx for chapter splits, strip tags, keep footnotes as blocks.
    unsupported("EPUB");
    break;
  case ".pdf":
    // TODO: pdftotext -layout; detect multi-column; OCR via tesseract when there is no text layer;
    // crop equation regions rather than trusting extracted notation.
    unsupported("PDF");
    break;
  default:
    die(`unrecognized extension "${ext}"`);
}

if (!blocks.length) die("no blocks extracted — is the input empty?");

const chapter = {
  title: blocks.find((b) => b.kind === "heading")?.text ?? basename(input, ext),
  source: basename(input),
  lang: "en", // TODO: detect; a non-English chapter must check for a Kokoro voice before planning
  quality,
  blocks,
};

try {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(chapter, null, 2) + "\n");
} catch (err) {
  die(`cannot write ${outFile} — ${err.message}`);
}

const words = blocks.reduce((a, b) => a + b.text.split(/\s+/).length, 0);
console.log(`ingest: ${blocks.length} blocks, ~${words} words, quality=${quality} → ${outFile}`);
if (words > 10000) console.warn("ingest: over 10k words — this is a course, not one lesson. Split it.");
if (words < 400) console.warn("ingest: under 400 words — one segment. Do not pad.");
