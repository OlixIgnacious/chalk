#!/usr/bin/env node
// evals.mjs — the eval pipeline judges its own fixtures correctly.
//
//   node test/evals.mjs        (part of npm test)
//
// `good/` walks the whole teaching arc and must pass every criterion that can run on text alone.
// `bad/` repeats the first Seen-Set video's mistakes on a toy topic — the book named aloud, code shown
// whole, no trace, a stretch part with no solution, the wrong voice — and must fail exactly those groups.
// Fixtures are original text, never a book.

import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const { evaluate } = await import(pathToFileURL(join(root, "evals/run.mjs")).href);
const fx = (n) => join(root, "evals/fixtures", n);

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
