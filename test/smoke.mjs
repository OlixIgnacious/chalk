#!/usr/bin/env node
// smoke.mjs — the regression gate for chalk's own scripts: the lesson page and delivery.
//
//   node test/smoke.mjs        (or: npm test)
//
// chalk is markdown and reference data, not an application, so this is deliberately one
// dependency-free file rather than a test framework. It asserts exit codes and the parts of the
// output the pipeline actually reads, and it pins the two grounding bugs that used to report `ok`:
// an unsourced SPOKEN line passing the gate, and a `source:` migrating up onto the entry above it.
//
// Fixtures are written to a temp dir. The public-domain chapter fixtures live in chalk-core — never
// test against a copyrighted book.

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

// ── chalk-core ────────────────────────────────────────────────────────────────────────────────────

// chalk reads core's references from a vendored copy, so the copy has to match the core it declares.
test("core: the vendored references match the installed chalk-core", () => {
  const r = spawnSync("npx", ["chalk-core", "sync", join(root, "skills/chalk"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr + r.stdout);
});

test("core: no script is left behind that core now owns", () => {
  for (const f of ["ingest", "check-readability", "build-tokens", "align-captions", "emit-vtt", "fix-index", "manim-render"]) {
    assert.ok(!existsSync(join(scripts, `${f}.mjs`)), `${f}.mjs belongs to chalk-core now`);
  }
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
