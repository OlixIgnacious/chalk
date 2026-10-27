#!/usr/bin/env node
// evals.mjs — the eval pipeline judges its own fixtures correctly.
//
//   node test/evals.mjs        (part of npm test)
//
// `good/` walks the whole teaching arc and must pass every criterion that can run on text alone.
// `bad/` repeats the first Seen-Set video's mistakes on a toy topic — the book named aloud, code shown
// whole, no trace, a stretch part with no solution, the wrong voice — and must fail exactly those groups.
// `rushed/` repeats what the reviewer found in the learning-first remake, which the eval then scored 100%:
// the insight told inside "think", a problem part leaning on the interview answer, a four-idea outline
// row, another way's code paraphrased, a meta line cited to the wrong block, a part narrated too fast and
// a reason drawn at 28px. It must fail exactly those criteria and nothing else.
// Fixtures are original text, never a book.

import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { cpSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { evaluate } = await import(pathToFileURL(join(root, "evals/run.mjs")).href);
const fx = (n) => join(root, "evals/fixtures/youtube", n);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const failing = (r) => r.results.filter((x) => x.status === "fail").map((x) => x.id);

test("good fixture passes every criterion that runs", () => {
  const r = evaluate(fx("good"));
  assert.deepEqual(failing(r), [], JSON.stringify(r.results.filter((x) => x.status === "fail"), null, 2));
  assert.equal(r.percent, 100);
});

test("bad fixture fails exactly orientation, teaching, bonus and voice", () => {
  const r = evaluate(fx("bad"));
  const groups = Object.entries(r.groups).filter(([, s]) => s === "fail").map(([g]) => g).sort();
  assert.deepEqual(groups, ["bonus", "orientation", "teaching", "voice"]);
  for (const id of ["O1", "O2", "O4", "O6", "T1", "T2", "T3", "B1", "V1"]) assert.ok(failing(r).includes(id), `${id} should fail`);
});

test("bad fixture: the book named aloud is caught with its line", () => {
  const o1 = evaluate(fx("bad")).results.find((x) => x.id === "O1");
  assert.ok(o1.evidence.some((e) => /segments\/01\/script\.md:\d+ spoken: "chapter"/i.test(e)), o1.evidence.join("\n"));
  assert.ok(o1.evidence.some((e) => /"book"/i.test(e)));
});

test("bad fixture: a stretch part with no code is an explanation without a solution", () => {
  const b1 = evaluate(fx("bad")).results.find((x) => x.id === "B1");
  assert.match(b1.evidence.join("\n"), /Stretch: very long lists.*without a solution/);
});

test("rushed fixture fails exactly what only the reviewer used to catch", () => {
  const r = evaluate(fx("rushed"));
  assert.deepEqual(failing(r).sort(), ["E4", "G4", "R5", "T1", "T6", "T7", "T8"]);
  const ev = (id) => r.results.find((x) => x.id === id).evidence.join("\n");
  assert.match(ev("T1"), /missing stages: insight/);
  assert.match(ev("T6"), /c003 shows 4 lines but 1 narrated line/);
  assert.match(ev("T7"), /segments\/01\/script\.md:\d+: cites p008, which is taught only in interview/);
  assert.match(ev("T8"), /part 02 .* teaches 4 things/);
  assert.match(ev("E4"), /segments\/02: 3\.33 words\/s/);
  assert.match(ev("R5"), /"so it is counted once" is 28px/);
});

const lfx = (n) => join(root, "evals/fixtures/lesson", n);

test("lesson good fixture passes the lesson pack and the shared criteria", () => {
  const r = evaluate(lfx("good"), { format: "lesson" });
  assert.deepEqual(failing(r), [], JSON.stringify(r.results.filter((x) => x.status === "fail"), null, 2));
  assert.ok(!r.results.some((x) => x.id.startsWith("O") || x.id.startsWith("T")), "no YouTube criteria on a lesson");
});

test("lesson bad fixture: a two-idea objective, a missing option, a checkpoint from elsewhere, a term used early", () => {
  const r = evaluate(lfx("bad"), { format: "lesson" });
  assert.deepEqual(failing(r).sort(), ["L1", "L2", "L3"]);
  const ev = (id) => r.results.find((x) => x.id === id).evidence.join("\n");
  assert.match(ev("L1"), /segment 01: the objective is more than one idea/);
  assert.match(ev("L1"), /segment 02: the answer index 3/);
  assert.match(ev("L2"), /rests on p006/);
  assert.match(ev("L3"), /"running total" before segment 02/);
});

test("lesson: the page must reference every segment, and every segment must be on disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-lesson-"));
  cpSync(lfx("good"), dir, { recursive: true });
  writeFileSync(join(dir, "segments/01/segment.mp4"), "x");
  writeFileSync(join(dir, "lesson.html"), '<video src="segments/01/segment.mp4"></video>');
  const l4 = evaluate(dir, { format: "lesson" }).results.find((x) => x.id === "L4");
  rmSync(dir, { recursive: true, force: true });
  assert.equal(l4.status, "fail");
  assert.match(l4.evidence.join("\n"), /segments\/02\/segment\.mp4 is not there/);
  assert.match(l4.evidence.join("\n"), /never references segments\/02\/segment\.mp4/);
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
console.log(`\n${tests.length - failed}/${tests.length} eval tests passed`);
process.exit(failed ? 1 : 0);
