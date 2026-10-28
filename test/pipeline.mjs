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
import { FORMATS } from "../pipeline/stages.mjs";
import { run, approve, status, context, plan } from "../pipeline/run.mjs";

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
  { name: "narrate", kind: "run", per: "segment", jobs: true, inputs: (o, nn) => [`segments/${nn}/script.md`],
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

test("status shows a stage that looks done as waiting while an upstream stage will rewrite its input", () => {
  writeFileSync(join(out, "segments/01/script.md"), "script 01, rewritten\n");
  const rows = plan(context(out, {}), "toy");
  const cell = (name, nn) => rows.find((r) => r.stage.name === name).cells.find((c) => c.nn === nn);
  assert.equal(cell("narrate", "01").status, "stale");
  assert.equal(cell("frames", "01").after, "narrate", "frames 01 waits for the new take");
  assert.equal(cell("frames", "00").status, "done", "segment 00 is not touched by 01's script");
  assert.equal(cell("spec", "01").status, "done", "a frame spec does not go stale with its take");
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

let failed = 0;
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
