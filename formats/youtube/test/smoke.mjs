#!/usr/bin/env node
// smoke.mjs — the regression gate for chalk-youtube's scripts: the upload kit and the notebook.
//
//   node test/smoke.mjs        (or: npm test)
//
// The grounding, ingest and Manim tests live in chalk-core. This file pins what is specific to a
// YouTube delivery: chapter offsets and the rules YouTube applies to them, the merged captions, the
// description, the size gate, the thumbnail, and the notebook. Fixtures are original text, never a
// copyrighted book.

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync, lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const scripts = join(root, "skills/chalk-youtube/scripts");
const tmp = mkdtempSync(join(tmpdir(), "chalk-youtube-"));
const kit = await import(pathToFileURL(join(scripts, "kit.mjs")).href);
const nb = await import(pathToFileURL(join(scripts, "build-notebook.mjs")).href);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const write = (p, body) => {
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body);
  return p;
};

// ── kit: chapters ─────────────────────────────────────────────────────────────────────────────────

test("kit: timestamps use m:ss and h:mm:ss", () => {
  assert.equal(kit.stamp(0), "0:00");
  assert.equal(kit.stamp(65.9), "1:05");
  assert.equal(kit.stamp(3725), "1:02:05");
});

test("kit: chapter offsets are the sum of the durations before them", () => {
  const segs = [{ title: "Hook" }, { title: "Mean" }, { title: "Spread" }];
  const { chapters, problems } = kit.buildChapters(segs, [12.5, 40.25, 31]);
  assert.deepEqual(problems, []);
  assert.deepEqual(chapters.map((c) => c.at), [0, 12.5, 52.75]);
  assert.equal(kit.chaptersText(chapters), "0:00 Hook\n0:12 Mean\n0:52 Spread\n");
});

test("kit: fewer than three chapters, or one under ten seconds, is an error", () => {
  const two = kit.buildChapters([{ title: "a" }, { title: "b" }], [30, 30]);
  assert.match(two.problems.join("\n"), /at least 3/);
  const short = kit.buildChapters([{ title: "a" }, { title: "b" }, { title: "c" }], [30, 9.5, 30]);
  assert.match(short.problems.join("\n"), /"b" is 9\.5s; YouTube needs at least 10s/);
});

// ── kit: captions ─────────────────────────────────────────────────────────────────────────────────

const VTT = (cues) => "WEBVTT\n\n" + cues.map(([a, b, t]) => `${a} --> ${b}\n${t}\n`).join("\n");

test("kit: per-segment captions merge into one SRT, shifted by where each segment starts", () => {
  const srt = kit.mergeCaptions(
    [VTT([["00:00.500", "00:02.000", "First."]]), VTT([["00:01.000", "00:03.250", "Second."]])],
    [0, 10],
    [10, 10],
  );
  assert.equal(
    srt,
    "1\n00:00:00,500 --> 00:00:02,000\nFirst.\n\n2\n00:00:11,000 --> 00:00:13,250\nSecond.\n",
  );
});

test("kit: a cue is clamped to its segment, and cues that do not advance or overlap are refused", () => {
  const clamped = kit.mergeCaptions([VTT([["00:08.000", "00:12.000", "Long."]])], [0], [10]);
  assert.match(clamped, /00:00:08,000 --> 00:00:10,000/);
  assert.throws(() => kit.mergeCaptions([VTT([["00:02.000", "00:02.000", "x"]])], [0], [10]), /does not advance/);
  assert.throws(
    () => kit.mergeCaptions([VTT([["00:05.000", "00:06.000", "a"]]), VTT([["00:00.000", "00:01.000", "b"]])], [0, 3], [10, 10]),
    /overlap/,
  );
});

test("kit: hour-form VTT timestamps parse", () => {
  const cues = kit.parseVtt(VTT([["01:00:01.500", "01:00:02.000", "late"]]));
  assert.equal(cues[0].start, 3601.5);
});

// ── kit: description ──────────────────────────────────────────────────────────────────────────────

test("kit: the description carries the timestamps and the series, never the source, and says nothing about examples", () => {
  const { chapters } = kit.buildChapters([{ title: "Hook" }, { title: "Mean" }, { title: "Spread" }], [12, 40, 31]);
  const series = { name: "Stats Patterns", part: 2, of: 5, next: "Variance" };
  const d = kit.buildDescription({ title: "Averages", thesis: "A mean hides the spread.", source: "ch3.md", chapters, derived: true, notebook: true, series });
  assert.match(d, /^Averages\n\nA mean hides the spread\.\n\nPart 2 of 5 in the Stats Patterns series\. Next: Variance\.\n\nIn this video\n0:00 Hook\n0:12 Mean\n0:52 Spread/);
  assert.ok(!/ch3\.md|Based on|chapter/i.test(d), "the viewer never sees the source");
  // That a case is derived is a matter for the logs (plan.md); nothing viewer-facing says it.
  assert.ok(!/not from the chapter|illustrative/i.test(d), "the description must not carry the example note");
  assert.match(d, /Jupyter notebook/);
  const plain = kit.buildDescription({ title: "T", chapters, notebook: false });
  assert.ok(!/notebook/.test(plain), "no note without the thing it notes");
});

// ── notebook: cells that cannot run alone ─────────────────────────────────────────────────────────

test("notebook: checkSyntax compiles, so a top-level return is caught", () => {
  const book = { cells: [{ cell_type: "code", source: ["seen = set()\n", "return None\n"] }] };
  const r = nb.checkSyntax(book, join(root, ".venv/bin/python"));
  assert.equal(r.checked, true);
  assert.equal(r.errors.length, 1, "ast.parse alone accepts this; compile must not");
});

test("notebook: a fragment, a read_only block and a setup file are handled", () => {
  const chapter = {
    title: "T",
    blocks: [
      { id: "c1", kind: "code", lang: "python", text: "for x in xs:\n    return x" },
      { id: "c2", kind: "code", lang: "python", text: "{[1]: 'x'}" },
      { id: "c3", kind: "code", lang: "python", text: "print(len(df))" },
    ],
  };
  const fragments = nb.findFragments(chapter, join(root, ".venv/bin/python"));
  assert.ok(fragments.has("c1") && !fragments.has("c2"), [...fragments.keys()].join());
  const { notebook, problems } = nb.buildNotebook({
    chapter,
    manifest: { title: "T", segments: [], notebook: { read_only: { c2: "it raises TypeError on purpose" }, setup: { c3: "segments/02/examples/setup.py" },
      sections: [{ title: "a", code: ["c1", "c2"] }, { title: "b", code: "c3" }] } },
    readSegmentFile: (id, f) => (id === "02" && f === "examples/setup.py" ? "df = [1, 2]\n" : null),
    fragments,
  });
  assert.deepEqual(problems, []);
  const text = notebook.cells.map((c) => `${c.cell_type}: ${c.source.join("")}`).join("\n---\n");
  assert.match(text, /markdown: Read this one, don't run it: it is a fragment[\s\S]*for x in xs/);
  assert.match(text, /markdown: Read this one, don't run it: it raises TypeError on purpose/);
  assert.match(text, /markdown: Run this first: it sets up the data the next cell uses\.\n---\ncode: df = \[1, 2\]\n---\ncode: print\(len\(df\)\)/);
});

// ── a chapter, a script and a notebook ────────────────────────────────────────────────────────────

const ingest = (md, out) =>
  spawnSync("npx", ["chalk-core", "ingest", md, "--out", out], { encoding: "utf8", cwd: root });
const CHAPTER_MD = join(root, "fixtures/own-code-chapter.md");

function chapterJson(name) {
  const out = join(tmp, `${name}.json`);
  const r = ingest(CHAPTER_MD, out);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(readFileSync(out, "utf8"));
}

const scene = (title, fields, lines) =>
  `## Scene — ${title}\nvisual: ${fields.visual ?? "plot (tier 1)"} (tier 1)\n${fields.extra ?? ""}duration: ~20s\n\n` +
  lines.map(([d, s]) => `- spoken: "${d}"\n  display: "${d}"\n  source: [${s}]\n`).join("\n");

// The fixture's blocks: c005 is Python, c007 is JavaScript, x008 is the exercise.
const SCRIPTS = {
  "01": scene("hook", {}, [["A mean can hide the spread.", "p003"]]),
  "02": scene("variance", {}, [["Variance measures the distance from the mean.", "p004"], ["Here is the function.", "c005"], ["And in JavaScript.", "c007"]]) +
    "\n" + scene("two lists, one mean", { visual: "worked example", extra: "example: derived\ncomputed-by: examples/spread.py\nrun: sum([4, 5, 6]) / 3, sum([1, 5, 9]) / 3\n" },
      [["Two lists, one mean.", "p004"]]),
  "03": scene("your turn", {}, [["Write the standard deviation.", "x008"]]),
};
const SPREAD_PY = "a = [4, 5, 6]\nb = [1, 5, 9]\nprint(sum(a) / len(a), sum(b) / len(b))\n";

// The notebook's own outline: the problem, then the solution with its explanation and example calls.
const NOTEBOOK = {
  title: "Variance",
  sections: [
    { title: "The problem", text: ["p003", "p004"] },
    { title: "Solution", code: "c005", after: ["p006"], run: ["variance([4, 5, 6])", "variance([1, 5, 9])", "mean([])  # raises ZeroDivisionError"] },
  ],
};

function manifestFor(extra = {}) {
  return {
    title: "Averages Without Hiding the Spread",
    thesis: "A mean is one number standing in for a whole list, and that is its danger.",
    source: "fixtures/own-code-chapter.md",
    segments: [
      { id: "01", title: "The hook", mp4: "segments/01/segment.mp4", vtt: "segments/01/segment.vtt" },
      { id: "02", title: "What variance adds", mp4: "segments/02/segment.mp4", vtt: "segments/02/segment.vtt" },
      { id: "03", title: "Your turn", mp4: "segments/03/segment.mp4", vtt: "segments/03/segment.vtt" },
    ],
    notebook: NOTEBOOK,
    ...extra,
  };
}

const build = (manifest = manifestFor()) =>
  nb.buildNotebook({ chapter: chapterJson(`nb${Math.random().toString(36).slice(2, 8)}`), manifest, readSegmentFile: () => null });
const cellText = (notebook) => notebook.cells.map((c) => `${c.cell_type}: ${c.source.join("")}`).join("\n---\n");

test("notebook: it is valid nbformat 4 with unique cell ids, and building it runs nothing", () => {
  const { notebook, problems } = build();
  assert.deepEqual(problems, []);
  assert.equal(notebook.nbformat, 4);
  assert.equal(notebook.metadata.kernelspec.name, "python3");
  const ids = notebook.cells.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "nbformat 4.5 needs unique cell ids");
  for (const c of notebook.cells.filter((c) => c.cell_type === "code")) {
    assert.deepEqual(c.outputs, []);
    assert.equal(c.execution_count, null);
  }
});

test("notebook: it follows its own outline: the problem, the solution's code verbatim, its explanation, then example calls", () => {
  const chapter = chapterJson("nb-order");
  const { notebook } = nb.buildNotebook({ chapter, manifest: manifestFor(), readSegmentFile: () => null });
  const by = new Map(chapter.blocks.map((b) => [b.id, b.text]));
  const text = cellText(notebook);
  assert.ok(text.startsWith("markdown: # Variance\n"));
  const order = ["## The problem", by.get("p003"), by.get("p004"), "## Solution", `code: ${by.get("c005")}\n---`, by.get("p006"), "code: variance([4, 5, 6])\n---\ncode: variance([1, 5, 9])"];
  let at = 0;
  for (const piece of order) {
    const i = text.indexOf(piece, at);
    assert.ok(i >= 0, `missing or out of order: ${piece.slice(0, 40)}`);
    at = i;
  }
  assert.match(text, /code: try:\n    mean\(\[\]\)\nexcept ZeroDivisionError as error:\n    print\("ZeroDivisionError:", error\)/);
  const check = nb.checkSyntax(notebook, join(root, ".venv/bin/python"));
  if (check.checked) assert.deepEqual(check.errors, []);
});

test("notebook: nothing about the video, no tracer, no asserts, no ids, and no exercise stubs", () => {
  const text = cellText(build().notebook);
  assert.doesNotMatch(text, /video|\b\d+:\d\d\b|\bassert\b|settrace|steps\(|# source:|computed-by|your code here|Try it/i);
});

test("notebook: executeNotebook runs the cells in order and stores what each printed and returned", () => {
  const py = join(root, ".venv/bin/python");
  if (!existsSync(py)) return "no Python interpreter to run it with";
  const { notebook } = build();
  const run = nb.executeNotebook(notebook, py);
  assert.equal(run.ran, true);
  assert.deepEqual(run.errors, []);
  const out = (src) => notebook.cells.find((c) => c.source.join("") === src).outputs;
  assert.match(out("variance([4, 5, 6])")[0].data["text/plain"].join(""), /^0\.666/);
  assert.equal(out("variance([4, 5, 6])")[0].output_type, "execute_result");
  assert.match(out('try:\n    mean([])\nexcept ZeroDivisionError as error:\n    print("ZeroDivisionError:", error)')[0].text.join(""), /ZeroDivisionError: division by zero/);
  const counts = notebook.cells.filter((c) => c.cell_type === "code").map((c) => c.execution_count);
  assert.deepEqual(counts, counts.map((_, i) => i + 1));
  const broken = { cells: [{ cell_type: "code", source: ["1 / 0"], outputs: [] }] };
  assert.match(nb.executeNotebook(broken, py).errors.join(), /ZeroDivisionError/);
});

test("notebook: no outline, an unknown block, or text that points outside the notebook is a problem", () => {
  assert.match(build(manifestFor({ notebook: undefined })).problems.join(), /no notebook\.sections/);
  assert.match(build(manifestFor({ notebook: { sections: [{ title: "x", text: ["p999"] }] } })).problems.join(), /no block p999/);
  const chapter = { title: "t", blocks: [{ id: "p1", kind: "para", text: "As the next section shows, it is fast." }] };
  const r = nb.buildNotebook({ chapter, manifest: { segments: [], notebook: { sections: [{ title: "x", text: ["p1"] }] } }, readSegmentFile: () => null });
  assert.match(r.problems.join(), /p1 points outside the notebook/);
  // a pointer listed under notebook.trim is cut before the check, so it no longer points anywhere
  const ok = nb.buildNotebook({ chapter, manifest: { segments: [], notebook: { sections: [{ title: "x", text: ["p1"] }], trim: { p1: "As the next section shows, ".split("|") } } }, readSegmentFile: () => null });
  assert.doesNotMatch(ok.problems.join(), /points outside/);
  // REGRESSION (Two Sum notebook): a lettered section and "the follow-ups above" point outside too
  for (const text of ["That is LeetCode 167, in E. Two pointers.", "Keep a count, as in the follow-ups above."]) {
    const c2 = { title: "t", blocks: [{ id: "p2", kind: "para", text }] };
    const r2 = nb.buildNotebook({ chapter: c2, manifest: { segments: [], notebook: { sections: [{ title: "x", text: ["p2"] }] } }, readSegmentFile: () => null });
    assert.match(r2.problems.join(), /p2 points outside the notebook/, text);
  }
});

test("notebook: \"end\" text comes after the section's run cells, \"after\" between the code and the runs", () => {
  const chapter = { title: "t", blocks: [{ id: "p1", kind: "para", text: "Between." }, { id: "p2", kind: "para", text: "Return 3." }] };
  const r = nb.buildNotebook({ chapter, manifest: { segments: [], notebook: { sections: [{ title: "x", after: ["p1"], run: ["f(1)"], end: ["p2"] }] } }, readSegmentFile: () => null });
  const src = r.notebook.cells.map((c) => (Array.isArray(c.source) ? c.source.join("") : c.source));
  assert.ok(src.indexOf("Between.") < src.indexOf("f(1)") && src.indexOf("f(1)") < src.indexOf("Return 3."), src.join(" | "));
});

test("notebook: non-Python code is shown as text, not a cell; a list item loses its number; a dead link label is dropped", () => {
  const chapter = { title: "t", blocks: [
    { id: "c1", kind: "code", lang: "sql", text: "SELECT 1;" },
    { id: "c2", kind: "code", lang: null, text: "x = 1" },
    { id: "l1", kind: "list", text: "2. Sort first: neighbours." },
    { id: "p1", kind: "para", text: "Input limits: 1 ≤ n. Open on LeetCode" },
  ] };
  const { notebook, skipped } = nb.buildNotebook({ chapter, manifest: { segments: [], notebook: { sections: [{ title: "x", text: ["l1", "p1"], code: ["c1", "c2"] }] } }, readSegmentFile: () => null });
  assert.deepEqual(skipped.map((s) => s.id), ["c1", "c2"]);
  assert.ok(!notebook.cells.some((c) => c.cell_type === "code"));
  const text = cellText(notebook);
  assert.match(text, /```sql\nSELECT 1;\n```/);
  assert.match(text, /markdown: Sort first: neighbours\./);
  assert.match(text, /markdown: Input limits: 1 ≤ n\.\n/);
});

test("notebook: invalid Python is caught before it is written", () => {
  const bad = { cells: [{ cell_type: "code", source: ["def f(:\n", "    pass"] }] };
  const check = nb.checkSyntax(bad, join(root, ".venv/bin/python"));
  if (!check.checked) return "no Python interpreter to parse with";
  assert.equal(check.errors.length, 1);
  const magic = { cells: [{ cell_type: "code", source: ["%matplotlib inline\n", "!pip list\n", "x = 1"] }] };
  assert.deepEqual(nb.checkSyntax(magic, join(root, ".venv/bin/python")).errors, [], "IPython magics are not Python");
});

// ── deliver ───────────────────────────────────────────────────────────────────────────────────────

const haveFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
const ff = (args) => spawnSync("ffmpeg", ["-loglevel", "error", "-y", ...args], { encoding: "utf8" });
const dims = (f) =>
  spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim();

/** Three segments of 10.5s at the given size: long enough for YouTube's ten-second chapter rule. */
function buildVideo(dir, { size = "1920x1080", chapterSource = true } = {}) {
  mkdirSync(dir, { recursive: true });
  for (const [i, id] of ["01", "02", "03"].entries()) {
    const seg = join(dir, "segments", id);
    mkdirSync(seg, { recursive: true });
    const colour = ["0x1a3a5a", "0x3a1a5a", "0x1a5a3a"][i];
    ff(["-f", "lavfi", "-i", `color=c=${colour}:size=${size}:rate=10:duration=10.5`,
        "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=10.5",
        "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", join(seg, "segment.mp4")]);
    writeFileSync(join(seg, "segment.vtt"), VTT([["00:01.000", "00:03.000", `Caption ${id}.`]]));
    writeFileSync(join(seg, "script.md"), SCRIPTS[id]);
  }
  write(join(dir, "segments/02/examples/spread.py"), SPREAD_PY);
  writeFileSync(join(dir, "video.json"), JSON.stringify(manifestFor()));
  if (chapterSource) assert.equal(ingest(CHAPTER_MD, join(dir, "chapter.json")).status, 0);
  return dir;
}

const deliver = (dir, ...args) =>
  spawnSync(process.execPath, [join(scripts, "deliver.mjs"), dir, ...args], { encoding: "utf8", cwd: root });
const kitFiles = ["video.mp4", "captions.srt", "chapters.txt", "description.txt", "thumbnail.png", "plan.md"];

test("deliver: it writes the whole upload kit, and the numbers in it agree", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d1"));
  const r = deliver(dir, "--notebook");
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const f of [...kitFiles, "notebook.ipynb"]) assert.ok(existsSync(join(dir, f)), `${f} is missing`);

  assert.equal(readFileSync(join(dir, "chapters.txt"), "utf8"), "0:00 The hook\n0:10 What variance adds\n0:21 Your turn\n");
  assert.equal(dims(join(dir, "thumbnail.png")), "1280,720");
  assert.equal(dims(join(dir, "video.mp4")), "1920,1080");

  const srt = readFileSync(join(dir, "captions.srt"), "utf8");
  assert.match(srt, /00:00:01,000 --> 00:00:03,000\nCaption 01\./);
  assert.match(srt, /00:00:11,\d{3} --> 00:00:13,\d{3}\nCaption 02\./, "segment two starts after segment one");
  assert.match(srt, /00:00:22,\d{3} --> 00:00:24,\d{3}\nCaption 03\./);

  const desc = readFileSync(join(dir, "description.txt"), "utf8");
  assert.match(desc, /0:10 What variance adds/);
  assert.ok(!/not from the chapter/i.test(desc), "the description does not label examples");
  assert.match(desc, /Jupyter notebook/);
  assert.ok(!/not from the chapter/i.test(readFileSync(join(dir, "captions.srt"), "utf8")), "nor do the captions");

  const plan = readFileSync(join(dir, "plan.md"), "utf8");
  assert.match(plan, /Example \(derived, not from the chapter\): "Scene — two lists, one mean", computed by `examples\/spread\.py`/);
  assert.match(plan, /\| 02 \| Scene — variance \| Here is the function\. \| `c005` \|/);
  assert.ok(!existsSync(join(dir, "work")), "work/ is cleaned");
});

test("deliver: without --notebook there is no notebook and the description does not mention one", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d2"));
  assert.equal(deliver(dir).status, 0);
  assert.ok(!existsSync(join(dir, "notebook.ipynb")));
  assert.ok(!/notebook/.test(readFileSync(join(dir, "description.txt"), "utf8")));
});

test("deliver: a segment that is not 1920x1080 stops delivery before anything is written", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d3"), { size: "1280x720" });
  const r = deliver(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /is 1280x720, not 1920x1080/);
  for (const f of kitFiles) assert.ok(!existsSync(join(dir, f)), `${f} was written despite the failure`);
});

test("deliver: an unsourced line stops delivery, and nothing is stitched", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d4"));
  writeFileSync(join(dir, "segments/01/script.md"),
    `## Scene — hook\nvisual: plot (tier 1)\nduration: ~20s\n\n- spoken: "Ninety-three percent of lists have a spread."\n`);
  const r = deliver(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing to deliver/);
  for (const f of kitFiles) assert.ok(!existsSync(join(dir, f)), `${f} was written despite the failure`);
});

test("deliver: with a channel.json, a script that names the book, or the wrong voice, stops delivery", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "dch"));
  writeFileSync(join(dir, "channel.json"), JSON.stringify({ voice: "af_heart:0.7,af_bella:0.3", banned_terms: [".docx"] }));
  writeFileSync(join(dir, "segments/01/script.md"),
    `## Scene — hook\nvisual: plot (tier 1)\nduration: ~20s\n\n- spoken: "Here is the chapter's example."\n  display: "Here is the chapter's example."\n  source: [p001]\n`);
  mkdirSync(join(dir, "segments/02/video"), { recursive: true });
  writeFileSync(join(dir, "segments/02/video/audio_meta.json"), JSON.stringify({ voice_id: "af_heart", voices: [] }));
  const r = deliver(dir);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /says "chapter", which this video must not/);
  assert.match(r.stderr, /part 02 was narrated as af_heart; channel\.json says af_heart:0\.7,af_bella:0\.3/);
  for (const f of kitFiles) assert.ok(!existsSync(join(dir, f)), `${f} was written despite the failure`);
});

test("deliver: a derived example that names no computed-by script stops delivery", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d5"));
  writeFileSync(join(dir, "segments/02/script.md"),
    scene("two lists", { visual: "worked example", extra: "example: derived\n" }, [["Two lists, one mean.", "p004"]]));
  const r = deliver(dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /names no computed-by/);
  for (const f of kitFiles) assert.ok(!existsSync(join(dir, f)), `${f} was written despite the failure`);
});

test("deliver: a derived example whose script is missing stops delivery", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d6"));
  rmSync(join(dir, "segments/02/examples/spread.py"));
  const r = deliver(dir, "--notebook");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /examples\/spread\.py, which is missing/);
});

// The automatic pick is the longest still span, which can land mid-animation under a caption. The
// manifest can name a frame instead, and a bad name must fail before anything is written.
test("deliver: the manifest can pick the thumbnail frame", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d10"));
  const m = JSON.parse(readFileSync(join(dir, "video.json"), "utf8"));
  m.thumbnail = { segment: "02", at: 3 };
  writeFileSync(join(dir, "video.json"), JSON.stringify(m));
  const r = deliver(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /thumbnail\.png from 02 at 3\.00s/);
  assert.equal(dims(join(dir, "thumbnail.png")), "1280,720");
});

test("deliver: a thumbnail naming a missing segment or a time outside it stops delivery", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  for (const [name, thumb, msg] of [
    ["d11", { segment: "09", at: 1 }, /thumbnail names segment "09"/],
    ["d12", { segment: "01", at: 99 }, /thumbnail time 99 is outside segment 01/],
    ["d13", { segment: "01", at: -1 }, /thumbnail time -1 is outside segment 01/],
  ]) {
    const dir = buildVideo(join(tmp, name));
    const m = JSON.parse(readFileSync(join(dir, "video.json"), "utf8"));
    m.thumbnail = thumb;
    writeFileSync(join(dir, "video.json"), JSON.stringify(m));
    const r = deliver(dir);
    assert.equal(r.status, 1, name);
    assert.match(r.stderr, msg);
    for (const f of kitFiles) assert.ok(!existsSync(join(dir, f)), `${f} was written despite the failure`);
  }
});

test("deliver: --dry-run prints the chapters and writes nothing", () => {
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d7"));
  const r = deliver(dir, "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0:10 What variance adds/);
  for (const f of kitFiles) assert.ok(!existsSync(join(dir, f)), `${f} was written in a dry run`);
});

test("deliver: a missing manifest, segment or VTT is reported", () => {
  const empty = join(tmp, "d8");
  mkdirSync(empty, { recursive: true });
  assert.match(deliver(empty).stderr, /no video\.json/);
  if (!haveFfmpeg) return "ffmpeg is unavailable";
  const dir = buildVideo(join(tmp, "d9"));
  rmSync(join(dir, "segments/02/segment.vtt"));
  assert.match(deliver(dir).stderr, /segment 02: segments\/02\/segment\.vtt is not there/);
  rmSync(join(dir, "segments/03/segment.mp4"));
  rmSync(join(dir, "segments/02/segment.mp4"));
  assert.match(deliver(dir).stderr, /step 4 has not finished/);
});

// ── the core boundary ─────────────────────────────────────────────────────────────────────────────

// One copy of core's references: the skill reads them through a symlink, so there is nothing to drift.
test("core: the skill reads core's references in place, not a copy", () => {
  const link = join(root, "skills/chalk-youtube/references/core");
  assert.ok(lstatSync(link).isSymbolicLink(), "references/core must be a symlink into core/references");
  assert.equal(realpathSync(link), realpathSync(join(root, "../../core/references")));
});

test("core: no script is left behind that core now owns", () => {
  for (const f of ["ingest", "check-readability", "build-tokens", "align-captions", "emit-vtt", "fix-index", "manim-render"]) {
    assert.ok(!existsSync(join(scripts, `${f}.mjs`)), `${f}.mjs belongs to chalk-core`);
  }
});

// ── run ───────────────────────────────────────────────────────────────────────────────────────────

let failed = 0;
let skipped = 0;
for (const [name, fn] of tests) {
  try {
    const note = await fn();
    if (typeof note === "string") {
      skipped++;
      console.log(`  skip  ${name} (${note})`);
    } else console.log(`  ok    ${name}`);
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
