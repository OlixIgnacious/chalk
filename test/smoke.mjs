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
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
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

/** Read the manifest back out of a built page, the way the player itself does. */
const embeddedManifest = (pagePath) => {
  const page = readFileSync(pagePath, "utf8");
  const m = page.match(/<script type="application\/json" id="lesson-manifest">([\s\S]*?)<\/script>/);
  assert.ok(m, "the built page has no embedded manifest");
  return JSON.parse(m[1]);
};

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

// Presence is not validity. Each of these produces a page that loads and then cannot be used, so
// they have to fail at the manifest, not in the browser.
test("build-lesson-page: a duration that is not a positive number is refused", () => {
  for (const duration of [null, "sixty", 0, -5]) {
    const r = run("build-lesson-page.mjs", manifest([{ id: "01", title: "a", mp4: "a.mp4", duration }]));
    assert.equal(r.status, 2, `duration ${JSON.stringify(duration)} should be refused`);
    assert.match(r.stderr, /not a positive number/);
  }
});

test("build-lesson-page: duplicate segment ids are refused", () => {
  const r = run(
    "build-lesson-page.mjs",
    manifest([
      { id: "01", title: "a", mp4: "a.mp4", duration: 60 },
      { id: "01", title: "b", mp4: "b.mp4", duration: 60 },
    ]),
  );
  assert.equal(r.status, 2);
  assert.match(r.stderr, /duplicate segment id/);
});

// A checkpoint HOLDS until answered, so an answer that indexes past its options is a lesson nobody
// can finish.
test("build-lesson-page: a checkpoint answer outside its options is refused", () => {
  const cp = (options, answer) =>
    manifest([
      { id: "01", title: "a", mp4: "a.mp4", duration: 60,
        checkpoint: { prompt: "q", options, answer, source: ["p1"] } },
    ]);
  for (const [options, answer] of [[["a", "b", "c"], 7], [["a", "b"], -1], [["a", "b"], 1.5]]) {
    const r = run("build-lesson-page.mjs", cp(options, answer));
    assert.equal(r.status, 2, `answer ${answer} of ${options.length} should be refused`);
    assert.match(r.stderr, /is not an index into its/);
  }
  const single = run("build-lesson-page.mjs", cp(["a"], 0));
  assert.equal(single.status, 2);
  assert.match(single.stderr, /at least two options/);
});

test("build-lesson-page: an unreadable or malformed manifest reports itself", () => {
  const missing = run("build-lesson-page.mjs", join(tmp, "no-such.json"));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /cannot read/);

  const bad = write("bad.json", '{"segments":[');
  const r = run("build-lesson-page.mjs", bad);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /cannot read/);
});

// --out's value can itself end in .json, and picking that as the manifest builds the wrong page.
test("build-lesson-page: a flag value is never mistaken for the manifest", () => {
  const m = manifest([{ id: "01", title: "a", mp4: "a.mp4", duration: 60 }]);
  const r = run("build-lesson-page.mjs", "--out", out("page.html"), m);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(out("page.html")), "it must build the manifest, not the --out value");
});

// The page has to be one self-contained file: the output folder gets moved, zipped and opened from
// file://, so a page that reaches for a stylesheet or a font at runtime is a broken page.
test("build-lesson-page: builds a self-contained lesson.html", () => {
  const dir = join(tmp, "built");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "lesson.json"),
    JSON.stringify({
      title: "A Candle: the Flame",
      segments: [{ id: "01", title: "Why a candle needs a wick", mp4: "segments/01/segment.mp4", duration: 60 }],
    }),
  );
  const r = run("build-lesson-page.mjs", join(dir, "lesson.json"));
  assert.equal(r.status, 0, r.stderr);

  const page = readFileSync(join(dir, "lesson.html"), "utf8");
  assert.ok(existsSync(join(dir, "lesson.html")));
  assert.doesNotMatch(page, /@chalk:[a-z]+@/, "every template marker must be replaced");
  assert.match(page, /<title>A Candle: the Flame<\/title>/);
  assert.match(page, /--accent:/, "the stylesheet must be inlined");
  assert.match(page, /lesson-manifest/, "the manifest must be embedded");
  assert.doesNotMatch(page, /<link[^>]+stylesheet/i, "no external stylesheet");
  assert.doesNotMatch(page, /<script[^>]+\ssrc=/i, "no external script");
});

// Captions are embedded as cues, not linked with <track>: file:// treats each page as its own
// origin and blocks the text track, which is exactly where this page is meant to be opened.
test("build-lesson-page: VTT cues are parsed and embedded", () => {
  const dir = join(tmp, "caps");
  mkdirSync(join(dir, "segments/01"), { recursive: true });
  writeFileSync(
    join(dir, "segments/01/segment.vtt"),
    "WEBVTT\n\n1\n00:00:00.030 --> 00:00:01.080\nAs the price goes up,\n\n" +
      "2\n00:01:01.330 --> 00:01:02.280\npeople buy <b>less</b>.\n",
  );
  writeFileSync(
    join(dir, "lesson.json"),
    JSON.stringify({
      title: "t",
      segments: [{ id: "01", title: "a", mp4: "a.mp4", captions: "segments/01/segment.vtt", duration: 60 }],
    }),
  );
  const r = run("build-lesson-page.mjs", join(dir, "lesson.json"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 caption cue\(s\)/);

  const cues = embeddedManifest(join(dir, "lesson.html")).segments[0].cues;
  assert.equal(cues.length, 2);
  assert.deepEqual(cues[0], { start: 0.03, end: 1.08, text: "As the price goes up," });
  assert.equal(cues[1].start, 61.33, "an HH:MM:SS.mmm timestamp must carry its minutes");
  assert.equal(cues[1].text, "people buy less.", "cue markup is stripped for our own rail");
});

test("build-lesson-page: a captions file that is not there is a warning, not a failure", () => {
  const dir = join(tmp, "nocaps");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "lesson.json"),
    JSON.stringify({ title: "t", segments: [{ id: "01", title: "a", mp4: "a.mp4", captions: "missing.vtt", duration: 60 }] }),
  );
  const r = run("build-lesson-page.mjs", join(dir, "lesson.json"));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /captions file that is not there/);
});

// A chapter's own words end up inside a <script> tag. If they can close it, the chapter can become
// markup — so this is a grounding problem as much as a correctness one.
test("build-lesson-page: chapter text cannot break out of the page", () => {
  const dir = join(tmp, "escape");
  mkdirSync(dir, { recursive: true });
  const nasty = 'He wrote </script><img src=x onerror="alert(1)"> & "then" <stopped>';
  writeFileSync(
    join(dir, "lesson.json"),
    JSON.stringify({
      title: 'A <script> & "Candle"',
      segments: [{ id: "01", title: nasty, mp4: "a.mp4", duration: 60,
        checkpoint: { prompt: nasty, options: ["a", "b"], answer: 0, explanation: nasty, source: ["p1"] } }],
    }),
  );
  const r = run("build-lesson-page.mjs", join(dir, "lesson.json"));
  assert.equal(r.status, 0, r.stderr);

  const page = readFileSync(join(dir, "lesson.html"), "utf8");
  assert.doesNotMatch(page, /<\/script><img/, "the script tag must not be closable from the data");
  assert.match(page, /<title>A &lt;script&gt; &amp; &quot;Candle&quot;<\/title>/);

  // and the text still round-trips intact, so escaping did not corrupt the chapter
  assert.equal(embeddedManifest(join(dir, "lesson.html")).segments[0].title, nasty);
});

test("build-lesson-page: a missing player asset is reported, not half-built", () => {
  const m = manifest([{ id: "01", title: "a", mp4: "a.mp4", duration: 60 }]);
  const r = run("build-lesson-page.mjs", m, "--player", join(tmp, "no-such-dir"));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /player asset missing/);
});

// ── deliver ───────────────────────────────────────────────────────────────────────────────────────

const haveFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const ff = (args) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { encoding: "utf8" });
const frames = (f) =>
  Number(
    spawnSync("ffprobe", ["-v", "error", "-count_frames", "-select_streams", "v:0",
                          "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", f],
             { encoding: "utf8" }).stdout.trim(),
  );
// One -vf only: ffmpeg honours the last one it is given, so passing a second silently discards the
// first — which is how this helper originally re-read frame 0 while claiming to read frame 1.
/** How far an averaged pixel is from a target colour — JPEG rounding moves it a few units. */
const colourDistance = (hex, target) => {
  const a = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const bb = [0, 2, 4].map((i) => parseInt(target.slice(i, i + 2), 16));
  return Math.max(...a.map((v, i) => Math.abs(v - bb[i])));
};
const SETTLED = "1a3a5a";

const avgPixel = (f, filter = "scale=1:1") =>
  spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", f,
                       "-vf", `${filter},scale=1:1`, "-frames:v", "1",
                       "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
           { encoding: "buffer" }).stdout.toString("hex");

/**
 * A segment that moves and then settles, built the way a real one is: two clips concatenated. That
 * concat is what gives the file a non-zero start pts, which is the condition the frame-0 bake used
 * to get wrong — so the fixture has to be built this way for the test to mean anything.
 */
function buildLesson(dir, { withScripts = true } = {}) {
  mkdirSync(join(dir, "segments/01"), { recursive: true });
  ff(["-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=1",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, "m.mp4")]);
  ff(["-f", "lavfi", "-i", "color=c=0x1a3a5a:size=320x180:rate=30:duration=1.5",
      "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1.5",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(dir, "s.mp4")]);
  writeFileSync(join(dir, "c.txt"), `file '${join(dir, "m.mp4")}'\nfile '${join(dir, "s.mp4")}'\n`);
  ff(["-f", "concat", "-safe", "0", "-i", join(dir, "c.txt"), "-c", "copy", join(dir, "segments/01/segment.mp4")]);

  if (withScripts) {
    writeFileSync(
      join(dir, "segments/01/script.md"),
      `## Scene 1 — the wick\nvisual: diagram (tier 1)\nduration: ~14s\n\n` +
        `- spoken: "The wax is drawn up the wick."\n  display: "Wax up the wick."\n  source: [p010]\n\n` +
        `- spoken: "Without it the wax would sit there."\n  source: [p012]\n`,
    );
  }
  writeFileSync(
    join(dir, "lesson.json"),
    JSON.stringify({
      title: "A Candle", source: "fixtures/gutenberg-chapter.md",
      segments: [{ id: "01", title: "The wick", objective: "What the wick does.",
                   mp4: "segments/01/segment.mp4", duration: 2.5 }],
    }),
  );
  return dir;
}

const deliver = (dir, ...args) =>
  spawnSync(process.execPath, [join(scripts, "deliver.mjs"), dir, ...args], { encoding: "utf8" });

// The poster must be a SETTLED frame. The fixture moves for 1s and then holds a flat colour, so a
// poster taken from the moving part is visibly the wrong pixel.
test("deliver: the poster comes from the settled span, not the moving part", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildLesson(join(tmp, "d1"));
  const r = deliver(dir, "--no-bake");
  assert.equal(r.status, 0, r.stderr);
  const poster = avgPixel(join(dir, "segments/01/poster.jpg"));
  assert.ok(
    colourDistance(poster, SETTLED) <= 6,
    `poster averaged ${poster}, expected the settled colour ${SETTLED}`,
  );
});

// REGRESSION — the bake used to PREPEND a frame on a concatenated segment, because its first frame
// starts at a non-zero pts. Duration barely moved, so only the frame count catches it.
test("deliver: baking replaces frame 0 without adding or dropping one", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildLesson(join(tmp, "d2"));
  const mp4 = join(dir, "segments/01/segment.mp4");
  const before = frames(mp4);
  const r = deliver(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(frames(mp4), before, "a prepended frame shifts the whole lesson against its audio");

  const first = avgPixel(mp4, "select=eq(n\\,0)");
  assert.ok(colourDistance(first, SETTLED) <= 6, `frame 0 must now be the poster, got ${first}`);
  const second = avgPixel(mp4, "select=eq(n\\,1)");
  assert.ok(
    colourDistance(second, SETTLED) > 20,
    `frame 1 must still be the original moving content, got ${second}`,
  );
});

test("deliver: --no-bake leaves the video untouched", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildLesson(join(tmp, "d3"));
  const mp4 = join(dir, "segments/01/segment.mp4");
  const before = readFileSync(mp4);
  assert.equal(deliver(dir, "--no-bake").status, 0);
  assert.deepEqual(readFileSync(mp4), before, "--no-bake must not re-encode");
  assert.ok(existsSync(join(dir, "segments/01/poster.jpg")), "but the poster is still written");
});

test("deliver: lesson.mp4 and lesson-plan.md are written, and work/ is cleaned", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildLesson(join(tmp, "d4"));
  mkdirSync(join(dir, "work"), { recursive: true });
  writeFileSync(join(dir, "work/scratch.txt"), "x");
  const r = deliver(dir, "--no-bake");
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(dir, "lesson.mp4")));
  assert.match(r.stdout, /without re-encoding/, "matching segments should concatenate by copy");
  assert.ok(!existsSync(join(dir, "work")), "work/ is cleaned on success");

  const plan = readFileSync(join(dir, "lesson-plan.md"), "utf8");
  assert.match(plan, /## Source citations/);
  assert.match(plan, /\| 01 \| Scene 1 — the wick \| Wax up the wick\. \| `p010` \|/);
  assert.match(plan, /_\(spoken only\)_/, "a spoken-only line is marked as such in the table");
  assert.match(plan, /2 line\(s\) cited/);
});

// lesson-plan.md is the audit trail for "every claim is traceable", so it cannot be written over a
// script that does not carry its citations.
test("deliver: an unsourced line stops delivery", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildLesson(join(tmp, "d5"));
  writeFileSync(
    join(dir, "segments/01/script.md"),
    `## Scene 1 — the wick\nvisual: diagram (tier 1)\nduration: ~14s\n\n` +
      `- spoken: "Ninety-three percent of candles are paraffin."\n`,
  );
  const r = deliver(dir, "--no-bake");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing to call this delivered/);
  assert.ok(existsSync(join(dir, "work")), "work/ is kept so the run can be resumed");
});

test("deliver: a missing manifest or segment is reported", () => {
  const empty = join(tmp, "d6");
  mkdirSync(empty, { recursive: true });
  const noManifest = deliver(empty);
  assert.equal(noManifest.status, 2);
  assert.match(noManifest.stderr, /no lesson\.json/);

  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = join(tmp, "d7");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "lesson.json"),
    JSON.stringify({ title: "t", segments: [{ id: "01", title: "a", mp4: "segments/01/segment.mp4", duration: 1 }] }));
  const r = deliver(dir);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /step 4 has not finished/);
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
