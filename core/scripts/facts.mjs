#!/usr/bin/env node
// facts.mjs — the source check: is the source itself right?
//
// Grounding asks whether every line says only what its source block says. This asks whether the source is
// true. The chalk-factcheck agent judges each claim and writes <out>/facts.md; this file does the mechanical
// half, the same way every time:
//
//   - which blocks carry a checkable claim (THRESHOLD below): those are the agent's worklist, and every one
//     must have a row in facts.md;
//   - which version of the source facts.md checked: a hash of the blocks' text, so the check runs once per
//     version of the source, not once per rewrite of chapter.json (ingest rewrites it when its own code changes);
//   - whether any claim is contradicted with no live waiver in facts-accepted.md.
//
//   node facts.mjs <out>              the verdict, exit 0 when the source check is done, 1 when it is not
//   node facts.mjs <out> --claims     the worklist: every block that needs a row, with what it matched
//   node facts.mjs <out> --hash       the source hash facts.md must carry
//   node facts.mjs <out> --block-hash <id>   a block's hash, for a waiver
//   node facts.mjs <out> --json       the verdict as JSON
//
// facts.md:
//
//   # Facts
//   source: <the --hash value>
//
//   | id | block | claim | verdict | evidence |
//   |---|---|---|---|---|
//   | F1 | p012 | Kokoro was released in 2024 | supported | "…" — https://… (2026-11-17) |
//   | F2 | p013, p020 | — | none | no checkable claim: "the first element" is a position, not a record |
//
// A row's block column may list several ids. Verdicts: supported, computed (a script printed it),
// contradicted, unverifiable, none (the block matched the threshold but states nothing checkable).
//
// facts-accepted.md, the person's waivers (an agent never writes it):
//
//   | id | block | block-hash | reason |
//   |---|---|---|---|
//   | F7 | p031 | 3fa9c1d2 | the 2019 figure is what the course teaches; the exam uses it |
//
// A waiver is live while the block's text still hashes to block-hash: edit the block and the waiver lapses.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Block kinds that are never claims: code is checked verbatim by G2, equations and figures by the grounding agent. */
const NOT_PROSE = new Set(["code", "equation", "figure", "heading"]);

/** The threshold: a block matching any of these must have a row. The list is the definition; keep it short. */
export const THRESHOLD = {
  number: /\d|\b(?:hundred|thousand|million|billion|trillion|percent|per cent|dozen)\b/i,
  quote: null, // quotedSpans() below
  superlative: new RegExp(String.raw`\b(?:first|only|most|least|best|worst|never|always|record)\b` +
    // any -est word after "the", "its", "their" or a possessive ("the tallest", "Africa's highest"), less the
    // common words that merely end in -est
    String.raw`|\b(?:the|its|their|\w+'s)\s+(?!(?:rest|test|west|forest|interest|request|contest|guest|quest|chest|nest|protest|harvest|conquest|honest|modest|midwest|manifest|arrest|digest|unrest|zest|crest|vest|pest|jest)\b)[a-z]{2,}est\b`, "i"),
};

/**
 * Quotations a viewer could take as someone's words: a span in quote marks of four or more words, or a shorter
 * one followed by an attribution (a dash and a capitalised name, or "said"/"wrote"). String literals in code
 * ("rat", "car") and scare quotes are not quotations.
 */
export function quotedSpans(text) {
  const spans = [];
  for (const m of text.matchAll(/["“]([^"”\n]{2,400})["”](\s*(?:[—–-]\s*[A-Z]|,?\s*(?:said|says|wrote|writes)\b))?/g)) {
    const words = m[1].trim().split(/\s+/).length;
    if (words >= 4 || m[2]) spans.push(m[1].trim());
  }
  return spans;
}

const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']+/g, " ").trim();
const sha = (s, n) => createHash("sha1").update(s).digest("hex").slice(0, n);

/** The version of the source facts.md checked: every block's id and text, nothing else. */
export const sourceHash = (chapter) => sha(JSON.stringify((chapter?.blocks ?? []).map((b) => [b.id, b.text])), 16);
export const blockHash = (block) => sha(block?.text ?? "", 8);

/** Every block that carries a checkable claim, with the classes it matched: the agent's worklist. */
export function claimBlocks(chapter) {
  const out = [];
  for (const b of chapter?.blocks ?? []) {
    if (NOT_PROSE.has(b.kind) || !b.text) continue;
    const classes = Object.entries(THRESHOLD).filter(([, re]) => re && re.test(b.text)).map(([k]) => k);
    if (quotedSpans(b.text).length) classes.push("quote");
    if (classes.length) out.push({ id: b.id, classes });
  }
  return out;
}

/** The rows of a markdown table whose header names the given columns, as objects keyed by lower-case header. */
function table(md, want) {
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    const head = cells(lines[i]).map((h) => h.toLowerCase());
    if (!want.every((w) => head.includes(w))) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const c = cells(lines[j]);
      rows.push({ ...Object.fromEntries(head.map((h, k) => [h, c[k] ?? ""])), line: j + 1 });
    }
    return rows;
  }
  return [];
}

const VERDICTS = new Set(["supported", "computed", "contradicted", "unverifiable", "none"]);
const ids = (cell) => cell.split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^[a-z]\d+$/i.test(s));

export function parseFacts(md) {
  const source = md.match(/^source:\s*([0-9a-f]{16})\s*$/m)?.[1] ?? null;
  const rows = table(md, ["block", "verdict"]).map((r) => ({
    id: r.id ?? "", blocks: ids(r.block), claim: r.claim ?? "", verdict: r.verdict.toLowerCase().replace(/\*/g, ""),
    evidence: r.evidence ?? "", line: r.line,
  }));
  return { source, rows };
}

export function parseWaivers(md) {
  return table(md, ["block", "block-hash"]).map((r) => ({ id: r.id ?? "", blocks: ids(r.block), hash: r["block-hash"], reason: r.reason ?? "" }));
}

/**
 * The source check for an output dir → { status, why, problems[], ... }.
 *   status: "missing" (no facts.md), "stale" (it checked another version of the source), "open" (a block on the
 *   worklist has no row, a row has no verdict, or a claim is contradicted with no live waiver), "done".
 */
export function checkFacts(dir) {
  dir = resolve(dir);
  const chapter = existsSync(join(dir, "chapter.json")) ? JSON.parse(readFileSync(join(dir, "chapter.json"), "utf8")) : null;
  if (!chapter) return { status: "missing", why: "no chapter.json yet", problems: [] };
  const hash = sourceHash(chapter);
  const factsPath = join(dir, "facts.md");
  if (!existsSync(factsPath)) return { status: "missing", why: "no facts.md", problems: [], hash };
  const facts = parseFacts(readFileSync(factsPath, "utf8"));
  if (facts.source !== hash) {
    return { status: "stale", hash, why: facts.source ? `facts.md checked source ${facts.source}; the source is now ${hash}` :
      `facts.md has no "source: ${hash}" line`, problems: [] };
  }
  const blocks = new Map(chapter.blocks.map((b) => [b.id, b]));
  const waiverPath = join(dir, "facts-accepted.md");
  const waivers = existsSync(waiverPath) ? parseWaivers(readFileSync(waiverPath, "utf8")) : [];
  const waived = (row) => waivers.some((w) => (w.id && w.id === row.id || row.blocks.some((b) => w.blocks.includes(b)))
    && row.blocks.every((b) => !w.blocks.includes(b) || blockHash(blocks.get(b)) === w.hash));
  const problems = [];
  const covered = new Set(facts.rows.flatMap((r) => r.blocks));
  for (const c of claimBlocks(chapter)) if (!covered.has(c.id)) problems.push(`${c.id} (${c.classes.join(", ")}) has no row`);
  for (const r of facts.rows) {
    if (!VERDICTS.has(r.verdict)) problems.push(`facts.md:${r.line} ${r.id || r.blocks.join(",")}: verdict "${r.verdict}" is not one of ${[...VERDICTS].join(", ")}`);
    for (const b of r.blocks) if (!blocks.has(b)) problems.push(`facts.md:${r.line} cites ${b}, which is not a block`);
    if (r.verdict === "contradicted" && !waived(r)) problems.push(`${r.id || r.blocks.join(",")} is contradicted: ${r.claim} — ${r.evidence}`.slice(0, 300));
  }
  const counts = Object.fromEntries([...VERDICTS].map((v) => [v, facts.rows.filter((r) => r.verdict === v).length]));
  return problems.length
    ? { status: "open", hash, why: `${problems.length} open in facts.md: ${problems[0]}`, problems, counts }
    : { status: "done", hash, why: "", problems, counts };
}

/** Quotations shown or spoken that the source check does not support: each must sit in a block with a supported row. */
export function unsupportedQuotes(texts, chapter, factsMd) {
  const rows = factsMd ? parseFacts(factsMd).rows : [];
  const ok = new Set(rows.filter((r) => r.verdict === "supported").flatMap((r) => r.blocks));
  const bad = [];
  for (const { at, text } of texts) {
    for (const q of quotedSpans(text)) {
      const n = norm(q);
      const home = (chapter?.blocks ?? []).filter((b) => norm(b.text ?? "").includes(n));
      if (!home.length) bad.push(`${at}: "${q}" is in no source block`);
      else if (!home.some((b) => ok.has(b.id))) bad.push(`${at}: "${q}" (${home.map((b) => b.id).join(", ")}) has no supported row in facts.md`);
    }
  }
  return bad;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const dir = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--block-hash");
  if (!dir) {
    console.error("usage: facts.mjs <out> [--claims | --hash | --block-hash <id> | --json]");
    process.exit(2);
  }
  const chPath = join(resolve(dir), "chapter.json");
  if (!existsSync(chPath)) {
    console.error(`facts: ${chPath} is not there`);
    process.exit(2);
  }
  const chapter = JSON.parse(readFileSync(chPath, "utf8"));
  if (argv.includes("--hash")) {
    console.log(sourceHash(chapter));
    process.exit(0);
  }
  if (argv.includes("--block-hash")) {
    const id = argv[argv.indexOf("--block-hash") + 1];
    const b = chapter.blocks.find((x) => x.id === id);
    if (!b) {
      console.error(`facts: no block ${id}`);
      process.exit(2);
    }
    console.log(blockHash(b));
    process.exit(0);
  }
  if (argv.includes("--claims")) {
    const list = claimBlocks(chapter);
    console.log(`source: ${sourceHash(chapter)}\n${list.length} block(s) need a row in facts.md\n`);
    for (const c of list) console.log(`${c.id.padEnd(6)} ${c.classes.join(", ").padEnd(28)} ${chapter.blocks.find((b) => b.id === c.id).text.replace(/\s+/g, " ").slice(0, 90)}`);
    process.exit(0);
  }
  const r = checkFacts(dir);
  if (argv.includes("--json")) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(r.status === "done" ? `facts: done (${Object.entries(r.counts).filter(([, n]) => n).map(([v, n]) => `${n} ${v}`).join(", ")})` : `facts: ${r.status} — ${r.why}`);
    for (const p of r.problems.slice(1, 20)) console.log(`  ${p}`);
  }
  process.exit(r.status === "done" ? 0 : 1);
}
