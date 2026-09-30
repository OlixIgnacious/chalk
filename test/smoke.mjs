#!/usr/bin/env node
// smoke.mjs — the regression gate for the four pipeline scripts.
//
//   node test/smoke.mjs        (or: npm test)
//
// chalk is markdown and reference data, not an application, so this is deliberately one
// dependency-free file rather than a test framework. It asserts exit codes and the parts of the
// output the pipeline actually reads, and it pins the two grounding bugs that used to report `ok`:
// an unsourced SPOKEN line passing the gate, and a `source:` migrating up onto the entry above it.
//
// Fixtures are written to a temp dir, except the two chapter fixtures, which are the public-domain
// Gutenberg text in fixtures/ — never test against a copyrighted book.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scripts = join(root, "skills/chalk/scripts");
const tmp = mkdtempSync(join(tmpdir(), "chalk-smoke-"));

const run = (script, ...args) =>
  spawnSync(process.execPath, [join(scripts, script), ...args], { encoding: "utf8" });
const write = (name, body) => {
  const p = join(tmp, name);
  writeFileSync(p, body);
  return p;
};
const fixture = (name) => join(root, "fixtures", name);
const out = (name) => join(tmp, name);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// ── ingest ────────────────────────────────────────────────────────────────────────────────────────

test("ingest: the prose fixture extracts cleanly", () => {
  const r = run("ingest.mjs", fixture("gutenberg-chapter.md"), "--out", out("prose.json"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /quality=clean/);
  const ch = JSON.parse(readFileSync(out("prose.json"), "utf8"));
  assert.ok(ch.blocks.length > 20, `expected a multi-block chapter, got ${ch.blocks.length}`);
  assert.equal(ch.blocks[0].kind, "heading");
  assert.ok(
    ch.blocks.every((b) => /^[hp]\d{3}$/.test(b.id)),
    "every block id must be a padded, stable id",
  );
});

test("ingest: the maths fixture keeps its LaTeX notation verbatim", () => {
  const r = run("ingest.mjs", fixture("gutenberg-math-chapter.md"), "--out", out("math.json"));
  assert.equal(r.status, 0, r.stderr);
  const text = JSON.parse(readFileSync(out("math.json"), "utf8"))
    .blocks.map((b) => b.text)
    .join("\n");
  // The extractor must not silently rewrite notation — a mis-transcribed formula is the worst
  // failure this tool can produce.
  assert.ok(text.includes("$x$"), "inline maths should survive ingestion untouched");
});

test("ingest: block ids are stable across re-runs", () => {
  run("ingest.mjs", fixture("gutenberg-chapter.md"), "--out", out("a.json"));
  run("ingest.mjs", fixture("gutenberg-chapter.md"), "--out", out("b.json"));
  assert.equal(
    readFileSync(out("a.json"), "utf8"),
    readFileSync(out("b.json"), "utf8"),
    "ids are the grounding currency; they must not move between runs",
  );
});

test("ingest: empty input and unknown extensions are refused", () => {
  assert.equal(run("ingest.mjs", write("empty.md", ""), "--out", out("e.json")).status, 2);
  assert.equal(run("ingest.mjs", write("x.rtf", "hi")).status, 2);
});

test("ingest: EPUB and PDF report themselves unimplemented rather than half-working", () => {
  for (const ext of ["epub", "pdf"]) {
    const r = run("ingest.mjs", write(`x.${ext}`, ""));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not implemented yet/);
  }
});

// ── check-readability ─────────────────────────────────────────────────────────────────────────────

const scene = (body, { duration = "~30s", visual = "plot (tier 1)" } = {}) =>
  `## Scene 1 — test\nvisual: ${visual}\nduration: ${duration}\n\n${body}\n`;

test("check-readability: the documented example passes", () => {
  const p = write(
    "good.md",
    scene(
      `- spoken: "As the price goes up, people buy less of it."\n` +
        `  display: "As the price goes up, people buy less of it."\n` +
        `  source: [p041, p042]`,
      { duration: "~14s" },
    ),
  );
  const r = run("check-readability.mjs", p);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /check-readability: ok/);
});

test("check-readability: a line with too little time on screen fails", () => {
  const p = write(
    "rushed.md",
    scene(
      `- spoken: "As the price goes up, people buy a great deal less of the thing in question."\n` +
        `  display: "As the price goes up, people buy a great deal less of the thing in question."\n` +
        `  source: [p041]`,
      { duration: "~2s" },
    ),
  );
  const r = run("check-readability.mjs", p);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /reading time/);
});

test("check-readability: a missing source and a missing tier each fail", () => {
  const nosrc = write("nosrc.md", scene(`- spoken: "A claim."\n  display: "A claim."`));
  assert.equal(run("check-readability.mjs", nosrc).status, 1);

  const notier = write(
    "notier.md",
    scene(`- spoken: "A claim."\n  display: "A claim."\n  source: [p1]`, { visual: "plot" }),
  );
  const r = run("check-readability.mjs", notier);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /names no tier/);
});

// REGRESSION — an unsourced spoken line used to pass, because `source:` was only ever attached to
// `display:` lines. Narration carries most of the claims, so this was the widest grounding hole.
test("check-readability: an unsourced SPOKEN line fails even with nothing on screen", () => {
  const p = write(
    "spoken-only.md",
    scene(`- spoken: "Ninety-three percent of all candles are made of paraffin."`),
  );
  const r = run("check-readability.mjs", p);
  assert.equal(r.status, 1, "ungrounded narration must not pass the step-3 gate");
  assert.match(r.stderr, /spoken line has no source ids/);
});

// REGRESSION — `source:` was anchored to the last display line seen, so a spoken-only entry
// overwrote the citation of the entry above it and the checker still reported ok.
test("check-readability: a source: does not migrate up onto the entry above it", () => {
  const p = write(
    "migrate.md",
    scene(
      `- spoken: "The candle burns because wax is drawn up the wick."\n` +
        `  display: "Wax is drawn up the wick."\n\n` +
        `- spoken: "Ninety-three percent of all candles are made of paraffin."\n` +
        `  source: [p999]`,
    ),
  );
  const r = run("check-readability.mjs", p);
  assert.equal(r.status, 1, "the display line is unsourced and must be reported as such");
  assert.match(r.stderr, /Wax is drawn up the wick/, "p999 must not be credited to the wick line");
});

// The same shape from the other side: when entry 1 IS sourced, its citation stays put and only
// entry 2 is reported — proving the id was not moved rather than merely that the file failed.
test("check-readability: a correct citation stays with its own entry", () => {
  const p = write(
    "attrib.md",
    scene(
      `- spoken: "The candle burns because wax is drawn up the wick."\n` +
        `  display: "Wax is drawn up the wick."\n` +
        `  source: [p010]\n\n` +
        `- spoken: "Ninety-three percent of all candles are made of paraffin."`,
    ),
  );
  const r = run("check-readability.mjs", p);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /1 failure/, "only the unsourced paraffin line should fail");
  assert.doesNotMatch(r.stderr, /Wax is drawn up the wick/, "p010 must still ground the wick line");
});

test("check-readability: an orphaned or doubled source: is reported, not guessed at", () => {
  const p = write(
    "malformed.md",
    `## Scene 1 — test\nvisual: plot (tier 1)\nduration: ~30s\nsource: [p000]\n\n` +
      `- spoken: "A claim."\n  display: "A claim."\n  source: [p001]\n  source: [p002]\n`,
  );
  const r = run("check-readability.mjs", p);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /with no spoken or display line above it/);
  assert.match(r.stderr, /a second source:/);
});

test("check-readability: colons in display text and display-before-spoken both parse", () => {
  const p = write(
    "order.md",
    scene(
      `- display: "Rate: 0.3s per word"\n` +
        `  spoken: "Rate, zero point three seconds per word."\n` +
        `  source: [p001]`,
    ),
  );
  const r = run("check-readability.mjs", p);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

// ── align-captions ────────────────────────────────────────────────────────────────────────────────

test("align-captions: display tokens take their first spoken word's start", () => {
  // "KaTeX" is one display token spoken as two words; it must land on "kay", at 1.20.
  const tokens = write(
    "tokens.json",
    JSON.stringify({
      lines: [
        { id: "l1", tokens: ["As", "the", "price", { display: "KaTeX", spoken: "kay tek" }] },
        { id: "l2", tokens: ["people", "buy", "less."] },
      ],
    }),
  );
  const words = write(
    "words.json",
    JSON.stringify([
      { text: "As", start: 0.0, end: 0.18 },
      { text: "the", start: 0.18, end: 0.3 },
      { text: "price", start: 0.3, end: 0.62 },
      { text: "kay", start: 1.2, end: 1.44 },
      { text: "tek", start: 1.44, end: 1.7 },
      { text: "people", start: 1.9, end: 2.2 },
      { text: "buy", start: 2.2, end: 2.44 },
      { text: "less", start: 2.44, end: 2.8 },
    ]),
  );
  const r = run("align-captions.mjs", "--tokens", tokens, "--words", words, "--out", out("c.json"));
  assert.equal(r.status, 0, r.stderr);
  const caps = JSON.parse(readFileSync(out("c.json"), "utf8"));
  assert.deepEqual(caps.lines.map((l) => l.id), ["l1", "l2"]);
  assert.equal(caps.lines[0].w.at(-1)[0], "KaTeX");
  assert.equal(caps.lines[0].w.at(-1)[1], 1.2, "a multi-word spoken token starts at its first word");
  assert.equal(caps.lines[0].end, 1.9, "a line ends where the next one's first word starts");
});

test("align-captions: a VO that does not match the script reports MISMATCH and fails", () => {
  const tokens = write("t2.json", JSON.stringify({ lines: [{ id: "l1", tokens: ["price", "rises"] }] }));
  const words = write(
    "w2.json",
    JSON.stringify([{ text: "Completely", start: 0, end: 0.4 }, { text: "different", start: 0.4, end: 0.9 }]),
  );
  const r = run("align-captions.mjs", "--tokens", tokens, "--words", words, "--out", out("c2.json"));
  assert.equal(r.status, 1, "captions must never be trusted with unresolved mismatches");
  assert.match(r.stderr, /MISMATCH/);
});

// KNOWN, not asserted: align-captions.mjs:124 throws on a line with an empty tokens[], and emits
// `end: null` when the last word has no `end`. The file is vendored unmodified from hyperframes
// (see CREDITS.md), so the fix belongs upstream or in a call-site guard — not pinned here.

// ── build-lesson-page ─────────────────────────────────────────────────────────────────────────────

const manifest = (segments) => write(`m${Math.random().toString(36).slice(2)}.json`, JSON.stringify({ title: "t", segments }));

test("build-lesson-page: a manifest the player cannot use is refused", () => {
  assert.equal(run("build-lesson-page.mjs", manifest([])).status, 2);

  const noDur = manifest([{ id: "01", title: "t", mp4: "a.mp4" }]);
  const r = run("build-lesson-page.mjs", noDur);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /missing "duration"/);

  const noSource = manifest([
    { id: "01", title: "t", mp4: "a.mp4", duration: 60,
      checkpoint: { prompt: "q", options: ["a", "b"], answer: 0 } },
  ]);
  const r2 = run("build-lesson-page.mjs", noSource);
  assert.equal(r2.status, 2);
  assert.match(r2.stderr, /no source ids/);
});

// Step 5 is not built yet. This asserts the stub stays honest; when the player lands it will fail
// and this test should become an assertion about the generated lesson.html.
test("build-lesson-page: step 5 is still a declared stub", () => {
  const ok = manifest([{ id: "01", title: "t", mp4: "a.mp4", duration: 60 }]);
  const r = run("build-lesson-page.mjs", ok);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /TODO — player assets not written yet/);
});

// ── manim-render ──────────────────────────────────────────────────────────────────────────────────

test("manim-render: an incomplete Tier 2 toolchain exits 3 for the Tier 1 fallback", () => {
  const hasManim = spawnSync("manim", ["--version"], { stdio: "ignore" }).status === 0;
  if (hasManim) return "skipped — manim is installed";
  const r = run("manim-render.mjs", write("scene.py", "class S: pass"));
  assert.equal(r.status, 3, "a distinct code is what lets the caller route to Tier 1");
  assert.match(r.stderr, /Fall back to Tier 1/);
});

// ── run ───────────────────────────────────────────────────────────────────────────────────────────

let failed = 0;
let skipped = 0;
for (const [name, fn] of tests) {
  try {
    const note = fn();
    if (typeof note === "string") {
      skipped++;
      console.log(`  skip  ${name} (${note.replace(/^skipped — /, "")})`);
    } else {
      console.log(`  ok    ${name}`);
    }
  } catch (err) {
    failed++;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${String(err.message).split("\n").join("\n        ")}`);
  }
}
rmSync(tmp, { recursive: true, force: true });

const ran = tests.length - skipped;
console.log(`\nsmoke: ${ran - failed}/${ran} passed${skipped ? `, ${skipped} skipped` : ""}`);
process.exit(failed ? 1 : 0);
