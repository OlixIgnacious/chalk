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
const fx = (n) => join(root, "evals/fixtures/long", n);

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

test("a pinned waiver covers the failure as accepted: a grown number or a new line fails again", async () => {
  const { covers, pinAccepted } = await import(pathToFileURL(join(root, "evals/run.mjs")).href);
  const line = 'segments/11 "Version 2": 130.5s';
  assert.ok(covers(line, line));
  assert.ok(covers(line, 'segments/11 "Version 2": 131.0s'), "a re-take within 2% is the same part");
  assert.ok(covers(line, 'segments/11 "Version 2": 120.0s'), "shorter is fine");
  assert.ok(!covers(line, 'segments/11 "Version 2": 140.0s'), "140 s against a 130.5 s waiver is not covered");
  assert.ok(!covers(line, 'segments/12 "Recap": 90.8s'.replace("12", "1")), "another part is another line");

  const dir = mkdtempSync(join(tmpdir(), "chalk-pin-"));
  cpSync(fx("rushed"), dir, { recursive: true });
  const vj = join(dir, "video.json");
  const video = JSON.parse(readFileSync(vj, "utf8"));
  writeFileSync(vj, JSON.stringify({ ...video, accepted: { T8: "kept" } }));
  let r = evaluate(dir);
  assert.deepEqual(r.unpinned, ["T8"], "a reason-only waiver is reported unpinned");
  const pinned = pinAccepted(JSON.parse(readFileSync(vj, "utf8")), r);
  assert.equal(pinned.accepted.T8.reason, "kept");
  assert.ok(pinned.accepted.T8.evidence.length > 0);
  writeFileSync(vj, JSON.stringify(pinned));
  r = evaluate(dir);
  assert.equal(r.results.find((x) => x.id === "T8").status, "accepted");
  assert.deepEqual(r.unpinned, []);
  // the outline's four-idea row grows a fifth idea: the waiver no longer covers it
  const grown = { ...pinned, accepted: { T8: { reason: "kept", evidence: pinned.accepted.T8.evidence.map((e) => e.replace(/teaches (\d+)/, (_, n) => `teaches ${n - 1}`)) } } };
  writeFileSync(vj, JSON.stringify(grown));
  const t8 = evaluate(dir).results.find((x) => x.id === "T8");
  assert.equal(t8.status, "fail");
  assert.match(t8.evidence[0], /^not in the waiver: /);
  rmSync(dir, { recursive: true, force: true });
});

test("T8 does not judge the outline row of a part cut from video.json", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-cut-t8-"));
  cpSync(fx("rushed"), dir, { recursive: true });
  const t8 = () => evaluate(dir).results.find((x) => x.id === "T8");
  const before = t8();
  assert.equal(before.status, "fail");
  const part = before.evidence[0].match(/part (\d+)/)[1].padStart(2, "0");
  const vj = join(dir, "video.json");
  const video = JSON.parse(readFileSync(vj, "utf8"));
  writeFileSync(vj, JSON.stringify({ ...video, segments: video.segments.filter((s) => s.id !== part) }));
  assert.equal(t8().status, "pass", t8().evidence.join("\n"));
  rmSync(dir, { recursive: true, force: true });
});

test("T10: one branch of an if/else said and not the other fails; a narrated `or` must be heard; skips: excuses it", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-t10-"));
  mkdirSync(join(dir, "segments/01"), { recursive: true });
  const code = ["while lo < hi:", "    if total < goal:", "        lo += 1   # total too small: move lo up to grow it",
    "    else:", "        hi -= 1   # total too big: move hi down to shrink it", "if not seen or seen[-1] != x:", "    seen.append(x)"].join("\n");
  writeFileSync(join(dir, "chapter.json"), JSON.stringify({ blocks: [{ id: "c001", kind: "code", lang: "python", text: code }, { id: "p001", kind: "para", text: "x" }] }));
  writeFileSync(join(dir, "video.json"), JSON.stringify({ segments: [{ id: "01" }] }));
  const script = (spoken, extra = "", lines = "") => `# 01 — Walk\n\n## Scene 1 — the walk\nvisual: code build (tier 1)\nstage: write\n${extra}\n` +
    spoken.map((s, i) => `- spoken: "${s}"\n  display: "${s}"\n  source: [c001, p001]\n${lines ? `  lines: [${lines.split(";")[i]}]\n` : ""}`).join("\n");
  const t10 = () => evaluate(dir, { text: true }).results.find((x) => x.id === "T10");
  const put = (...a) => writeFileSync(join(dir, "segments/01/script.md"), script(...a));

  put(["The total is too small, so a bigger value from the left grows it, and the left pointer moves."]);
  assert.equal(t10().status, "fail", "the 'too big' branch is never said (dsa-05 part 05)");
  assert.match(t10().evidence.join("\n"), /c001 line 4 `else:` is never said/);
  put(["Too small, so moving lo up grows it.", "Too big, so moving hi down shrinks it."]);
  assert.equal(t10().status, "pass", t10().evidence.join("\n"));
  put(["You keep it only if it isn't the last one you kept."], "", "6");
  assert.match(t10().evidence.join("\n"), /line 6 .* without its "or"/, "dsa-04's dropped `not result`");
  put(["You keep it if nothing is kept yet, or if it isn't the last one you kept."], "", "6");
  assert.equal(t10().status, "pass", t10().evidence.join("\n"));
  put(["You move the left pointer while the total is too small."], "skips: c001 — the other move is a practice problem", "2;3");
  assert.equal(t10().status, "pass", "an explicit skip with a reason is allowed");
  put(["You move the left pointer while the total is too small."], "", "2,3");
  assert.equal(t10().status, "fail", "by lines: lines 2–3 said, the else at 4–5 not");
  rmSync(dir, { recursive: true, force: true });
});

test("N3: two cells re-run in the same order fail; a reset alone or a bare name shown twice does not", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-n3-"));
  cpSync(fx("good"), dir, { recursive: true });
  const nb = (srcs) => writeFileSync(join(dir, "notebook.ipynb"), JSON.stringify({ cells: srcs.map((s) => ({ cell_type: s.startsWith("#") ? "markdown" : "code", source: s })) }));
  const n3 = () => evaluate(dir).results.find((x) => x.id === "N3");
  // dsa-05: the solution's run, then "Careful" running the same two cells again
  nb(["def dedupe(xs): ...", "xs = [1, 1, 2]", "k = dedupe(xs)", "k", "## Careful", "xs = [1, 1, 2]", "k = dedupe(xs)", "xs"]);
  assert.equal(n3().status, "fail");
  assert.match(n3().evidence[0], /cells 2–3 run again as cells 6–7/);
  nb(["def dedupe(xs): ...", "xs = [1, 1, 2]", "k = dedupe(xs)", "k", "## Careful", "xs = [1, 1, 2]", "sorted(xs)", "k", "xs"]);
  assert.equal(n3().status, "pass", n3().evidence.join("\n"));
  rmSync(dir, { recursive: true, force: true });
});

test("G6: a thesis with no thesis_source, or one naming a block that is not there, fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-g6-"));
  cpSync(fx("good"), dir, { recursive: true });
  const vj = join(dir, "video.json");
  const video = JSON.parse(readFileSync(vj, "utf8"));
  const g6 = () => evaluate(dir, { text: true }).results.find((x) => x.id === "G6");
  assert.equal(g6().status, "pass");
  const { thesis_source, ...bare } = video;
  writeFileSync(vj, JSON.stringify(bare));
  assert.match(g6().evidence[0], /no thesis_source/);
  writeFileSync(vj, JSON.stringify({ ...video, thesis_source: ["p999"] }));
  assert.match(g6().evidence[0], /p999/);
  const { thesis, ...none } = bare;
  writeFileSync(vj, JSON.stringify(none));
  assert.equal(g6().status, "skip", "no thesis yet: written at deliver");
  rmSync(dir, { recursive: true, force: true });
});

test("G7: no facts.md skips; one for this source with a row per claim passes; a gap or a contradiction fails", async () => {
  const { sourceHash, claimBlocks } = await import(pathToFileURL(join(root, "core/scripts/facts.mjs")).href);
  const dir = mkdtempSync(join(tmpdir(), "chalk-g7-"));
  cpSync(fx("good"), dir, { recursive: true });
  const g7 = () => evaluate(dir, { text: true }).results.find((x) => x.id === "G7");
  assert.equal(g7().status, "skip", "a build from before the source check");
  const chapter = JSON.parse(readFileSync(join(dir, "chapter.json"), "utf8"));
  const ids = claimBlocks(chapter).map((c) => c.id);
  const facts = (rows) => `# Facts\n\nsource: ${sourceHash(chapter)}\n\n| id | block | claim | verdict | evidence |\n|---|---|---|---|---|\n${rows}\n`;
  writeFileSync(join(dir, "facts.md"), facts(`| F1 | ${ids.join(", ")} | — | none | positions and a computed trace |`));
  assert.equal(g7().status, "pass", g7().evidence.join("\n"));
  writeFileSync(join(dir, "facts.md"), facts(`| F1 | ${ids.slice(1).join(", ")} | — | none | x |`));
  assert.match(g7().evidence.join("\n"), new RegExp(`${ids[0]} .* has no row`));
  writeFileSync(join(dir, "facts.md"), facts(`| F1 | ${ids.join(", ")} | O(1) memory | contradicted | it is O(n) |`));
  assert.match(g7().evidence.join("\n"), /F1 is contradicted/);
  rmSync(dir, { recursive: true, force: true });
});

test("G8: a quotation in a display line must sit in a source block marked supported; code strings are not quotations", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-g8-"));
  cpSync(fx("good"), dir, { recursive: true });
  const g8 = () => evaluate(dir, { text: true }).results.find((x) => x.id === "G8");
  assert.equal(g8().status, "pass", "the good fixture's quoted values are not quotations");
  const sp = join(dir, "segments/01/script.md");
  const md = readFileSync(sp, "utf8");
  writeFileSync(sp, md.replace(/(display:\s*")([^"\n]*)/, (_, a, b) => `${a}As they say, “a running total never forgets” — Ada. ${b}`));
  assert.match(g8().evidence.join("\n"), /a running total never forgets.*in no source block/);
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

test("R6: a text revealed 0.8 s before its frame ends fails; labels and code are not timed; a build with no texts.json skips", () => {
  const dir = mkdtempSync(join(tmpdir(), "chalk-r6-"));
  cpSync(fx("good"), dir, { recursive: true });
  assert.equal(evaluate(dir).results.find((x) => x.id === "R6").status, "skip");
  const frames = join(dir, "segments", "01", "video", "compositions", "frames");
  mkdirSync(frames, { recursive: true });
  writeFileSync(join(frames, "f01-a.texts.json"), JSON.stringify({ frame: "f01-a", start: 0, end: 6, texts: [
    { id: "a", text: "keep one running total", from: 0.5, to: 6, pass: false },
    { id: "b", text: "the answer is eight", from: 5.2, to: 6, pass: false },
    { id: "c", text: "STEP 2", from: 5.9, to: 6, pass: true }] }));
  const r6 = evaluate(dir).results.find((x) => x.id === "R6");
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r6.status, "fail");
  assert.equal(r6.evidence.length, 1);
  assert.match(r6.evidence[0], /"the answer is eight" is up 0\.8 s; 2\.8 s to read/);
});

// ── packs: the genre's rules, chosen by the channel or the manifest, apart from the shape ──

const pk = (pack, c) => join(root, "packs", pack, "fixtures", c);
const shapeOfFixture = (dir) => (readdirSync(dir).includes("short.json") ? "short" : "long");

for (const pack of ["essay", "news", "skit"]) {
  test(`${pack} pack: the good fixture passes everything that runs; the bad one fails every ${pack} rule`, () => {
    const g = evaluate(pk(pack, "good"), { format: shapeOfFixture(pk(pack, "good")) });
    assert.equal(g.pack, pack);
    assert.deepEqual(failing(g), [], JSON.stringify(g.results.filter((x) => x.status === "fail"), null, 2));
    const b = evaluate(pk(pack, "bad"), { format: shapeOfFixture(pk(pack, "bad")) });
    const own = b.results.filter((x) => x.group === pack);
    assert.ok(own.length >= 3, `${pack} has its criteria`);
    assert.deepEqual(own.filter((x) => x.status !== "fail").map((x) => x.id), [], `every ${pack} criterion fails on the bad fixture`);
  });
}

test("packs: every pack has its criteria, the shapes they hold for, and the references the skills read", async () => {
  const { PACKS } = await import(pathToFileURL(join(root, "packs/index.mjs")).href);
  for (const [name, p] of Object.entries(PACKS)) {
    assert.ok(p.CRITERIA?.length && p.GROUPS?.length && p.SHAPES?.length && p.ABOUT, `${name} exports CRITERIA, GROUPS, SHAPES, ABOUT`);
    for (const f of ["rules.md", "step-2-outline.md", "step-3-script.md"]) assert.ok(readdirSync(join(root, "packs", name, "references")).includes(f), `${name}/${f}`);
    for (const id of Object.keys(p.WAIVES ?? {})) assert.ok(!p.CRITERIA.some((c) => c.id === id), `${name} waives only shared criteria`);
  }
  const ids = Object.values(PACKS).flatMap((p) => p.CRITERIA.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length, "no two packs share a criterion id");
});

test("packs: a focus essay passes the essay pack and fails coding-lesson; the coding lesson the reverse", () => {
  const essayAsEssay = evaluate(pk("essay", "good"));
  const essayAsCoding = evaluate(pk("essay", "good"), { pack: "coding-lesson" });
  assert.deepEqual(failing(essayAsEssay), []);
  assert.ok(failing(essayAsCoding).some((id) => /^[OT]/.test(id)), `coding-lesson fails the essay: ${failing(essayAsCoding)}`);
  const codingAsCoding = evaluate(fx("good"));
  const codingAsEssay = evaluate(fx("good"), { pack: "essay" });
  assert.deepEqual(failing(codingAsCoding), []);
  assert.ok(failing(codingAsEssay).includes("Y5"), "an essay shows no code");
  assert.ok(!codingAsEssay.results.some((x) => /^[OTB]\d/.test(x.id)), "the coding rules are not run under the essay pack");
});

test("packs: a pack waives a shared rule that is not its genre's, and says so; the shape's default pack applies otherwise", () => {
  const r = evaluate(pk("essay", "good"));
  const e2 = r.results.find((x) => x.id === "E2");
  assert.equal(e2.status, "skip");
  assert.match(e2.evidence[0], /essay has no running example/);
  assert.equal(evaluate(fx("good")).pack, "coding-lesson", "long's default");
  assert.equal(evaluate(pk("news", "good"), { format: "short", pack: "" }).pack, null, "an empty pack is none");
});

test("packs: a pack with no rules for a shape is reported, not run", () => {
  const r = evaluate(pk("news", "good"), { format: "short", pack: "coding-lesson" });
  assert.match(r.note, /coding-lesson.*no rules for the short shape/);
  assert.ok(!r.results.some((x) => /^[OTB]\d/.test(x.id)));
});

test("packs: channel.json names the pack per shape, and the manifest overrides it", async () => {
  const { packOf } = await import(pathToFileURL(join(root, "formats/index.mjs")).href);
  assert.equal(packOf("long", {}), "coding-lesson");
  assert.equal(packOf("short", {}), null);
  assert.equal(packOf("short", { channel: { pack: { short: "news" } } }), "news");
  assert.equal(packOf("long", { channel: { pack: "essay" } }), "essay");
  assert.equal(packOf("long", { channel: { pack: "essay" }, manifest: { pack: "skit" } }), "skit");
  assert.equal(packOf("long", { channel: { pack: "essay" }, manifest: { pack: "skit" }, pack: "news" }), "news");
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
