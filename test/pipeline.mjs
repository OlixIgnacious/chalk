#!/usr/bin/env node
// pipeline.mjs — the runner reruns exactly what changed: a script redoes its segment's voice and what
// follows, a frame spec only its frames, an aligner fix only alignment; a second run with nothing changed
// does nothing; it stops for a person at an approval, and again when what was approved changes.
//
// The stages here are a toy format with the YouTube build's shape, whose commands are tiny `node -e`
// scripts, so the logic is tested without Kokoro or a render.

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, appendFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FORMATS, SOURCE_CHECK_SINCE } from "../pipeline/stages.mjs";
import { sourceHash, blockHash } from "../core/scripts/facts.mjs";
import { run, approve, status, statusJson, context, plan, hashPath, hashStats } from "../pipeline/run.mjs";

const tmp = mkdtempSync(join(tmpdir(), "chalk-pipeline-"));
const ALIGNER = join(tmp, "aligner.mjs"); // stands in for core's align-captions.mjs
writeFileSync(ALIGNER, "// v1\n");
const LOG = join(tmp, "ran.log");

/** A command that logs that it ran and writes `out` from its inputs `from`, so new inputs give a new output. */
const step = (name, out, from = []) => ["node", "-e",
  `const f=require("fs");f.mkdirSync(require("path").dirname(${JSON.stringify(out)}),{recursive:true});` +
  `f.writeFileSync(${JSON.stringify(out)}, ${JSON.stringify([from].flat())}.map((p)=>f.readFileSync(p,"utf8")).join("")+"${name}\\n");` +
  `f.appendFileSync(${JSON.stringify(LOG)}, "${name}\\n")`];

FORMATS.toy = [
  { name: "scripts", kind: "author", inputs: () => [], missing: "scripts",
    outputs: (o) => (o.segments.length ? o.segments.map((nn) => `segments/${nn}/script.md`) : ["segments/00/script.md"]) },
  { name: "gates", kind: "run", inputs: (o) => o.segments.map((nn) => `segments/${nn}/script.md`), outputs: () => [],
    cmd: () => ["node", "-e", `require("fs").appendFileSync(${JSON.stringify(LOG)}, "gates\\n")`] },
  { name: "approved", kind: "approve", inputs: (o) => o.segments.map((nn) => `segments/${nn}/script.md`), missing: "your approval" },
  // narration depends on the script's first line only (in the real stages: its spoken lines), so a note added
  // below it, like a citation, does not re-narrate
  { name: "narrate", kind: "run", per: "segment", jobs: true, inputs: (o, nn) => [{ path: `segments/${nn}/script.md`, as: "said", only: (t) => t.split("\n")[0] }],
    outputs: (o, nn) => [`work/${nn}/words.json`], cmd: (o, nn) => step(`narrate ${nn}`, `work/${nn}/words.json`, `segments/${nn}/script.md`) },
  { name: "align", kind: "run", per: "segment", inputs: (o, nn) => [`work/${nn}/words.json`, ALIGNER],
    outputs: (o, nn) => [`work/${nn}/captions.json`], cmd: (o, nn) => step(`align ${nn}`, `work/${nn}/captions.json`, [`work/${nn}/words.json`, ALIGNER]) },
  { name: "spec", kind: "author", per: "segment", inputs: () => [], outputs: (o, nn) => [`frames/s${nn}.py`], missing: "frames/sNN.py" },
  { name: "frames", kind: "run", per: "segment", inputs: (o, nn) => [`frames/s${nn}.py`, `work/${nn}/captions.json`],
    outputs: (o, nn) => [`segments/${nn}/index.html`], cmd: (o, nn) => step(`frames ${nn}`, `segments/${nn}/index.html`, [`frames/s${nn}.py`, `work/${nn}/captions.json`]) },
  { name: "deliver", kind: "run", inputs: (o) => o.segments.map((nn) => `segments/${nn}/index.html`),
    outputs: () => ["video.mp4"], cmd: (o) => step("deliver", "video.mp4", o.segments.map((nn) => `segments/${nn}/index.html`)) },
];

const out = join(tmp, "out");
const quiet = async (f) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await f();
  } finally {
    console.log = log;
  }
};
const go = (opts = {}) => quiet(() => run(out, { format: "toy", ...opts }));
const ran = () => {
  const r = existsSync(LOG) ? readFileSync(LOG, "utf8").trim().split("\n").filter(Boolean) : [];
  rmSync(LOG, { force: true });
  return r.sort();
};

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("it stops for missing scripts, then for approval, then runs everything once", async () => {
  mkdirSync(out, { recursive: true });
  assert.equal(await go(), 3, "no scripts yet: waiting");
  for (const nn of ["00", "01"]) {
    mkdirSync(join(out, "segments", nn), { recursive: true });
    writeFileSync(join(out, "segments", nn, "script.md"), `script ${nn}\n`);
  }
  assert.equal(await go(), 3, "waiting for approval");
  assert.deepEqual(ran(), ["gates"]);
  approve(out, "approved", { format: "toy" });
  assert.equal(await go(), 3, "waiting for frame specs");
  assert.deepEqual(ran(), ["align 00", "align 01", "narrate 00", "narrate 01"]);
  mkdirSync(join(out, "frames"), { recursive: true });
  for (const nn of ["00", "01"]) writeFileSync(join(out, "frames", `s${nn}.py`), "# spec\n");
  assert.equal(await go(), 0);
  assert.deepEqual(ran(), ["deliver", "frames 00", "frames 01"]);
});

test("a second run with nothing changed does nothing", async () => {
  assert.equal(await go(), 0);
  assert.deepEqual(ran(), []);
});

test("a changed frame spec redoes only that segment's frames, then the video", async () => {
  appendFileSync(join(out, "frames/s01.py"), "# moved a label\n");
  assert.equal(await go(), 0);
  assert.deepEqual(ran(), ["deliver", "frames 01"]);
});

test("an aligner fix redoes alignment and what follows, never the narration", async () => {
  writeFileSync(ALIGNER, "// v2: a homophone\n");
  assert.equal(await go(), 0);
  assert.deepEqual(ran(), ["align 00", "align 01", "deliver", "frames 00", "frames 01"]);
});

test("a changed script stops for approval again, then redoes only that segment", async () => {
  writeFileSync(join(out, "segments/00/script.md"), "script 00, rewritten\n");
  const s = status(out, { format: "toy" });
  assert.match(s, /narrate\s+00 — after gates/);
  assert.doesNotMatch(s, /narrate.*01/, "segment 01 is untouched");
  assert.equal(await go(), 3, "an edited script needs your review again");
  assert.deepEqual(ran(), ["gates"]);
  approve(out, "approved", { format: "toy" });
  assert.equal(await go(), 0);
  assert.deepEqual(ran(), ["align 00", "deliver", "frames 00", "narrate 00"]);
});

test("narration hashes only what it reads: a line the voice never says leaves it done", async () => {
  appendFileSync(join(out, "segments/01/script.md"), "source: [p001]\n");
  assert.equal(await go(), 3, "the script changed, so it waits for approval");
  approve(out, "approved", { format: "toy" });
  assert.equal(await go(), 0);
  assert.deepEqual(ran(), ["gates"], "no narration, alignment or frames for a line that is not spoken");
});

test("status shows a stage that looks done as waiting while an upstream stage will rewrite its input", () => {
  writeFileSync(join(out, "segments/01/script.md"), "script 01, rewritten\n");
  const rows = plan(context(out, {}), "toy");
  const cell = (name, nn) => rows.find((r) => r.stage.name === name).cells.find((c) => c.nn === nn);
  assert.equal(cell("narrate", "01").status, "stale");
  assert.equal(cell("frames", "01").after, "narrate", "frames 01 waits for the new take");
  assert.equal(cell("frames", "00").status, "done", "segment 00 is not touched by 01's script");
  assert.equal(cell("spec", "01").status, "done", "a frame spec does not go stale with its take");
});

test("status --json carries the same picture as status, for the UI", () => {
  const j = statusJson(out, { format: "toy" });
  assert.equal(j.format, "toy");
  assert.deepEqual(j.stages.map((s) => s.name), FORMATS.toy.map((s) => s.name));
  const narrate = j.stages.find((s) => s.name === "narrate");
  assert.equal(narrate.per, "segment");
  assert.equal(narrate.cells.find((c) => c.nn === "01").status, "stale");
  assert.equal(j.stages.find((s) => s.name === "frames").cells.find((c) => c.nn === "01").after, "narrate");
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(j)));
});

test("the hash cache gives the same hash, re-reads only what changed, and still sees a change", () => {
  const dir = join(tmp, "hashed");
  mkdirSync(join(dir, "sub"), { recursive: true });
  writeFileSync(join(dir, "big.bin"), "x".repeat(1 << 20));
  writeFileSync(join(dir, "sub/a.txt"), "a\n");
  const cache = { data: {}, dirty: false };
  const plain = hashPath(dir);
  assert.equal(hashPath(dir, cache), plain, "cached and uncached hashes agree");
  const before = hashStats.reads;
  assert.equal(hashPath(dir, cache), plain);
  assert.equal(hashStats.reads, before, "nothing re-read when nothing changed");
  writeFileSync(join(dir, "sub/a.txt"), "b\n");
  const changed = hashPath(dir, cache);
  assert.notEqual(changed, plain, "a same-size edit still changes the hash");
  assert.equal(changed, hashPath(dir));
});

test("--from reruns a stage and everything after it, --only limits it to those segments", async () => {
  approve(out, "approved", { format: "toy" });
  await go();
  ran();
  assert.equal(await go({ from: "frames", only: ["00"] }), 0);
  assert.deepEqual(ran(), ["deliver", "frames 00"]);
});

test("an agent's report waits again once anything it read is newer than it", async () => {
  FORMATS.toy.push({ name: "report", kind: "author", inputs: () => [], outputs: () => ["report.md"],
    newerThan: ["video.mp4", "segments/00/script.md"], missing: "the report" });
  assert.equal(await go(), 3, "no report yet");
  writeFileSync(join(out, "report.md"), "fine\n");
  assert.equal(await go(), 0);
  const later = new Date(Date.now() + 5000);
  writeFileSync(join(out, "segments/00/script.md"), "script 00, again\n");
  utimesSync(join(out, "segments/00/script.md"), later, later);
  approve(out, "approved", { format: "toy" });
  assert.equal(await go(), 3, "the report predates the new script");
  assert.match(status(out, { format: "toy" }), /report\.md is older than/);
  ran();
});

test("pipeline-debt: an earlier build's open items hold a new build's frame specs until each names a real commit or a deferral", async () => {
  const { REPO } = await import("../pipeline/stages.mjs");
  const { spawnSync } = await import("node:child_process");
  const head = spawnSync("git", ["-C", REPO, "rev-parse", "--short=10", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const ws = mkdtempSync(join(tmpdir(), "chalk-debt-"));
  writeFileSync(join(ws, "channel.json"), "{}");
  const old = join(ws, "youtube-output/old"), now = join(ws, "youtube-output/new");
  for (const d of [old, now]) { mkdirSync(join(d, "segments/00"), { recursive: true }); writeFileSync(join(d, "segments/00/script.md"), "# x\n"); }
  const gate = FORMATS.youtube.find((s) => s.name === "pipeline-debt");
  const res = (lines) => writeFileSync(join(old, "resolution.md"), `# Resolution\n\n## Do next\n- [ ] not a pipeline item\n\n## Pipeline\n${lines.join("\n")}\n`);

  res(["- [ ] F.pointer_walk in framelib", "- [x] N3 — deferred: needs a fixture first"]);
  let c = gate.gate(context(now));
  assert.equal(c.status, "waiting");
  assert.match(c.why, /1 pipeline item.*F\.pointer_walk/s);
  assert.doesNotMatch(c.why, /not a pipeline item|N3/, "only the Pipeline section, and a deferral is closed");
  assert.equal(gate.gate(context(old)).status, "done", "a build's own items are for the next one");

  res(["- [x] F.pointer_walk in framelib"]);
  assert.match(gate.gate(context(now)).why, /names no commit/, "a tick alone does not close it");
  res(["- [x] F.pointer_walk in framelib — abc1234def"]);
  assert.match(gate.gate(context(now)).why, /not a commit in chalk/, "nor does a made-up sha");
  res([`- [x] F.pointer_walk in framelib — ${head}`]);
  assert.equal(gate.gate(context(now)).status, "done", "a commit that exists closes it");

  res(["- [ ] F.pointer_walk in framelib"]);
  mkdirSync(join(now, "frames"), { recursive: true });
  writeFileSync(join(now, "frames/s00.py"), "# spec\n");
  assert.equal(gate.gate(context(now)).status, "done", "a build whose frame specs are written is past the gate");
  rmSync(ws, { recursive: true, force: true });
});

test("a frame spec edited after grounding.md makes grounding wait again, without taking back the scripts' approval", async () => {
  const { check } = await import("../pipeline/run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "chalk-gframes-"));
  mkdirSync(join(dir, "segments/00"), { recursive: true });
  mkdirSync(join(dir, "frames"), { recursive: true });
  for (const f of ["segments/00/script.md", "outline.md", "chapter.json", "frames/s00.py"]) writeFileSync(join(dir, f), "x\n");
  writeFileSync(join(dir, "grounding.md"), "r1\n");
  const st = (name) => FORMATS.youtube.find((s) => s.name === name);
  const later = new Date(Date.now() + 5000);
  utimesSync(join(dir, "grounding.md"), later, later);
  approve(dir, "scripts");
  assert.equal(check(context(dir), st("grounding-frames")).status, "done");
  const evenLater = new Date(Date.now() + 10000);
  utimesSync(join(dir, "frames/s00.py"), evenLater, evenLater);
  const c = check(context(dir), st("grounding-frames"));
  assert.equal(c.status, "waiting");
  assert.match(c.why, /older than frames\/s00\.py/);
  writeFileSync(join(dir, "grounding.md"), "r2, frames too\n");
  assert.equal(check(context(dir), st("scripts-approved")).status, "done", "a new grounding report does not undo the approval");

  for (const f of ["eval.json", "learner.md", "review.md"]) writeFileSync(join(dir, f), "x\n");
  assert.equal(check(context(dir), st("review")).status, "done");
  writeFileSync(join(dir, "notebook-review.md"), "x\n");
  utimesSync(join(dir, "notebook-review.md"), evenLater, evenLater);
  assert.match(check(context(dir), st("review")).why, /older than notebook-review\.md/);
  rmSync(dir, { recursive: true, force: true });
});

test("learner-scripts: read-aloud gives the viewer's view only, and the stage waits until a learner has read these scripts", async () => {
  const { readAloud } = await import("../pipeline/read-aloud.mjs");
  const { check } = await import("../pipeline/run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "chalk-lscripts-"));
  mkdirSync(join(dir, "segments/00"), { recursive: true });
  writeFileSync(join(dir, "chapter.json"), JSON.stringify({ blocks: [{ id: "c001", kind: "code", text: "x = 1" }] }));
  writeFileSync(join(dir, "segments/00/script.md"), "# 00 — Start\n\n## Scene 1 — one\nvisual: code build (tier 1)\nstage: insight\ncode: c001\n" +
    "on-screen: x is one\n\n- spoken: \"Set x {pause} to one.\"\n  display: \"Set x to one.\"\n  source: [c001]\n");
  const text = readAloud(dir);
  assert.match(text, /## Part 00 — Start/);
  assert.match(text, /\[on screen: x is one\]/);
  assert.match(text, /x = 1/, "the code on screen");
  assert.match(text, /Set x to one\./);
  assert.doesNotMatch(text, /c001\]|source|insight|code build|\{pause\}/, "no citations, stages, visual notes or markers");

  const st = FORMATS.youtube.find((s) => s.name === "learner-scripts");
  assert.equal(check(context(dir), st).status, "waiting");
  const later = new Date(Date.now() + 5000);
  writeFileSync(join(dir, "learner-scripts.md"), "x\n");
  utimesSync(join(dir, "learner-scripts.md"), later, later);
  assert.equal(check(context(dir), st).status, "done");
  const evenLater = new Date(Date.now() + 10000);
  utimesSync(join(dir, "segments/00/script.md"), evenLater, evenLater);
  assert.match(check(context(dir), st).why, /older than a script/);
  writeFileSync(join(dir, "learner.md"), "watched the render of these scripts\n");
  utimesSync(join(dir, "learner.md"), new Date(Date.now() + 15000), new Date(Date.now() + 15000));
  assert.equal(check(context(dir), st).status, "done", "a learner who watched these scripts rendered has read them");
  rmSync(dir, { recursive: true, force: true });
});

let failed = 0;
test("youtube frames depend on the part list and every listed part's stage, so cutting a part redoes them all", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-frames-in-"));
  writeFileSync(join(dir, "video.json"), JSON.stringify({ segments: [{ id: "00" }, { id: "02" }], accepted: { E3: "x" } }));
  const frames = FORMATS.youtube.find((st) => st.name === "frames");
  const ins = frames.inputs({ out: dir }, "00");
  const vj = ins.find((p) => typeof p === "object" && p.path === "video.json");
  assert.ok(vj, "video.json is an input");
  // the part list counts; a waiver does not
  const a = vj.only(JSON.stringify({ segments: [{ id: "00" }, { id: "02" }], accepted: { E3: "x" } }));
  assert.equal(a, vj.only(JSON.stringify({ segments: [{ id: "00" }, { id: "02" }], accepted: {} })));
  assert.notEqual(a, vj.only(JSON.stringify({ segments: [{ id: "00" }] })));
  // only listed parts' stage lines, not a cut folder's
  const stagePaths = ins.filter((p) => typeof p === "object" && p.as === "stage").map((p) => p.path);
  assert.deepEqual(stagePaths, ["segments/00/script.md", "segments/02/script.md"]);
  rmSync(dir, { recursive: true, force: true });
});

test("a part cut from video.json is no longer built, though its folder stays", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-cut-"));
  for (const id of ["00", "01", "02"]) { mkdirSync(join(dir, "segments", id), { recursive: true }); writeFileSync(join(dir, "segments", id, "script.md"), "# x\n"); }
  writeFileSync(join(dir, "video.json"), JSON.stringify({ segments: [{ id: "00" }, { id: "02" }] }));
  assert.deepEqual(context(dir).segments, ["00", "02"]);
  rmSync(dir, { recursive: true, force: true });
});

test("adopt leaves a stage stale when its output is older than an input (a render older than its rebuilt frames)", async () => {
  const { adopt } = await import("../pipeline/run.mjs");
  const dir = mkdtempSync(join(tmpdir(), "chalk-adopt-"));
  mkdirSync(join(dir, "segments/00/video/compositions"), { recursive: true });
  writeFileSync(join(dir, "segments/00/script.md"), "# x\n");
  writeFileSync(join(dir, "video.json"), JSON.stringify({ segments: [{ id: "00" }] }));
  for (const f of ["segment.mp4", "segment.vtt"]) writeFileSync(join(dir, "segments/00", f), "old render");
  const past = new Date(Date.now() - 60_000);
  for (const f of ["segment.mp4", "segment.vtt"]) utimesSync(join(dir, "segments/00", f), past, past);
  writeFileSync(join(dir, "segments/00/video/index.html"), "<new frames/>");
  writeFileSync(join(dir, "segments/00/video/caption_groups.json"), "[]");
  adopt(dir);
  const state = JSON.parse(readFileSync(join(dir, ".chalk/pipeline.json"), "utf8"));
  assert.equal((state.stages ?? state)["render:00"], undefined, "the old render is not adopted");
  rmSync(dir, { recursive: true, force: true });
});

test("source-check: it waits for facts.md, for one that checked this version of the source, and on a contradiction until it is waived", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-facts-"));
  const blocks = [{ id: "p001", kind: "paragraph", text: "The bridge opened in 1937." }, { id: "p002", kind: "paragraph", text: "Walk on." }];
  writeFileSync(join(dir, "chapter.json"), JSON.stringify({ source: "t.md", blocks }));
  const gate = () => FORMATS.youtube.find((s) => s.name === "source-check").gate(context(dir));
  for (const f of ["youtube", "lesson", "short"]) {
    const names = FORMATS[f].map((s) => s.name);
    assert.equal(names[names.indexOf("ingest") + 1], "source-check", `${f}: the source is checked right after ingest`);
  }
  assert.equal(gate().status, "waiting");
  assert.match(gate().why, /chalk-factcheck/);
  const facts = (h, verdict) => `# Facts\n\nsource: ${h}\n\n| id | block | claim | verdict | evidence |\n|---|---|---|---|---|\n| F1 | p001 | opened 1937 | ${verdict} | x |\n`;
  writeFileSync(join(dir, "facts.md"), facts("0123456789abcdef", "supported"));
  assert.equal(gate().status, "waiting", "facts.md for another version of the source");
  writeFileSync(join(dir, "facts.md"), facts(sourceHash({ blocks }), "contradicted"));
  assert.match(gate().why, /F1 is contradicted/);
  writeFileSync(join(dir, "facts-accepted.md"), `| id | block | block-hash | reason |\n|---|---|---|---|\n| F1 | p001 | ${blockHash(blocks[0])} | course figure |\n`);
  assert.equal(gate().status, "done");
  // a rewrite of chapter.json with the same text (ingest's own code changed) does not re-run the check
  writeFileSync(join(dir, "chapter.json"), JSON.stringify({ source: "t.md", ingested: "again", blocks }));
  assert.equal(gate().status, "done");
  rmSync(dir, { recursive: true, force: true });
});

test("source-check: a build ingested before the check existed, or already watched, is not held for a facts.md it never had", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-facts-old-"));
  writeFileSync(join(dir, "chapter.json"), JSON.stringify({ blocks: [{ id: "p001", kind: "paragraph", text: "In 1937." }] }));
  const gate = () => FORMATS.youtube.find((s) => s.name === "source-check").gate(context(dir));
  const state = (s) => { mkdirSync(join(dir, ".chalk"), { recursive: true }); writeFileSync(join(dir, ".chalk/pipeline.json"), JSON.stringify(s)); };
  state({ stages: { ingest: { hash: "x", at: "2026-01-01T00:00:00Z" } } });
  assert.equal(gate().status, "done", "ingested before " + SOURCE_CHECK_SINCE);
  state({ stages: { ingest: { hash: "x", at: "2099-01-01T00:00:00Z" } } });
  assert.equal(gate().status, "waiting", "a new build is checked");
  state({ stages: { ingest: { hash: "x", at: "2099-01-01T00:00:00Z" } }, approvals: { watched: "h" } });
  assert.equal(gate().status, "done", "an approved, watched build");
  state({ stages: { ingest: { hash: "x", at: "2026-01-01T00:00:00Z" } } });
  writeFileSync(join(dir, "facts.md"), "# Facts\n");
  assert.equal(gate().status, "waiting", "writing facts.md opts an old build in");
  rmSync(dir, { recursive: true, force: true });
});

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${String(err.message).split("\n").join("\n       ")}`);
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${tests.length - failed}/${tests.length} pipeline tests passed`);
process.exit(failed ? 1 : 0);
