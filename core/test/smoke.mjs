#!/usr/bin/env node
// smoke.mjs — the regression gate for chalk-core's scripts and its CLI.
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
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scripts = join(root, "scripts");
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

// narrate.mjs exports its pure helpers; a missing file must fail its own tests, not the whole suite.
const narr = await import(pathToFileURL(join(scripts, "narrate.mjs")).href).catch(() => null);
const need = (m) => assert.ok(m, "scripts/narrate.mjs does not exist yet");

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

// Display maths in a Markdown/LaTeX source is exact, unlike a PDF's — so it is an `equation` block
// carrying its own LaTeX, not a `para` that step 3 has to re-sniff to route a tier.
test("ingest: display maths in Markdown becomes an equation block, with its LaTeX kept", () => {
  const md = write(
    "display.md",
    "# Rates\n\nThe ratio we are after is written thus:\n\n" +
      "$$\\frac{dy}{dx} = \\frac{1}{1.73}.$$\n\n" +
      "\\[ E = mc^2 \\]\n\n" +
      "Let $x$ be the base and $y$ the height of the triangle we started from.\n",
  );
  const r = run("ingest.mjs", md, "--out", out("display.json"));
  assert.equal(r.status, 0, r.stderr);
  const ch = JSON.parse(readFileSync(out("display.json"), "utf8"));

  const eqs = ch.blocks.filter((b) => b.kind === "equation");
  assert.equal(eqs.length, 2, `both display blocks must register as equations, got ${eqs.length}`);
  assert.ok(eqs.every((e) => /^e\d{3}$/.test(e.id)), "an equation block takes the e-prefixed id");
  // The delimiters are stripped off `latex` so it can go straight to KaTeX; `text` stays verbatim.
  assert.equal(eqs[0].latex, "\\frac{dy}{dx} = \\frac{1}{1.73}.");
  assert.ok(eqs[0].text.startsWith("$$"), "text keeps the source form, delimiters and all");
  assert.equal(eqs[1].latex, "E = mc^2");

  // Exact source notation is not shaky notation: it must not drag the chapter to needs-review.
  assert.equal(ch.quality, "clean");
  assert.ok(!eqs.some((e) => e.confidence === "low"), "LaTeX source is read cleanly, not guessed at");

  // A sentence that merely mentions $x$ is still prose.
  const prose = ch.blocks.find((b) => /base and/.test(b.text));
  assert.equal(prose.kind, "para", "inline maths inside a sentence does not make it an equation");
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

// ── ingest: code ──────────────────────────────────────────────────────────────────────────────────

const CODE_MD = [
  "# Spread", "",
  "The variance tells two lists with one mean apart.", "",
  "```python", "def variance(xs):", "    m = sum(xs) / len(xs)", "", "    return sum((x - m) ** 2 for x in xs) / len(xs)", "```", "",
  "Population versus sample is a choice.", "",
  "```javascript", "const mean = (xs) => 0;", "```", "",
  "Exercise 1. Write the standard deviation.",
].join("\n");

test("ingest: a fenced block is a code block, verbatim, with its language kept", () => {
  const r = run("ingest.mjs", write("code.md", CODE_MD), "--out", out("code.json"));
  assert.equal(r.status, 0, r.stderr);
  const ch = JSON.parse(readFileSync(out("code.json"), "utf8"));
  const code = ch.blocks.filter((b) => b.kind === "code");
  assert.equal(code.length, 2);
  assert.equal(code[0].lang, "python");
  assert.equal(code[1].lang, "javascript");
  // Indentation is meaning in Python, and a blank line inside the fence must not split the block.
  assert.equal(
    code[0].text,
    "def variance(xs):\n    m = sum(xs) / len(xs)\n\n    return sum((x - m) ** 2 for x in xs) / len(xs)",
  );
  assert.ok(code.every((b) => /^c\d{3}$/.test(b.id)), "code blocks get c-prefixed ids");
  assert.equal(ch.has_code, true);
  assert.match(r.stdout, /2 code block\(s\)/);
});

test("ingest: prose around a fence still becomes paragraphs, and an Exercise becomes an exercise", () => {
  run("ingest.mjs", write("code2.md", CODE_MD), "--out", out("code2.json"));
  const kinds = JSON.parse(readFileSync(out("code2.json"), "utf8")).blocks.map((b) => b.kind);
  assert.deepEqual(kinds, ["heading", "para", "code", "para", "code", "exercise"]);
});

test("ingest: an unclosed fence is still code rather than lost text", () => {
  const r = run("ingest.mjs", write("open.md", "Before.\n\n```python\nx = 1\ny = 2\n"), "--out", out("open.json"));
  assert.equal(r.status, 0, r.stderr);
  const ch = JSON.parse(readFileSync(out("open.json"), "utf8"));
  assert.equal(ch.blocks.at(-1).kind, "code");
  assert.equal(ch.blocks.at(-1).text, "x = 1\ny = 2");
});

test("ingest: a chapter without code has has_code false and no notebook hint", () => {
  const r = run("ingest.mjs", fixture("gutenberg-chapter.md"), "--out", out("nocode.json"));
  assert.equal(JSON.parse(readFileSync(out("nocode.json"), "utf8")).has_code, false);
  assert.ok(!/code block/.test(r.stdout));
});

// ── ingest: EPUB ──────────────────────────────────────────────────────────────────────────────────

const epub = () => fixture("gutenberg-two-chapters.epub");
const textPdf = () => fixture("gutenberg-chapters.pdf");
const scannedPdf = () => fixture("gutenberg-scanned.pdf");

test("ingest: an EPUB lists its chapters from the nav", () => {
  const r = run("ingest.mjs", epub(), "--list");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /1\s+A Candle: the Flame/);
  assert.match(r.stdout, /2\s+On Relative Growings/);
});

// A whole book with no chapter named is a question, not a guess.
test("ingest: a multi-chapter book with no --chapter shows the splits and stops", () => {
  const r = run("ingest.mjs", epub(), "--out", out("e.json"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /none was named/);
  assert.match(r.stderr, /On Relative Growings/);
});

test("ingest: an EPUB chapter extracts by number and by title", () => {
  const byNumber = run("ingest.mjs", epub(), "--chapter", "1", "--out", out("e1.json"));
  assert.equal(byNumber.status, 0, byNumber.stderr);
  const ch = JSON.parse(readFileSync(out("e1.json"), "utf8"));
  assert.equal(ch.title, "A Candle: the Flame");
  assert.equal(ch.lang, "en");
  assert.match(ch.source, /#ch1\.xhtml$/);
  assert.equal(ch.blocks[0].kind, "heading");
  assert.ok(ch.blocks.length > 20);

  const byTitle = run("ingest.mjs", epub(), "--chapter", "Relative", "--out", out("e2.json"));
  assert.equal(byTitle.status, 0, byTitle.stderr);
  assert.equal(JSON.parse(readFileSync(out("e2.json"), "utf8")).title, "On Relative Growings");
});

test("ingest: an ambiguous chapter title is refused, not guessed at", () => {
  const r = run("ingest.mjs", epub(), "--chapter", "e", "--out", out("amb.json"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /matches 2 chapters/);
});

// Footnotes carry the caveat that matters, so they are their own blocks rather than dropped.
test("ingest: EPUB footnotes become their own blocks", () => {
  run("ingest.mjs", epub(), "--chapter", "1", "--out", out("e3.json"));
  const blocks = JSON.parse(readFileSync(out("e3.json"), "utf8")).blocks;
  const note = blocks.find((b) => b.kind === "footnote");
  assert.ok(note, "the footnote aside should survive as a block");
  assert.match(note.id, /^n\d{3}$/, "a footnote gets its own id prefix");
});

test("ingest: EPUB ids are stable across re-runs", () => {
  run("ingest.mjs", epub(), "--chapter", "1", "--out", out("s1.json"));
  run("ingest.mjs", epub(), "--chapter", "1", "--out", out("s2.json"));
  assert.equal(readFileSync(out("s1.json"), "utf8"), readFileSync(out("s2.json"), "utf8"));
});

// DRM is a stop, not a puzzle to solve.
test("ingest: a DRM-protected EPUB is refused without trying to get around it", () => {
  const drm = join(tmp, "drm.epub");
  spawnSync("cp", [epub(), drm]);
  const staging = join(tmp, "drmstage", "META-INF");
  mkdirSync(staging, { recursive: true });
  writeFileSync(join(staging, "encryption.xml"), "<encryption/>");
  const zipped = spawnSync("zip", ["-q", drm, "META-INF/encryption.xml"], { cwd: join(tmp, "drmstage") });
  if (zipped.status !== 0) return "zip is unavailable";
  const r = run("ingest.mjs", drm, "--chapter", "1", "--out", out("drm.json"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /DRM-protected/);
  assert.match(r.stderr, /will not try to get around that/);
});

// ── ingest: PDF ───────────────────────────────────────────────────────────────────────────────────

const havePoppler = spawnSync("pdftotext", ["-v"], { stdio: "ignore" }).error === undefined;

test("ingest: a PDF splits on chapter headings and carries page numbers", () => {
  if (!havePoppler) return "pdftotext is unavailable";
  const list = run("ingest.mjs", textPdf(), "--list");
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /1\s+p1\s+Chapter 1/);

  const r = run("ingest.mjs", textPdf(), "--chapter", "1", "--out", out("p1.json"), "--assets", join(tmp, "w1"));
  assert.equal(r.status, 0, r.stderr);
  const ch = JSON.parse(readFileSync(out("p1.json"), "utf8"));
  assert.ok(ch.blocks.every((b) => typeof b.page === "number"), "every PDF block records its page");
  assert.match(ch.source, /#p1$/);
});

// A running head repeated on every page is furniture; the same words inside Faraday's prose are not.
test("ingest: running heads and page numbers are stripped, prose is not", () => {
  if (!havePoppler) return "pdftotext is unavailable";
  run("ingest.mjs", textPdf(), "--chapter", "1", "--out", out("p2.json"), "--assets", join(tmp, "w2"));
  const blocks = JSON.parse(readFileSync(out("p2.json"), "utf8")).blocks;
  assert.ok(
    !blocks.some((b) => b.text.trim() === "The Chemical History of a Candle"),
    "the running head must not survive as its own block",
  );
  assert.ok(!blocks.some((b) => /^\d{1,3}$/.test(b.text.trim())), "bare page numbers must go");
  assert.ok(
    blocks.some((b) => /Chemical History of a Candle/.test(b.text) && b.text.length > 80),
    "the same phrase inside Faraday's own sentence must stay",
  );
});

// Under-detecting notation is the dangerous direction: it flows on as prose and gets retyped.
test("ingest: equations are flagged low-confidence and never retyped", () => {
  if (!havePoppler) return "pdftotext is unavailable";
  const r = run("ingest.mjs", textPdf(), "--chapter", "2", "--out", out("p3.json"), "--assets", join(tmp, "w3"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /confidence=low/);

  const ch = JSON.parse(readFileSync(out("p3.json"), "utf8"));
  assert.equal(ch.quality, "needs-review", "shaky notation drags the chapter down to needs-review");
  const eqs = ch.blocks.filter((b) => b.kind === "equation");
  assert.ok(eqs.length >= 3, `expected the three equations, got ${eqs.length}`);
  assert.ok(eqs.every((e) => e.latex === null), "notation is never reconstructed");
  assert.ok(eqs.every((e) => e.confidence === "low"));
  // x² uses U+00B2, outside the U+2070 superscript block — the case that used to slip through.
  assert.ok(eqs.some((e) => e.text.includes("x\u00b2")), "a Latin-1 superscript must still register");
});

test("ingest: prose that merely contains an = is not mistaken for notation", () => {
  if (!havePoppler) return "pdftotext is unavailable";
  run("ingest.mjs", textPdf(), "--chapter", "1", "--out", out("p4.json"), "--assets", join(tmp, "w4"));
  const ch = JSON.parse(readFileSync(out("p4.json"), "utf8"));
  const line = ch.blocks.find((b) => /starting value/.test(b.text));
  assert.ok(line, "the probe sentence should be in chapter 1");
  assert.equal(line.kind, "para", "a sentence with real words in it is prose, whatever maths it mentions");
});

test("ingest: a scanned PDF is detected and OCR'd, and says so", () => {
  const haveOcr = spawnSync("tesseract", ["--version"], { stdio: "ignore" }).error === undefined;
  if (!havePoppler || !haveOcr) return "tesseract or poppler is unavailable";
  const r = run("ingest.mjs", scannedPdf(), "--out", out("ocr.json"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /no text layer/);
  const ch = JSON.parse(readFileSync(out("ocr.json"), "utf8"));
  assert.equal(ch.quality, "ocr", "OCR output must be marked for a human skim");
  assert.ok(ch.blocks.length >= 2);
  assert.match(ch.blocks.map((b) => b.text).join(" "), /candle/i);
});

test("ingest: IO and flag errors are the script's own message, not a stack trace", () => {
  const missing = run("ingest.mjs", join(tmp, "no-such.md"), "--out", out("x.json"));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^ingest: cannot read /, "a raw node:fs trace is not a usable error");

  const noValue = run("ingest.mjs", fixture("gutenberg-chapter.md"), "--out");
  assert.equal(noValue.status, 2);
  assert.match(noValue.stderr, /--out needs a value/);

  const unwritable = run("ingest.mjs", fixture("gutenberg-chapter.md"), "--out", "/nope/deep/x.json");
  assert.equal(unwritable.status, 2);
  assert.match(unwritable.stderr, /cannot write/);
});

test("ingest: the input is found wherever it sits among the flags", () => {
  const r = run("ingest.mjs", "--out", out("after.json"), fixture("gutenberg-chapter.md"));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(readFileSync(out("after.json"), "utf8")).blocks.length > 20);
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

// The reading-time floor is a numeric comparison, so a NaN rate silently disabled it entirely:
// every `needed > duration` test against NaN is false.
test("check-readability: a rate or min with no value is refused, not read as NaN", () => {
  const p = write(
    "nan.md",
    scene(
      `- spoken: "As the price goes up, people buy a great deal less of the thing in question."\n` +
        `  display: "As the price goes up, people buy a great deal less of the thing in question."\n` +
        `  source: [p041]`,
      { duration: "~2s" },
    ),
  );
  assert.equal(run("check-readability.mjs", p).status, 1, "the fixture must fail on its own merits");

  const r = run("check-readability.mjs", p, "--rate");
  assert.equal(r.status, 2, "a missing rate must not turn the floor off");
  assert.match(r.stderr, /--rate needs a non-negative number/);
});

test("check-readability: an unreadable file reports itself rather than throwing", () => {
  const r = run("check-readability.mjs", join(tmp, "no-such.md"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^check-readability: cannot read /);
});

test("check-readability: prose sections and fenced examples are not read as scenes", () => {
  const notes = write(
    "notes.md",
    scene(`- spoken: "A claim."\n  display: "A claim."\n  source: [p1]`) +
      `\n## Notes for the reviewer\nNothing here is a scene.\n`,
  );
  assert.equal(run("check-readability.mjs", notes).status, 0, "a prose section is not a scene");

  const fenced = write(
    "fenced.md",
    scene(`- spoken: "A claim."\n  display: "A claim."\n  source: [p1]`) +
      "\n```markdown\n## Scene 9 — an example in the docs\nvisual: none\n```\n",
  );
  assert.equal(run("check-readability.mjs", fenced).status, 0, "a fenced example is not a scene");
});

// The leniency above must not swallow real work: an unfinished scene has no visual, duration or
// lines either, and that is exactly when it most needs to be reported.
test("check-readability: an empty Scene stub still fails", () => {
  const p = write("stub.md", `## Scene 5 — still to write\n\nnothing yet\n`);
  const r = run("check-readability.mjs", p);
  assert.equal(r.status, 1, "an unfinished scene must not vanish from the gate");
  assert.match(r.stderr, /names no visual/);
});

// The direct form of the migration assertion: read back the ids the parser resolved, rather than
// inferring them from which line got reported.
test("check-readability: --json reports the citation each line actually resolved to", () => {
  const p = write(
    "json.md",
    scene(
      `- spoken: "The candle burns because wax is drawn up the wick."\n` +
        `  display: "Wax is drawn up the wick."\n` +
        `  source: [p010]\n\n` +
        `- spoken: "Ninety-three percent of all candles are made of paraffin."\n` +
        `  source: [p999]`,
    ),
  );
  const r = run("check-readability.mjs", p, "--json");
  assert.equal(r.status, 0, r.stderr);
  const entries = JSON.parse(r.stdout).files[0].scenes[0].entries;
  assert.deepEqual(entries[0].source, ["p010"], "the wick line keeps its own citation");
  assert.equal(entries[0].display, "Wax is drawn up the wick.");
  assert.deepEqual(entries[1].source, ["p999"], "the paraffin line keeps its own citation");
  assert.equal(entries[1].display, null, "it has no display layer to steal a citation from");
});

// An example is the one place a script may show numbers the chapter did not print, so it is the one
// place the gate has to be strict about where they came from.
const exampleScene = (fields, display = "Two lists, one mean.", spoken = display) =>
  `## Scene 1 — worked example\nvisual: worked example (tier 1)\nduration: ~30s\n${fields}\n\n` +
  `- spoken: "${spoken}"\n  display: "${display}"\n  source: [p004]\n`;

test("check-readability: an example scene must say where its example came from", () => {
  const r = run("check-readability.mjs", write("ex-none.md", exampleScene("")));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /names no example source/);
});

test("check-readability: example: chapter passes, and an unknown value fails", () => {
  assert.equal(run("check-readability.mjs", write("ex-ch.md", exampleScene("example: chapter"))).status, 0);
  const bad = run("check-readability.mjs", write("ex-bad.md", exampleScene("example: probably")));
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /example: must be chapter or derived/);
});

test("check-readability: a derived example needs the script that computes it, and nothing on screen", () => {
  const noScript = run("check-readability.mjs", write("ex-d1.md", exampleScene("example: derived")));
  assert.equal(noScript.status, 1);
  assert.match(noScript.stderr, /derived example names no computed-by/);

  // The declaration is the record. The video itself carries no label: that lives in the logs.
  const ok = run("check-readability.mjs", write("ex-d3.md",
    exampleScene("example: derived\ncomputed-by: examples/spread.py", "Take the list four, five, six.")));
  assert.equal(ok.status, 0, ok.stderr);
});

test("check-readability: --json reports the example source the scene declared", () => {
  const r = run("check-readability.mjs", write("ex-j.md", exampleScene(
    "example: derived\ncomputed-by: examples/spread.py", "Two lists.")), "--json");
  const s = JSON.parse(r.stdout).files[0].scenes[0];
  assert.equal(s.example, "derived");
  assert.equal(s.computedBy, "examples/spread.py");
});

test("check-readability: a scene that is not an example is not asked for an example source", () => {
  assert.equal(run("check-readability.mjs", write("ex-plain.md", scene(
    `- spoken: "x"\n  display: "x"\n  source: [p001]`, { duration: "~5s" }))).status, 0);
});

// ── build-tokens ──────────────────────────────────────────────────────────────────────────────────

const LEXICON = JSON.stringify({
  terms: [
    { display: "dy/dx", spoken: "dee-wy by dee-eks", heard: "dy by dx" },
    { display: "x + dx", spoken: "x plus dee-eks", heard: "x plus dx" },
    { display: "30°", spoken: "thirty degrees", heard: "30 degrees" },
    { display: "dx", spoken: "dee-eks", heard: "dx" },
  ],
});

// The aligner must be matched against what the TRANSCRIPT returns, not what the voice was told to
// say. `hyperframes transcribe` renormalises speech back into notation, so the two differ for
// exactly the terms that needed respelling in the first place.
test("build-tokens: a term is paired with its heard form, not its spoken one", () => {
  const script = write(
    "bt-script.md",
    '## Scene 1 — a\nvisual: card (tier 1)\nduration: ~10s\n\n' +
      '- spoken: "The ratio dee-wy by dee-eks at thirty degrees."\n' +
      '  display: "The ratio dy/dx at 30°."\n' +
      "  source: [p001]\n",
  );
  const dest = out("bt.json");
  const r = run("build-tokens.mjs", script, write("bt-lex.json", LEXICON), dest);
  assert.equal(r.status, 0, r.stderr);

  const { lines } = JSON.parse(readFileSync(dest, "utf8"));
  assert.equal(lines.length, 1);
  const paired = lines[0].tokens.filter((t) => typeof t === "object");
  assert.deepEqual(
    paired.map((t) => [t.display, t.spoken]),
    [["dy/dx", "dy by dx"], ["30°.", "30 degrees"]],
    "each display token carries the HEARD form, and trailing punctuation rides on the display side",
  );
});

test("build-tokens: the longest display form wins, and a term never matches mid-word", () => {
  const script = write(
    "bt-script2.md",
    '## Scene 1 — a\nvisual: card (tier 1)\nduration: ~10s\n\n' +
      '- spoken: "x plus dee-eks is exactly that."\n' +
      '  display: "x + dx is exactly that."\n' +
      "  source: [p001]\n",
  );
  const dest = out("bt2.json");
  assert.equal(run("build-tokens.mjs", script, write("bt-lex2.json", LEXICON), dest).status, 0);
  const toks = JSON.parse(readFileSync(dest, "utf8")).lines[0].tokens;
  assert.equal(toks[0].display, "x + dx", '"x + dx" must beat the bare "x"');
  // "exactly" starts with a lexicon-ish letter run; it must survive as a plain word.
  assert.ok(toks.includes("exactly"), "a term must not match inside a longer word");
});

test("build-tokens: a malformed lexicon or script is reported, not half-written", () => {
  const good = write("bt-ok.md", '## Scene 1 — a\n- display: "hello"\n  source: [p001]\n');
  assert.equal(run("build-tokens.mjs", good, write("bt-bad.json", "{}"), out("x.json")).status, 2);
  assert.equal(run("build-tokens.mjs", good, write("bt-bad2.json", "not json"), out("x.json")).status, 2);
  // a script with no display layer has nothing to align
  const empty = write("bt-empty.md", "# notes\n\nnothing here.\n");
  assert.equal(run("build-tokens.mjs", empty, write("bt-lex3.json", LEXICON), out("x.json")).status, 2);
});

// ── emit-vtt ──────────────────────────────────────────────────────────────────────────────────────

test("emit-vtt: cues keep video time and the display layer", () => {
  const groups = write(
    "cg.json",
    JSON.stringify([
      { start: 0, end: 1.5, text: "Here is a right-angled triangle." },
      { start: 1.5, end: 3.25, text: "dy/dx at 30°." },
    ]),
  );
  const dest = out("seg.vtt");
  const r = run("emit-vtt.mjs", groups, dest);
  assert.equal(r.status, 0, r.stderr);
  const vtt = readFileSync(dest, "utf8");
  assert.ok(vtt.startsWith("WEBVTT\n"), "a VTT must open with its magic line");
  assert.match(vtt, /00:00:00\.000 --> 00:00:01\.500/);
  assert.match(vtt, /00:00:01\.500 --> 00:00:03\.250/);
  // the notation layer reaches the screen, never the phonetic spoken layer
  assert.match(vtt, /dy\/dx at 30°\./);
});

test("emit-vtt: a cue that does not advance is refused", () => {
  const bad = write("cg-bad.json", JSON.stringify([{ start: 2, end: 2, text: "flash" }]));
  const r = run("emit-vtt.mjs", bad, out("bad.vtt"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /does not advance/);

  const rev = write("cg-rev.json", JSON.stringify([{ start: 3, end: 1, text: "backwards" }]));
  assert.equal(run("emit-vtt.mjs", rev, out("rev.vtt")).status, 2);
  assert.equal(run("emit-vtt.mjs", write("cg-none.json", "[]"), out("none.vtt")).status, 2);
});

// ── fix-ground ────────────────────────────────────────────────────────────────────────────────────

// assemble-index and captions.mjs read the SAME `canvas` role and want opposite values: the video
// ground must be dark, the caption pill's text must not be. frame.md keeps the light canvas so
// captions stay legible, and the ground is corrected afterwards.
test("fix-index: the ground is repainted and CDN gsap is localised, idempotently", () => {
  const page = write(
    "idx.html",
    '<html><head><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>' +
      "<style>\n  #root {\n    inset: 0;\n    background: #F0ECE5;\n  }\n</style></head></html>",
  );
  const r = run("fix-index.mjs", page);
  assert.equal(r.status, 0, r.stderr);
  const fixed = readFileSync(page, "utf8");
  assert.match(fixed, /#root\s*\{[^}]*background:\s*#111111/, "the ground must be repainted dark");
  // Without gsap, gsap.timeline is undefined and every frame's script throws — the whole video
  // renders static. It must not depend on a CDN at render time.
  assert.doesNotMatch(fixed, /cdn\.jsdelivr|unpkg|cdnjs/, "no CDN reference may survive");
  assert.match(fixed, /src="assets\/gsap\.min\.js"/, "gsap comes from the staged local file");

  const again = run("fix-index.mjs", page);
  assert.equal(again.status, 0, "running it twice must be safe");
  assert.match(again.stdout, /already/);
  assert.equal(readFileSync(page, "utf8"), fixed, "a second pass changes nothing");
});

// The caption rail sits beside the index, is regenerated just as often, and carries the same CDN
// gsap reference — so it has to be corrected in the same pass or it silently stays remote.
test("fix-index: the caption rail beside the index is localised too", () => {
  const dir = join(tmp, "railproj");
  mkdirSync(join(dir, "compositions"), { recursive: true });
  const page = join(dir, "index.html");
  writeFileSync(page, "<html><head><style>#root { background: #F0ECE5; }</style></head></html>");
  const rail = join(dir, "compositions", "captions.html");
  writeFileSync(rail, '<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>');

  const r = run("fix-index.mjs", page);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(readFileSync(rail, "utf8"), /cdn\.jsdelivr/, "the rail must not stay remote");
  assert.match(readFileSync(rail, "utf8"), /src="assets\/gsap\.min\.js"/);
  assert.match(r.stdout, /caption rail/);
});

test("fix-index: a page with no ground rule fails loudly rather than silently", () => {
  const page = write("idx-bare.html", "<html><head><style>body { margin: 0 }</style></head></html>");
  const r = run("fix-index.mjs", page);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no .*background.* rule|crossfade/i);
  assert.equal(run("fix-index.mjs", write("idx2.html", "<style>#root{background:#fff}</style>"), "--color", "nope").status, 2);
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

// whisper renders a standalone single letter as "X"/"Y" and GLUES it to the following word
// ("Yand", "Xare", "Xplus"). One stream word then spans two display tokens. Letting the first
// token swallow the whole glued word desynchronised every token after it — and a maths chapter is
// nothing but single-letter variables, so this is the common case, not an edge one.
test("align-captions: one glued spoken word can cover several display tokens", () => {
  const tokens = write(
    "glued-tokens.json",
    JSON.stringify({
      lines: [
        { id: "l1", tokens: ["when", "y", "and", "x", "are", "related"] },
      ],
    }),
  );
  const words = write(
    "glued-words.json",
    JSON.stringify([
      { text: "when", start: 0.0, end: 0.3 },
      { text: "Yand", start: 0.4, end: 0.9 },
      { text: "Xare", start: 1.0, end: 1.5 },
      { text: "related", start: 1.6, end: 2.1 },
    ]),
  );
  const dest = out("glued.json");
  const r = run("align-captions.mjs", "--tokens", tokens, "--words", words, "--out", dest);
  assert.equal(r.status, 0, `glued words must align cleanly:\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /MISMATCH/);

  const w = JSON.parse(readFileSync(dest, "utf8")).lines[0].w;
  assert.equal(w.length, 6, "every display token must still get a time");
  assert.deepEqual(w.map((x) => x[0]), ["when", "y", "and", "x", "are", "related"]);
  // The two tokens inside one glued word share that word's start; the line keeps moving forward.
  assert.equal(w[1][1], 0.4, "y takes Yand's start");
  assert.equal(w[2][1], 0.4, "and is inside the same spoken word, so it shares that start");
  assert.equal(w[3][1], 1.0, "x takes Xare's start");
  assert.equal(w[4][1], 1.0, "are shares it");
  assert.equal(w[5][1], 1.6, "the next real word resyncs");
});

// whisper digitises number words unpredictably — "one" comes back as "1" in one sentence and as
// "one" in the next. A maths chapter says small numbers constantly, so both spellings must match.
test("align-captions: a number word and its digit are the same word", () => {
  const tokens = write(
    "num-tokens.json",
    JSON.stringify({ lines: [{ id: "l1", tokens: ["One", "whole", "inch", "and", "3", "more"] }] }),
  );
  const words = write(
    "num-words.json",
    JSON.stringify([
      { text: "1", start: 0.0, end: 0.3 },
      { text: "whole", start: 0.3, end: 0.6 },
      { text: "inch", start: 0.6, end: 0.9 },
      { text: "and", start: 0.9, end: 1.1 },
      { text: "three", start: 1.1, end: 1.4 },
      { text: "more", start: 1.4, end: 1.7 },
    ]),
  );
  const dest = out("num.json");
  const r = run("align-captions.mjs", "--tokens", tokens, "--words", words, "--out", dest);
  assert.equal(r.status, 0, `number words must align to digits:\n${r.stderr}`);
  assert.doesNotMatch(r.stderr, /MISMATCH/);
  const w = JSON.parse(readFileSync(dest, "utf8")).lines[0].w;
  assert.equal(w[0][1], 0.0, '"One" matches the heard "1"');
  assert.equal(w[4][1], 1.1, '"3" matches the heard "three"');
});

// The same VO returns "100,000" in one sentence and "a hundred thousand" in the next, and reads 217 as
// "two seventeen". A numeral token must take the run of number words that says it.
test("align-captions: a numeral matches the number words that say it", () => {
  const tokens = write(
    "numw-tokens.json",
    JSON.stringify({ lines: [{ id: "l1", tokens: ["Up", "to", "100,000", "values,", "LeetCode", "217.", "Yes,", "two."] }] }),
  );
  const words = write(
    "numw-words.json",
    JSON.stringify([
      { text: "Up", start: 0.0, end: 0.2 },
      { text: "to", start: 0.2, end: 0.4 },
      { text: "a", start: 0.4, end: 0.5 },
      { text: "hundred", start: 0.5, end: 0.8 },
      { text: "thousand", start: 0.8, end: 1.1 },
      { text: "values,", start: 1.1, end: 1.5 },
      { text: "LeetCode", start: 1.5, end: 1.9 },
      { text: "two", start: 1.9, end: 2.1 },
      { text: "seventeen.", start: 2.1, end: 2.6 },
      { text: "Yes,", start: 2.6, end: 2.9 },
      { text: "too.", start: 2.9, end: 3.2 },
    ]),
  );
  const dest = out("numw.json");
  const r = run("align-captions.mjs", "--tokens", tokens, "--words", words, "--out", dest);
  assert.equal(r.status, 0, `spoken numbers must align to numerals:\n${r.stderr}`);
  const w = JSON.parse(readFileSync(dest, "utf8")).lines[0].w;
  assert.equal(w[2][1], 0.4, '"100,000" starts at the heard "a"');
  assert.equal(w[3][1], 1.1, "the word after the number resyncs");
  assert.equal(w[5][1], 1.9, '"217" matches "two seventeen"');
  assert.equal(w[7][1], 2.9, '"two" matches the heard "too"');
});

test("align-captions: tens, plural numerals and homophones match what was said", () => {
  const tokens = write(
    "homo-tokens.json",
    JSON.stringify({ lines: [{ id: "l1", tokens: ["about", "thirty", "seconds.", "The", "two", "1s", "in", "seen", "queue.", { display: "seen-set", spoken: "scene set" }] }] }),
  );
  const words = write(
    "homo-words.json",
    JSON.stringify([
      { text: "about", start: 0.0, end: 0.3 },
      { text: "30", start: 0.3, end: 0.6 },
      { text: "seconds.", start: 0.6, end: 1.0 },
      { text: "The", start: 1.0, end: 1.1 },
      { text: "two", start: 1.1, end: 1.3 },
      { text: "ones", start: 1.3, end: 1.6 },
      { text: "in", start: 1.6, end: 1.7 },
      { text: "scene", start: 1.7, end: 2.0 },
      { text: "cue.", start: 2.0, end: 2.4 },
      { text: "seen", start: 2.4, end: 2.6 },
      { text: "set", start: 2.6, end: 2.8 },
    ]),
  );
  const dest = out("homo.json");
  const r = run("align-captions.mjs", "--tokens", tokens, "--words", words, "--out", dest);
  assert.equal(r.status, 0, `misheard spellings must still align:\n${r.stderr}`);
  const w = JSON.parse(readFileSync(dest, "utf8")).lines[0].w;
  assert.equal(w[1][1], 0.3, '"thirty" matches the heard "30"');
  assert.equal(w[5][1], 1.3, '"1s" matches the heard "ones"');
  assert.equal(w[7][1], 1.7, '"seen" matches the heard "scene"');
  assert.equal(w[8][1], 2.0, '"queue" matches the heard "cue"');
  assert.equal(w[9][1], 2.4, 'a lexicon spoken form ("scene set") is normalised word by word');
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

// Both of these are LOCAL FIXes to the vendored file, recorded in CREDITS.md. They should go
// upstream; until they do, these two cases are what stops them regressing on a re-vendor.
test("align-captions: a line with no tokens does not throw", () => {
  const tokens = write(
    "t3.json",
    JSON.stringify({
      lines: [
        { id: "l1", tokens: ["hello"] },
        { id: "l2", tokens: [] },
        { id: "l3", tokens: ["world"] },
      ],
    }),
  );
  const words = write(
    "w3.json",
    JSON.stringify([
      { text: "hello", start: 0.0, end: 0.5 },
      { text: "world", start: 0.6, end: 1.0 },
    ]),
  );
  const r = run("align-captions.mjs", "--tokens", tokens, "--words", words, "--out", out("c3.json"));
  assert.equal(r.status, 0, r.stderr);
  const caps = JSON.parse(readFileSync(out("c3.json"), "utf8"));
  assert.deepEqual(caps.lines[1].w, [], "the empty line stays empty");
  assert.equal(caps.lines[0].end, 0.6, "its end skips forward to the next line that has a word");
  assert.ok(caps.lines.every((l) => typeof l.end === "number"));
});

test("align-captions: a final word with no end still yields a numeric line end", () => {
  const tokens = write("t4.json", JSON.stringify({ lines: [{ id: "l1", tokens: ["hello"] }] }));
  const words = write("w4.json", JSON.stringify([{ text: "hello", start: 0.0 }]));
  const r = run("align-captions.mjs", "--tokens", tokens, "--words", words, "--out", out("c4.json"));
  assert.equal(r.status, 0, r.stderr);
  const caps = JSON.parse(readFileSync(out("c4.json"), "utf8"));
  assert.equal(typeof caps.lines[0].end, "number", "NaN serialises to null and loses the end time");
});

// ── apply-display ─────────────────────────────────────────────────────────────────────────────────

// captions.mjs reads voices[].words, so the display layer only reaches the screen if the aligned
// display tokens are written back there. A frame is a script scene; a scene may hold several entries.
const adScript = [
  "## Scene 1 — a", "visual: definition card (tier 1)", "duration: ~5s", "",
  '- spoken: "One two."', '  display: "One two."', "  source: [p001]", "",
  "## Scene 2 — b", "visual: definition card (tier 1)", "duration: ~5s", "",
  '- spoken: "Three."', '  display: "Three."', "  source: [p002]", "",
  '- spoken: "Four five."', '  display: "Four five."', "  source: [p003]", "",
].join("\n");
const adMeta = () => ({
  bgm: null, sfx: [],
  voices: [
    { frame: 1, path: "a.wav", duration_s: 2, words: [{ id: "w0", text: "wun", start: 0.1, end: 0.5 }, { id: "w1", text: "too", start: 0.6, end: 1.0 }] },
    { frame: 2, path: "b.wav", duration_s: 3, words: [
      { id: "w0", text: "free", start: 0.1, end: 0.5 }, { id: "w1", text: "for", start: 1.0, end: 1.4 }, { id: "w2", text: "five", start: 1.5, end: 2.0 } ] },
  ],
});
// absolute times: frame 2 starts at 2s
const adCaptions = {
  lines: [
    { id: "l001", end: 2, w: [["One", 0.1], ["two.", 0.6]] },
    { id: "l002", end: 3, w: [["Three.", 2.1]] },
    { id: "l003", end: 5, w: [["Four", 3.0], ["five.", 3.5]] },
  ],
};

function adSetup(name, meta = adMeta(), captions = adCaptions) {
  const dir = join(tmp, name);
  mkdirSync(dir, { recursive: true });
  const s = join(dir, "script.md"), c = join(dir, "captions.json"), m = join(dir, "audio_meta.json");
  writeFileSync(s, adScript); writeFileSync(c, JSON.stringify(captions)); writeFileSync(m, JSON.stringify(meta));
  return { s, c, m, dir };
}

test("apply-display: aligned display tokens replace each frame's transcript words, frame-relative", () => {
  const { s, c, m } = adSetup("ad1");
  const r = run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  assert.equal(r.status, 0, r.stderr);
  const meta = JSON.parse(readFileSync(m, "utf8"));
  assert.deepEqual(meta.voices[0].words.map((w) => w.text), ["One", "two."]);
  assert.deepEqual(meta.voices[1].words.map((w) => w.text), ["Three.", "Four", "five."]);
  // frame 2 starts at 2s, so an absolute 2.1 is 0.1 into the frame
  assert.deepEqual(meta.voices[1].words.map((w) => w.start), [0.1, 1.0, 1.5]);
  assert.equal(meta.voices[0].words[0].id, "w0");
});

test("apply-display: each word ends where the next begins, and the last where the voice did", () => {
  const { s, c, m } = adSetup("ad2");
  run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  const w = JSON.parse(readFileSync(m, "utf8")).voices[1].words;
  assert.equal(w[0].end, w[1].start);
  assert.equal(w[2].end, 2.0, "the last display word keeps the transcript's own last end");
});

test("apply-display: the original transcript is kept, and re-running starts from it", () => {
  const { s, c, m, dir } = adSetup("ad3");
  run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  const bak = join(dir, "audio_meta.transcript.json");
  assert.ok(existsSync(bak), "the raw transcript is backed up beside the meta");
  assert.equal(JSON.parse(readFileSync(bak, "utf8")).voices[0].words[0].text, "wun");
  const once = readFileSync(m, "utf8");
  run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  assert.equal(readFileSync(m, "utf8"), once, "running it twice must not compound");
});

// REGRESSION — re-generating the VO writes a fresh raw audio_meta.json. If the backup of the previous
// transcript were trusted, the new voice would be silently replaced by the old one's words.
test("apply-display: a regenerated transcript replaces the backup instead of being ignored", () => {
  const { s, c, m, dir } = adSetup("ad7");
  run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  const fresh = adMeta();
  fresh.voices[0].words[0].text = "newtake";
  writeFileSync(m, JSON.stringify(fresh));
  const r = run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, "audio_meta.transcript.json"), "utf8")).voices[0].words[0].text, "newtake");
});

// Two display tokens can share one misheard spoken word ("evals" heard as "a vows"), and the aligner can
// then hand them times a millisecond apart in the wrong order. A caption cannot show a word before the
// one that precedes it, so the order is enforced here rather than hoped for.
test("apply-display: word starts never go backwards, even if the alignment did", () => {
  const caps = { lines: [
    { id: "l001", end: 2, w: [["One", 0.5], ["two.", 0.499]] },
    { id: "l002", end: 3, w: [["Three.", 2.1]] },
    { id: "l003", end: 5, w: [["Four", 3.0], ["five.", 3.5]] },
  ] };
  const { s, c, m } = adSetup("ad8", adMeta(), caps);
  assert.equal(run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m).status, 0);
  const w = JSON.parse(readFileSync(m, "utf8")).voices[0].words;
  assert.ok(w[1].start >= w[0].start, `${w[0].start} then ${w[1].start}`);
  assert.ok(w.every((x) => x.end > x.start), "and every word still has a positive length");
});

// REGRESSION — the recognizer heard "tiers." as "tears.", the aligner skipped it, and "Higher tiers are" came out
// on one timestamp: a zero-length caption, with no MISMATCH printed. Three words on one start is never right.
test("apply-display: three words squeezed onto one start time are refused, and nothing is rewritten", () => {
  const caps = { lines: [
    { id: "l001", end: 2, w: [["One", 0.5], ["two.", 0.5]] },
    { id: "l002", end: 3, w: [["Three.", 2.1]] },
    { id: "l003", end: 5, w: [["Four", 3.5], ["five.", 3.5]] },
  ] };
  // frame 2's three words land together
  const bad = { lines: [caps.lines[0], { id: "l002", end: 3, w: [["Three.", 2.1]] }, { id: "l003", end: 5, w: [["Four", 2.1], ["five.", 2.1]] }] };
  const { s, c, m } = adSetup("ad9", adMeta(), bad);
  const before = readFileSync(m, "utf8");
  const r = run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /share one start time/);
  assert.match(r.stderr, /Three\. Four five\./);
  assert.equal(readFileSync(m, "utf8"), before, "a refusal must not rewrite the meta");
  // two words together is a clamp, not a collapse
  const ok = adSetup("ad10", adMeta(), caps);
  assert.equal(run("apply-display.mjs", "--script", ok.s, "--captions", ok.c, "--audio-meta", ok.m).status, 0);
});

test("apply-display: a script and captions that disagree about the entries are refused", () => {
  const bad = { lines: adCaptions.lines.slice(0, 2) };
  const { s, c, m } = adSetup("ad4", adMeta(), bad);
  const before = readFileSync(m, "utf8");
  const r = run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /3 spoken entr(y|ies) in the script but 2 caption line/);
  assert.equal(readFileSync(m, "utf8"), before, "nothing is rewritten on a refusal");
});

test("apply-display: more scenes than voiced frames is refused", () => {
  const meta = adMeta();
  meta.voices.pop();
  const { s, c, m } = adSetup("ad5", meta);
  const r = run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", m);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /2 scenes but 1 voiced frame/);
});

test("apply-display: missing flags and unreadable files are reported", () => {
  assert.equal(run("apply-display.mjs").status, 2);
  const { s, c } = adSetup("ad6");
  const r = run("apply-display.mjs", "--script", s, "--captions", c, "--audio-meta", join(tmp, "nope.json"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read/);
});

// ── narrate ───────────────────────────────────────────────────────────────────────────────────────
// Kokoro's own sentence_pause did nothing in testing (0.25 and 0.55 gave identical audio), so pauses are made
// here: each sentence is synthesized alone and silence is inserted between them, which also makes them variable.

test("narrate: markers are stripped from spoken text, leaving clean words", () => {
  need(narr);
  assert.equal(narr.stripMarkers("So which one? {beat} It depends. {pause} Start small."), "So which one? It depends. Start small.");
  assert.equal(narr.stripMarkers("No markers here."), "No markers here.");
  assert.equal(narr.stripMarkers("First {beat}second"), "First second");
  assert.equal(narr.stripMarkers("Why? {think} Because."), "Why? Because.");
});

test("narrate: --lexicon respells display-form terms in the spoken text, whole words only", () => {
  need(narr);
  const terms = [
    { display: "dict", spoken: "dikt" },
    { display: "SQL", spoken: "S Q L" },
    { display: "O(n)", spoken: "oh of n" },
    { display: "set", spoken: "set" },
  ];
  assert.equal(narr.applyLexicon("Use a dict, then SQL. That's O(n).", terms), "Use a dikt, then S Q L. That's oh of n.");
  assert.equal(narr.applyLexicon("A dictionary and MySQL stay as they are.", terms), "A dictionary and MySQL stay as they are.");
  assert.equal(narr.applyLexicon("No terms here.", []), "No terms here.");
});

// A viewer answering a question for themselves needs seconds, not a breath.
test("narrate: {think} is a long silence, longer than a pause", () => {
  need(narr);
  const p = narr.splitSpoken("Name two ways. {think} Why put it last? {think} Because.");
  assert.deepEqual(p.map((x) => x.gap), ["think", "think", null]);
  const o = { sentence: 0.4, question: 0.7, beat: 0.5, pause: 1.0, think: 2.5, jitter: 0.2 };
  assert.ok(narr.gapSeconds("think", "x", o) > narr.gapSeconds("pause", "x", o) * 1.5);
  assert.ok(narr.gapSeconds("think", "x", o) >= 2.5 * 0.8);
});

test("narrate: text splits into sentences, each saying how long to wait after it", () => {
  need(narr);
  const p = narr.splitSpoken("So which one? It depends. Start small. {pause} Then measure.");
  assert.deepEqual(p.map((x) => x.text), ["So which one?", "It depends.", "Start small.", "Then measure."]);
  assert.deepEqual(p.map((x) => x.gap), ["question", "sentence", "pause", null]);
});

test("narrate: an explicit marker replaces the natural gap, and a trailing marker is ignored", () => {
  need(narr);
  const p = narr.splitSpoken("Ready? {beat} Here it is. {pause}");
  assert.deepEqual(p.map((x) => x.gap), ["beat", null]);
  const mid = narr.splitSpoken("First {beat} second.");
  assert.deepEqual(mid.map((x) => x.text), ["First", "second."]);
  assert.deepEqual(mid.map((x) => x.gap), ["beat", null]);
});

test("narrate: a gap's length is deterministic, varied, and within its jitter", () => {
  need(narr);
  const o = { sentence: 0.4, question: 0.7, beat: 0.5, pause: 1.0, think: 2.5, jitter: 0.2 };
  assert.equal(narr.gapSeconds("sentence", "f1-0", o), narr.gapSeconds("sentence", "f1-0", o), "same key, same gap");
  const gaps = ["a", "b", "c", "d", "e", "f"].map((k) => narr.gapSeconds("sentence", k, o));
  assert.ok(new Set(gaps).size > 1, "different places must not all pause the same length");
  for (const g of gaps) assert.ok(g >= 0.4 * 0.8 - 1e-9 && g <= 0.4 * 1.2 + 1e-9, `${g} is outside ±20% of 0.4`);
  assert.ok(narr.gapSeconds("pause", "x", o) > narr.gapSeconds("beat", "x", o), "a pause is longer than a beat");
  assert.equal(narr.gapSeconds(null, "x", o), 0);
});

test("narrate: a SCRIPT.md gives one narration block per frame, markers kept", () => {
  need(narr);
  const md = "# S\n\n## Line 1 — a (Frame 1)\n\n**Delivery:** x\n\n    Hello there. {beat} Welcome.\n\n## Line 2 — b (Frame 2)\n\n    Second frame.\n";
  assert.deepEqual(narr.parseScript(md), [{ frame: 1, text: "Hello there. {beat} Welcome." }, { frame: 2, text: "Second frame." }]);
});

const pyKokoro = join(root, ".venv/bin/python");
const haveKokoro = existsSync(pyKokoro) &&
  spawnSync(pyKokoro, ["-c", "import kokoro_onnx,soundfile"], { stdio: "ignore" }).status === 0 &&
  existsSync(join(process.env.HOME ?? "", ".cache/hyperframes/tts/models/kokoro-v1.0.onnx"));

const wavSeconds = (f) =>
  Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim());

function narrateRun(name, text, ...extra) {
  const dir = join(tmp, name);
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "SCRIPT.md");
  writeFileSync(script, `# S\n\n## Line 1 — a (Frame 1)\n\n    ${text}\n`);
  const r = spawnSync(process.execPath, [join(scripts, "narrate.mjs"), "--script", script, "--out", dir, "--no-transcribe",
    "--python", pyKokoro, ...extra], { encoding: "utf8" });
  return { r, dir };
}

test("narrate: a {pause} makes the take longer by about that much, and the meta says so", () => {
  if (!haveKokoro) return "kokoro is not installed here";
  need(narr);
  const a = narrateRun("nar1", "Which model do you pick? It depends.", "--voice", "af_heart");
  assert.equal(a.r.status, 0, a.r.stderr);
  const b = narrateRun("nar2", "Which model do you pick? {pause} It depends.", "--voice", "af_heart");
  assert.equal(b.r.status, 0, b.r.stderr);
  const da = wavSeconds(join(a.dir, "assets/voice/01.wav")), db = wavSeconds(join(b.dir, "assets/voice/01.wav"));
  assert.ok(db - da > 0.25, `a {pause} should add at least ~0.3s over the natural gap (${da.toFixed(2)}s vs ${db.toFixed(2)}s)`);
  const meta = JSON.parse(readFileSync(join(b.dir, "audio_meta.json"), "utf8"));
  assert.equal(meta.voices.length, 1);
  assert.equal(meta.voices[0].frame, 1);
  assert.equal(meta.voices[0].path, "assets/voice/01.wav");
  assert.ok(Math.abs(meta.voices[0].duration_s - db) < 0.05, "audio_meta duration must equal the file's");
  assert.deepEqual(Object.keys(meta).sort(), ["bgm", "bgm_pending", "sfx", "voices"]);
});

test("narrate: the engine meta carries the voice id, and markers never reach the transcript text", () => {
  if (!haveKokoro) return "kokoro is not installed here";
  need(narr);
  const { r, dir } = narrateRun("nar3", "Ready? {beat} Here it is.", "--voice", "af_bella");
  assert.equal(r.status, 0, r.stderr);
  const eng = JSON.parse(readFileSync(join(dir, "audio_engine_meta.json"), "utf8"));
  assert.equal(eng.tts_provider, "kokoro");
  assert.equal(eng.voice_id, "af_bella");
  assert.ok(!/\{beat\}|\{pause\}/.test(readFileSync(join(dir, "audio_meta.json"), "utf8")));
});

test("narrate: missing flags, a missing script and an unknown voice are reported", () => {
  need(narr);
  assert.equal(run("narrate.mjs").status, 2);
  assert.equal(run("narrate.mjs", "--script", join(tmp, "nope.md"), "--out", tmp, "--no-transcribe").status, 2);
  if (!haveKokoro) return "kokoro is not installed here, so the voice check cannot run";
  const { r } = narrateRun("nar4", "Hello there.", "--voice", "not_a_voice");
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not_a_voice/);
});

// ── check-readability: code is built, not dumped ──────────────────────────────────────────────────

const codeChapter = () =>
  write(
    "code-chapter.json",
    JSON.stringify({
      blocks: [
        { id: "p001", kind: "para", text: "Keep a running total." },
        { id: "c001", kind: "code", lang: "python", text: "def total(nums):\n    s = 0\n\n    for x in nums:\n        s += x\n    return s" },
      ],
    }),
  );
const build = (entries, head = "code: c001\n") =>
  `## Scene 1 — write it\nvisual: code build (tier 1)\nduration: ~40s\n${head}\n` +
  entries.map(([text, lines]) => `- spoken: "${text}"\n  display: "${text}"\n  source: [c001]\n` + (lines ? `  lines: ${lines}\n` : "")).join("\n");

test("check-readability: a code build that narrates every line passes", () => {
  const p = write("build-ok.md", build([["Name it.", "[1]"], ["Start at zero.", "[2]"], ["Walk and add.", "[4-5]"], ["Return it.", "[6]"]]));
  const r = run("check-readability.mjs", p, "--chapter", codeChapter());
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("check-readability: a code build that skips lines names them", () => {
  const p = write("build-gap.md", build([["Here is all the code.", "[1]"]]));
  const r = run("check-readability.mjs", p, "--chapter", codeChapter());
  assert.equal(r.status, 1);
  assert.match(r.stderr, /c001 lines 2, 4, 5, 6 are shown but never narrated/);
});

test("check-readability: a code build with no block or no lines fails even without --chapter", () => {
  assert.match(run("check-readability.mjs", write("build-noblock.md", build([["Code.", "[1]"]], ""))).stderr, /names no code: block/);
  assert.match(run("check-readability.mjs", write("build-nolines.md", build([["Code.", null]]))).stderr, /no entry says which lines/);
});

test("check-readability: a code build naming a prose block is refused", () => {
  const p = write("build-prose.md", build([["Name it.", "[1]"]], "code: p001\n"));
  assert.match(run("check-readability.mjs", p, "--chapter", codeChapter()).stderr, /p001 is not a code block/);
});

// ── check-spoken: opt-in gates ───────────────────────────────────────────────────────────────────

test("check-spoken: a spoken array is one value, not a list", () => {
  const md = write("arr.md", '# t\n\n## Scene 1 — x\n\n- spoken: "So one, two, three, one gives true, because the one appears twice."\n  display: "So 1, 2, 3, 1 gives true."\n  source: [p1]\n\n- spoken: "We need apples, pears, plums, figs, and dates."\n  display: "x"\n  source: [p1]\n');
  const r = run("check-spoken.mjs", md);
  assert.equal((r.stdout + r.stderr).match(/reads out a list/g)?.length, 1, `only the real list fails:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout + r.stderr, /apples, pears/);
});

test("check-spoken: --banned fails a term in either layer, as a whole word only", () => {
  const p = write(
    "banned.md",
    `## Scene 1 — x\n- spoken: "Here is the chapter's example."\n  display: "Here is the chapter's example."\n  source: [p1]\n\n` +
      `## Scene 2 — y\n- spoken: "Now let's look at a notebook."\n  display: "Now let's look at a notebook."\n  source: [p1]\n`,
  );
  const r = run("check-spoken.mjs", p, "--banned", "chapter,book");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /spoken layer says "chapter"/);
  assert.match(r.stderr, /display layer says "chapter"/);
  assert.doesNotMatch(r.stderr, /"book"/, "notebook is not book");
  assert.equal(run("check-spoken.mjs", p).status, 0, "without --banned nothing is banned");
});

test("check-spoken: --max-avg turns long average sentences into a failure", () => {
  const p = write(
    "avg.md",
    `## Scene 1 — x\n- spoken: "This sentence has quite a lot of words in it for one breath of air today."\n  display: "x"\n  source: [p1]\n`,
  );
  assert.match(run("check-spoken.mjs", p, "--max-avg", "12").stderr, /this video's limit is 12/);
  assert.equal(run("check-spoken.mjs", p).status, 0);
  assert.equal(run("check-spoken.mjs", p, "--max-avg").status, 2);
});

// ── check-spoken ──────────────────────────────────────────────────────────────────────────────────

const spokenScript = (...entries) =>
  "## Scene 1 — t\nvisual: definition card (tier 1)\nduration: ~20s\n\n" +
  entries.map((e) => `- spoken: "${e}"\n  display: "${e.replace(/\{(beat|pause)\}\s*/g, "")}"\n  source: [p001]\n`).join("\n");

test("check-spoken: a conversational script passes and its metrics are reported", () => {
  const p = write("sp-good.md", spokenScript(
    "So, which model do you pick? {beat} It depends on what you're building.",
    "Start with the one you trust. Then measure it."));
  const r = run("check-spoken.mjs", p, "--json");
  assert.equal(r.status, 0, r.stderr);
  const m = JSON.parse(r.stdout).files[0].metrics;
  assert.equal(m.sentences, 4);
  assert.equal(m.questions, 1);
  assert.ok(m.contractions >= 1, "you're is a contraction");
  assert.ok(m.you >= 2, "you and you're address the viewer");
  assert.ok(m.avgWords < 10);
});

test("check-spoken: markers do not count as words", () => {
  const p = write("sp-markers.md", spokenScript("One two three. {pause} Four five six."));
  const m = JSON.parse(run("check-spoken.mjs", p, "--json").stdout).files[0].metrics;
  assert.equal(m.words, 6);
  assert.equal(m.maxWords, 3);
});

test("check-spoken: a sentence over the hard limit fails", () => {
  const long = "this sentence just keeps going and going and going without ever stopping for breath so that the listener has no chance to take anything in at all before it finally ends and even then it carries on a little further with yet another clause that nobody asked for";
  const r = run("check-spoken.mjs", write("sp-long.md", spokenScript(long + ".")));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /sentence of \d+ words/);
});

test("check-spoken: a sentence that reads out a long list fails", () => {
  const r = run("check-spoken.mjs", write("sp-list.md", spokenScript("It has role, task, rules, format, examples, and context.")));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /list/i);
  // three items is a sentence, not a list
  assert.equal(run("check-spoken.mjs", write("sp-list3.md", spokenScript("It has a role, a task, and some rules."))).status, 0);
});

test("check-spoken: soft problems warn but do not fail", () => {
  // a long, lecture-like stretch with no question and no 'you'
  const dull = Array.from({ length: 8 }, () => "The model reads the prompt and then it writes an answer for the user of the app").map((s) => s + ".");
  const r = run("check-spoken.mjs", write("sp-dull.md", spokenScript(...dull)));
  assert.equal(r.status, 0, "warnings must not fail the gate");
  assert.match(r.stderr + r.stdout, /warn/i);
  assert.match(r.stderr + r.stdout, /you/i);
});

// A YouTube video is not constrained to a word budget, so the sentence limits only catch what cannot be said
// in one breath. A long explanatory sentence is a judgement call (a warning), not a failure.
test("check-spoken: a long explanatory sentence warns but does not fail", () => {
  const s = "when you raise the effort the model thinks harder about every problem it sees and that usually gives you better answers on the hard cases at the price of more tokens and more time";
  const r = run("check-spoken.mjs", write("sp-medium.md", spokenScript(s + ".")));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr + r.stdout, /warn/i);
});

// A scene change is a topic change; saying so aloud is what stops it feeling rushed.
const twoScenes = (second) =>
  "## Scene 1 — a\nvisual: definition card (tier 1)\nduration: ~20s\n\n" +
  '- spoken: "Welcome to the part about effort."\n  display: "Welcome to the part about effort."\n  source: [p001]\n\n' +
  "## Scene 2 — b\nvisual: definition card (tier 1)\nduration: ~20s\n\n" +
  `- spoken: "${second}"\n  display: "${second}"\n  source: [p001]\n`;

test("check-spoken: a scene that opens without a signpost is flagged, one that opens with one is not", () => {
  const flat = run("check-spoken.mjs", write("sp-flat.md", twoScenes("Capability-first is the current default.")));
  assert.equal(flat.status, 0, "a missing signpost is advice, not a failure");
  assert.match(flat.stderr + flat.stdout, /scene 2 opens without a signpost/i);
  for (const ok of ["Let's look at it through an example.", "Now, the other way round.", "So which do you pick?", "Take a document app."]) {
    const r = run("check-spoken.mjs", write("sp-sign.md", twoScenes(ok)));
    assert.ok(!/opens without a signpost/i.test(r.stderr + r.stdout), `"${ok}" is a signpost`);
  }
});

test("check-spoken: the first scene is never asked for a signpost, and --json lists the scenes that lack one", () => {
  const r = run("check-spoken.mjs", write("sp-json.md", twoScenes("Capability-first is the current default.")), "--json");
  const f = JSON.parse(r.stdout).files[0];
  assert.deepEqual(f.metrics.unsignposted, [2]);
});

test("narrate: --lead puts a breath before every take except the first", () => {
  if (!haveKokoro) return "kokoro is not installed here";
  need(narr);
  const two = (name, ...extra) => {
    const dir = join(tmp, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SCRIPT.md"),
      "# S\n\n## Line 1 — a (Frame 1)\n\n    Hello there.\n\n## Line 2 — b (Frame 2)\n\n    Let's look at it through an example.\n");
    const r = spawnSync(process.execPath, [join(scripts, "narrate.mjs"), "--script", join(dir, "SCRIPT.md"), "--out", dir,
      "--no-transcribe", "--python", pyKokoro, ...extra], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    return [wavSeconds(join(dir, "assets/voice/01.wav")), wavSeconds(join(dir, "assets/voice/02.wav"))];
  };
  const [a1, a2] = two("lead0");
  const [b1, b2] = two("lead1", "--lead", "0.8");
  assert.ok(Math.abs(b1 - a1) < 0.05, `frame 1 must be unchanged (${a1.toFixed(2)}s vs ${b1.toFixed(2)}s)`);
  assert.ok(Math.abs(b2 - a2 - 0.8) < 0.08, `frame 2 should gain ~0.8s (${a2.toFixed(2)}s vs ${b2.toFixed(2)}s)`);
});

test("check-spoken: usage errors and unreadable files are reported", () => {
  assert.equal(run("check-spoken.mjs").status, 2);
  assert.equal(run("check-spoken.mjs", join(tmp, "nope.md")).status, 2);
});

test("build-tokens: a pause marker in the spoken layer does not disturb the display tokens", () => {
  const s = write("tok-marker.md", spokenScript("Ready? {beat} Here it is."));
  const lex = write("tok-lex.json", JSON.stringify({ terms: [] }));
  const r = run("build-tokens.mjs", s, lex, out("tok-marker.json"));
  assert.equal(r.status, 0, r.stderr);
  const toks = JSON.parse(readFileSync(out("tok-marker.json"), "utf8")).lines[0].tokens;
  assert.deepEqual(toks.map((x) => (typeof x === "string" ? x : x.display)), ["Ready?", "Here", "it", "is."]);
});

// ── manim-render ──────────────────────────────────────────────────────────────────────────────────

// Every manim-render call here passes --out into the temp dir. Its default is "assets" relative to
// the cwd, so a test that renders without one drops build output into the repo root.
const manimOut = () => ["--out", join(tmp, "manim-out")];

// LaTeX is only needed for MathTex/Tex, so it must not be a blanket requirement — a construction
// scene should render without it. The script decides by reading the scene, and it finds a TinyTeX
// that is not on PATH, so the only reliable way to test the no-LaTeX branch is to hide it: HOME
// points somewhere empty, which is where the script looks.
test("manim-render: a MathTex scene without LaTeX exits 3 for the Tier 1 fallback", () => {
  const haveManim = existsSync(join(root, ".venv/bin/manim")) ||
    spawnSync("manim", ["--version"], { stdio: "ignore" }).status === 0;
  if (!haveManim) return "manim is not installed, so the message would name manim instead";
  if (spawnSync("latex", ["--version"], { stdio: "ignore" }).status === 0) {
    return "LaTeX is on PATH, so it cannot be hidden by moving HOME";
  }

  const emptyHome = join(tmp, "empty-home");
  mkdirSync(emptyHome, { recursive: true });
  const scene = write("latex_scene.py",
    'from manim import *\nclass S(Scene):\n    def construct(self):\n        self.add(MathTex(r"x^2"))\n');
  const r = spawnSync(process.execPath, [join(scripts, "manim-render.mjs"), scene, ...manimOut()],
                      { encoding: "utf8", cwd: root, env: { ...process.env, HOME: emptyHome } });
  assert.equal(r.status, 3, "a distinct code is what lets the caller route to Tier 1");
  assert.match(r.stderr, /MathTex/);
  assert.match(r.stderr, /Fall back to Tier 1/);
});

test("manim-render: a missing toolchain exits 3 rather than failing the run", () => {
  const haveManim = spawnSync("manim", ["--version"], { stdio: "ignore" }).status === 0 ||
    existsSync(join(root, ".venv/bin/manim"));
  if (haveManim) return "manim is installed, so this path cannot fire here";
  const r = run("manim-render.mjs", write("plain.py", "class S: pass"), ...manimOut());
  assert.equal(r.status, 3);
  assert.match(r.stderr, /Fall back to Tier 1/);
});

test("manim-render: fps and resolution are validated before anything renders", () => {
  const scene = write("v.py", "class S: pass");
  const badFps = run("manim-render.mjs", scene, "--fps", "thirty", ...manimOut());
  assert.equal(badFps.status, 2);
  assert.match(badFps.stderr, /--fps must be a whole number/);

  const badRes = run("manim-render.mjs", scene, "--resolution", "1080p", ...manimOut());
  assert.equal(badRes.status, 2);
  assert.match(badRes.stderr, /--resolution must look like/);
});

// ── chalk-core CLI ────────────────────────────────────────────────────────────────────────────────

const cli = (...args) =>
  spawnSync(process.execPath, [join(root, "bin/chalk-core.mjs"), ...args], { encoding: "utf8" });

test("cli: every command maps to a script that exists", () => {
  const src = readFileSync(join(root, "bin/chalk-core.mjs"), "utf8");
  const files = [...src.matchAll(/^\s+(?:"[a-z-]+"|[a-z]+):\s*"([a-z-]+\.mjs)",?$/gm)].map((m) => m[1]);
  assert.equal(files.length, 10, "expected the ten shared scripts");
  for (const f of files) assert.ok(existsSync(join(scripts, f)), `${f} is mapped but missing`);
});

test("cli: a command runs its script and passes the exit code through", () => {
  const ok = cli("ingest", fixture("gutenberg-chapter.md"), "--out", out("cli.json"));
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(existsSync(out("cli.json")));
  assert.equal(cli("ingest", out("does-not-exist.md")).status, 2);
  assert.equal(cli("check-readability").status, 2, "usage errors must not be swallowed");
});

test("cli: an unknown command is an error, and path prints the install dir", () => {
  assert.equal(cli("nope").status, 2);
  assert.equal(cli("path").stdout.trim(), root);
  assert.equal(cli("path", "templates/manim/scene_template.py").stdout.trim(),
                join(root, "templates/manim/scene_template.py"));
});

test("the shared references carry no path into a skill that does not exist here", () => {
  for (const f of ["fidelity", "step-1-ingest", "step-3-script", "visual-registry", "manim",
                   "captions-and-engine", "edge-cases"]) {
    const t = readFileSync(join(root, "references", `${f}.md`), "utf8");
    assert.ok(!t.includes("<skill-dir>"), `${f}.md still points at <skill-dir>`);
  }
});

// A test that renders into the repo is a test that pollutes it, and this one did.
test("the suite leaves no build output in the repo", () => {
  assert.ok(!existsSync(join(root, "assets")), "a stray assets/ means a render used the default --out");
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
