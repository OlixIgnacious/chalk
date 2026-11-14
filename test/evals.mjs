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
// a reason drawn at 28px, an unsourced "common" and "thirty seconds". It must fail exactly those criteria and
// nothing else.
// Fixtures are original text, never a book.

import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { cpSync, mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, utimesSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
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
  assert.deepEqual(failing(r).sort(), ["E4", "G4", "G5", "R5", "T1", "T6", "T7", "T8"]);
  assert.match(r.results.find((x) => x.id === "G5").evidence.join("\n"), /"thirty seconds" — no cited block \[p008\]/);
  const ev = (id) => r.results.find((x) => x.id === id).evidence.join("\n");
  assert.match(ev("T1"), /missing stages: insight/);
  assert.match(ev("T6"), /c003 shows 4 lines but 1 narrated line/);
  assert.match(ev("T7"), /segments\/01\/script\.md:\d+: cites p008, which is taught only in interview/);
  assert.match(ev("T8"), /part 02 .* teaches 4 things/);
  assert.match(ev("E4"), /segments\/02 scene 1: 3\.33 words\/s/);
  assert.match(ev("G4"), /segments\/00\/script\.md:\d+: "You'll write it, then trace it\." cites \[c001\]/, "a hook promise is about the video");
  assert.match(ev("R5"), /"so it is counted once" is 28px/);
});

test("E4: narration of other words than the script's is not measured; a citation-only edit still is", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-e4w-"));
  cpSync(fx("rushed"), dir, { recursive: true });
  const md = join(dir, "segments/02/script.md");
  const said = [...readFileSync(md, "utf8").matchAll(/^\s*-\s*spoken:\s*"(.*)"\s*$/gm)].map((m) => m[1]);
  writeFileSync(join(dir, "segments/02/video/SCRIPT.md"), "# SCRIPT\n\n## Line 1\n\n    " + said.join(" ") + "\n");
  const later = new Date(Date.now() + 60000);
  writeFileSync(md, readFileSync(md, "utf8").replace(/source: \[/, "source: [p001, "));
  utimesSync(md, later, later);
  const e4 = () => evaluate(dir).results.find((x) => x.id === "E4").evidence.join("\n");
  assert.match(e4(), /segments\/02 scene/, "only a citation changed: still measured");
  writeFileSync(md, readFileSync(md, "utf8").replace(/spoken: "/, 'spoken: "Now, '));
  assert.doesNotMatch(e4(), /segments\/02 scene/, "a spoken word changed: not measured");
  rmSync(dir, { recursive: true, force: true });
});

test("E4: narration older than its script is not measured (the edited part is voiced again after the text gates)", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-e4-"));
  cpSync(fx("rushed"), dir, { recursive: true });
  const script = join(dir, "segments/02/script.md");
  const later = new Date(Date.now() + 60000);
  utimesSync(script, later, later);
  const e4 = evaluate(dir).results.find((x) => x.id === "E4");
  assert.doesNotMatch(e4.evidence.join("\n"), /segments\/02 scene/, "stale narration is not judged");
  rmSync(dir, { recursive: true, force: true });
});

test("T3: a function read line by line in a code show must be run by that scene's own computed-by script", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-t3-"));
  cpSync(fx("good"), dir, { recursive: true });
  const md = join(dir, "segments/07/script.md");
  writeFileSync(md, readFileSync(md, "utf8").replace("visual: code build (tier 1)", "visual: code show (tier 1)").replace("visual: code + trace (tier 1)", "visual: worked example (tier 1)"));
  const t3 = () => evaluate(dir).results.find((x) => x.id === "T3");
  assert.equal(t3().status, "fail", "an example elsewhere defining it is not enough");
  assert.match(t3().evidence.join("\n"), /c002 is read line by line but the scene runs nothing/);
  writeFileSync(md, readFileSync(md, "utf8").replace("visual: code show (tier 1)", "visual: code show (tier 1)\ncomputed-by: examples/trace_prefix.py"));
  assert.equal(t3().status, "pass", t3().evidence.join("\n"));
  writeFileSync(join(dir, "segments/07/examples/trace_prefix.py"), "print('no function here')\n");
  assert.match(t3().evidence.join("\n"), /does not define def prefix_totals/);
  rmSync(dir, { recursive: true, force: true });
});

test("O5: the last part of a series has no next part to name, and passes", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-o5-"));
  cpSync(fx("good"), dir, { recursive: true });
  const vj = join(dir, "video.json"), v = JSON.parse(readFileSync(vj, "utf8"));
  const parts = [{ id: "a", title: "First" }, { id: v.part_id ?? "last", title: "Last" }];
  writeFileSync(vj, JSON.stringify({ ...v, part_id: parts[1].id }));
  writeFileSync(join(dir, "channel.json"), JSON.stringify({ series: { name: "S", parts } }));
  const o5 = evaluate(dir, { channelPath: join(dir, "channel.json") }).results.find((x) => x.id === "O5");
  assert.equal(o5.status, "pass", o5.evidence.join("\n"));
  assert.match(o5.evidence.join(""), /last part of the series/);
  rmSync(dir, { recursive: true, force: true });
});

test("E2: the pattern's own illustration and values taken from the running example are not new examples", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-e2-"));
  cpSync(fx("good"), dir, { recursive: true });
  const e2 = () => evaluate(dir).results.find((x) => x.id === "E2");
  const spot = join(dir, "segments/01/script.md");
  // the pattern part illustrates the pattern on the source's own small list: not a second running example
  writeFileSync(spot, readFileSync(spot, "utf8").replace(/stage: spot\n/, "stage: spot\non-screen: set([3, 1, 3, 2, 1]) → {1, 2, 3}\n"));
  assert.equal(e2().status, "pass", e2().evidence.join("\n"));
  // an output made of the running example's values ([5, 2] from [2, 5, 1]) folds into it
  const later = join(dir, "segments/03/script.md");
  writeFileSync(later, readFileSync(later, "utf8").replace(/(\nvisual: [^\n]*\n)/, "$1on-screen: [2, 5, 1] → [5, 2] → 5, 2, 1\n"));
  assert.equal(e2().status, "pass", e2().evidence.join("\n"));
  // the problem statement's own example, reused in a later part, is not a new example either
  const prob = readdirSync(join(dir, "segments")).map((d) => join(dir, "segments", d, "script.md")).find((f) => /stage: problem/.test(readFileSync(f, "utf8")));
  writeFileSync(prob, readFileSync(prob, "utf8").replace(/stage: problem\n/, "stage: problem\non-screen: [7, 7, 8] → 2\n"));
  writeFileSync(later, readFileSync(later, "utf8").replace("[5, 2] → 5, 2, 1", "[5, 2] → 5, 2, 1 · [7, 7, 8]"));
  assert.equal(e2().status, "pass", e2().evidence.join("\n"));
  // two genuinely new lists still fail
  writeFileSync(later, readFileSync(later, "utf8").replace("[5, 2] → 5, 2, 1 · [7, 7, 8]", "[7, 8, 9] → [10, 11, 12]"));
  assert.equal(e2().status, "fail");
  rmSync(dir, { recursive: true, force: true });
});

test("N2: a notebook of source code, source text and example calls passes; a tracer, an assert or a timestamp fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-n2-"));
  cpSync(fx("good"), dir, { recursive: true });
  const blocks = JSON.parse(readFileSync(join(dir, "chapter.json"), "utf8")).blocks;
  const fn = blocks.find((b) => b.kind === "code");
  const para = blocks.find((b) => b.kind === "para");
  const cell = (cell_type, text) => ({ cell_type, metadata: {}, source: [text], ...(cell_type === "code" ? { outputs: [], execution_count: null } : {}) });
  const write = (cells) => writeFileSync(join(dir, "notebook.ipynb"), JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells }));
  const n2 = () => evaluate(dir).results.find((x) => x.id === "N2");
  write([cell("markdown", "# T\n\nRun the cells in order."), cell("markdown", "## Solution"), cell("markdown", para.text), cell("code", fn.text), cell("code", "f(1)"), cell("code", 'try:\n    f(-1)\nexcept ValueError as error:\n    print("ValueError:", error)')]);
  assert.equal(n2().status, "pass", n2().evidence.join("\n"));
  write([cell("markdown", "## 03 · The idea · video 1:45"), cell("code", "steps(f, 1)\nassert True")]);
  assert.equal(n2().status, "fail");
  assert.match(n2().evidence.join("\n"), /pointer to the video[\s\S]*neither a source block nor example calls/);
  // an assignment is an example only when the notebook outline declares it as a run
  write([cell("markdown", "## Solution"), cell("code", fn.text), cell("code", "xs = [1, 1, 2]"), cell("code", "f(xs)")]);
  assert.equal(n2().status, "fail");
  const vj = join(dir, "video.json");
  const video = JSON.parse(readFileSync(vj, "utf8"));
  video.notebook = { ...(video.notebook ?? {}), sections: [{ title: "Solution", run: ["xs = [1, 1, 2]", "f(xs)"] }] };
  writeFileSync(vj, JSON.stringify(video));
  assert.equal(n2().status, "pass", n2().evidence.join("\n"));
  rmSync(dir, { recursive: true, force: true });
});

test("--text: the text gates skip criteria that judge the build, so a stale render cannot fail a script", () => {
  const r = evaluate(fx("good"), { text: true });
  for (const id of ["G2", "V2", "R1", "N1", "T9"]) assert.equal(r.results.find((x) => x.id === id).status, "skip", id);
  assert.notEqual(r.results.find((x) => x.id === "T1").status, "skip");
});

test("runningExample: a problem on strings runs on a quoted word, read as its letters", async () => {
  const { runningExample } = await import(pathToFileURL(join(root, "evals/lib/kit.mjs")).href);
  const scene = (onScreen, display) => ({ onScreen, entries: [{ display }] });
  const seg = (id, ...scenes) => ({ id, script: { scenes } });
  const ctx = { video: {}, segments: [seg("00", scene('cells: "anagram" / "nagaram"', "Here are two words.")),
    seg("01", scene("", 'Take "anagram" and count it.')), seg("02", scene('"rat" / "car"', "Rat and car."))] };
  assert.deepEqual(runningExample(ctx), [..."anagram"]);
  const nums = { video: {}, segments: [seg("00", scene("cells [2, 5, 1]", "x")), seg("01", scene("[2, 5, 1]", "y"))] };
  assert.deepEqual(runningExample(nums), ["2", "5", "1"]);
});

test("T9 reads the insight's frames: a text card fails, the example drawn as values passes", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-t9-"));
  cpSync(fx("good"), dir, { recursive: true });
  const frames = join(dir, "segments/02/video/compositions/frames");
  mkdirSync(frames, { recursive: true });
  const card = '<div data-role="stage-card">think</div><div style="font-size:60px">keep one total as you go: 2, then 7, then 8</div>';
  writeFileSync(join(frames, "f02-keep-one-number-instead.html"), card);
  const t9 = () => evaluate(dir).results.find((x) => x.id === "T9");
  assert.equal(t9().status, "fail");
  assert.match(t9().evidence.join("\n"), /never draws \[2, 5, 1\] as values/);
  const cells = card + "<div>2</div><div>5</div><div>1</div><div>2</div><div>7</div><div>8</div>";
  writeFileSync(join(frames, "f02-keep-one-number-instead.html"), cells);
  assert.equal(t9().status, "pass", t9().evidence.join("\n"));
  rmSync(dir, { recursive: true, force: true });
});

test("video.json accepted: a kept failure stops failing the run but still scores nothing; a passing one is stale", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-acc-"));
  cpSync(fx("rushed"), dir, { recursive: true });
  const vj = join(dir, "video.json");
  const video = JSON.parse(readFileSync(vj, "utf8"));
  const before = evaluate(dir);
  writeFileSync(vj, JSON.stringify({ ...video, accepted: { T6: "the sort is shown at a glance", T7: "kept", T8: "kept", O1: "never failed" } }));
  const r = evaluate(dir);
  assert.deepEqual(failing(r).sort(), ["E4", "G4", "G5", "R5", "T1"]);
  assert.deepEqual(r.results.filter((x) => x.status === "accepted").map((x) => x.id).sort(), ["T6", "T7", "T8"]);
  assert.equal(r.results.find((x) => x.id === "T6").reason, "the sort is shown at a glance");
  assert.equal(r.score, before.score, "an accepted failure earns no points");
  assert.deepEqual(r.stale, ["O1"]);
  const cli = (args) => spawnSync(process.execPath, [join(root, "evals/run.mjs"), dir, "--no-write", ...args], { encoding: "utf8" });
  assert.equal(cli([]).status, 1, "the other failures still fail the run");
  writeFileSync(vj, JSON.stringify({ ...video, accepted: Object.fromEntries(failing(before).map((id) => [id, "kept"])) }));
  const ok = cli([]);
  assert.equal(ok.status, 0, ok.stdout.slice(-600));
  assert.match(ok.stdout, /accepted: kept/);
  rmSync(dir, { recursive: true, force: true });
});

test("O6: a hook on strings opens on a quoted word; one with no values still fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-o6-"));
  cpSync(fx("good"), dir, { recursive: true });
  const hook = join(dir, "segments/00/script.md");
  const src = readFileSync(hook, "utf8");
  const o6 = () => evaluate(dir).results.find((x) => x.id === "O6").status;
  writeFileSync(hook, src.replace("on-screen: cells [2, 5, 1]; total 8", 'on-screen: cells "anagram" / "nagaram"')
    .replace(/2, 5, 1\. What's/, "two words. What's"));
  assert.equal(o6(), "pass");
  writeFileSync(hook, src.replace("on-screen: cells [2, 5, 1]; total 8", "on-screen: two words").replace(/2, 5, 1\. What's/, "two words. What's"));
  assert.equal(o6(), "fail");
  rmSync(dir, { recursive: true, force: true });
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
