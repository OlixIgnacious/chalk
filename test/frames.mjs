#!/usr/bin/env node
// frames.mjs — the frame library draws what the eval later checks: the plan's reasons at a readable size.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const py = [process.env.CHALK_PYTHON, process.env.HYPERFRAMES_PYTHON, join(root, ".venv/bin/python")].find((p) => p && existsSync(p)) ?? "python3";
const tmp = mkdtempSync(join(tmpdir(), "chalk-frames-"));

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** A one-frame project whose narration is `words`, then `body` run against a Frame for it. */
function frame(words, body) {
  const proj = join(tmp, `p${tests.length}-${Math.random().toString(36).slice(2, 7)}`);
  spawnSync("mkdir", ["-p", proj]);
  const ws = words.split(" ").map((text, i) => ({ text, start: i * 0.3, end: i * 0.3 + 0.25 }));
  writeFileSync(join(proj, "audio_meta.json"), JSON.stringify({ voices: [{ frame: 1, duration_s: ws.length * 0.3, words: ws }] }));
  writeFileSync(join(proj, "STORYBOARD.md"), "# x\n\n## Frame 1 — plan\n\n- duration: 9.0s\n");
  const code = `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "frames"))})
from framelib import Frame
F = Frame(${JSON.stringify(proj)}, 1, "f01-plan", {"stage": "plan"})
${body}
print("\\n".join(F.html))`;
  const r = spawnSync(py, ["-I", "-c", code], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

test("plan_card draws each step's reason under it at 40px, cued on its because", () => {
  const html = frame("Start with an empty set because we have seen nothing yet", `F.plan_card([("start with an empty set", "Start", "we have seen nothing yet", "because")])`);
  assert.match(html, /font-size:40px[^>]*>we have seen nothing yet/);
  assert.match(html, /font-size:58px[^>]*>start with an empty set/);
});

test("plan_card still takes plain (text, cue) steps", () => {
  const html = frame("Walk the list once", `F.plan_card([("walk the list once", "Walk")])`);
  assert.match(html, /walk the list once/);
  assert.doesNotMatch(html, /-pw0/);
});

test("a traced set is shown as Python prints it: set() when empty, never {} (an empty dict)", () => {
  const out = frame("Go", `from framelib import show_value
for v in [{"set": []}, {"set": [2, 1]}, set(), [1, 2], "a", 3]:
    F.html.append("V:" + show_value(v))`);
  const vals = out.split("\n").filter((l) => l.startsWith("V:")).map((l) => l.slice(2));
  assert.deepEqual(vals, ["set()", "{1, 2}", "set()", "[1, 2]", "'a'", "3"]);
});

test("portrait: set_canvas makes a 1080x1920 frame with only the series on top, and code can show some of its lines", () => {
  const out = frame("Go on", `import framelib
framelib.set_canvas("portrait")
F.video.update({"series_label": "DSA Patterns #1 · The Seen-Set", "out_dir": "."})
framelib._CHAPTERS["."] = {"c1": {"text": "def f(xs):                                  # O(n) time, O(n) space\\n    seen = set()\\n    return seen"}}
F.code_show("c1", x=104, y=420, w=872, size=40, only=[2, 3])
F.chrome()
F.html.append("W=%d H=%d K=%d" % (framelib.W, framelib.H, framelib.KEEP_OUT))`);
  assert.match(out, /W=1080 H=1920 K=1320/);
  assert.doesNotMatch(out, /data-role="progress-strip"/, "a Short has no stage strip");
  assert.match(out, /DSA Patterns #1/);
  assert.doesNotMatch(out, /# O\(n\) time/, "the commented signature is not shown");
  assert.match(out, /<span class="f01-plan-num">2<\/span><span class="f01-plan-ct" data-codeline>    seen = set\(\)/, "a shown line keeps its own number");
  assert.match(out, /font-size:40px/, "the body fits at 40px");
});

test("comments=\"above\" moves a trailing comment to its own row, keeping every character and the line's own number", () => {
  const out = frame("Go on", `import framelib
framelib.set_canvas("portrait")
F.video.update({"series_label": "DSA Patterns #3", "out_dir": "."})
framelib._CHAPTERS["."] = {"c1": {"text": "def f(xs):\\n    if x in seen:                  # check BEFORE storing x\\n        return 1"}}
F.code_show("c1", x=104, y=420, w=872, size=40, only=[2, 3], comments="above")`);
  assert.match(out, /-cm"[^>]*><span[^>]*><\/span><span[^>]*>    # check BEFORE storing x</, "the comment sits on its own row, at the code's indent");
  assert.match(out, /data-codeline="    if x in seen:                  # check BEFORE storing x">    if x in seen:</, "the line carries its whole text for G2");
  assert.match(out, /f01-plan-num">2</, "the line keeps its own number");
  assert.match(out, /font-size:40px/, "the narrow panel keeps code at 40px");
});

test("code_run shows each call with the output its example script printed, and refuses a call it did not run", () => {
  const ex = join(tmp, "examples");
  spawnSync("mkdir", ["-p", ex]);
  writeFileSync(join(ex, "run_two_sum.py"),
    'import json\ndef f(n): return [n, n + 1]\nprint(json.dumps({"calls": {"f(1)": repr(f(1))}}))\n');
  const html = frame("Run it now", `F.code_run("examples/run_two_sum.py", [("f(1)", "Run")])`);
  assert.match(html, /In \[ \]:/);
  assert.match(html, />f\(1\)</);
  assert.match(html, /Out\[1\]:<\/span><span[^>]*>\[1, 2\]</, "the output is the script's, not typed by hand");
  const r = spawnSync(py, ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "frames"))})
import json
from pathlib import Path
from framelib import Frame
import os
proj = ${JSON.stringify(join(tmp, "probe"))}
os.makedirs(proj, exist_ok=True)
open(proj + "/audio_meta.json", "w").write(json.dumps({"voices": [{"frame": 1, "duration_s": 1, "words": [{"text": "Run", "start": 0, "end": 0.2}]}]}))
open(proj + "/STORYBOARD.md", "w").write("# x\\n\\n## Frame 1 — p\\n\\n- duration: 2.0s\\n")
F = Frame(proj, 1, "f01-p", {"stage": "plan"})
F.code_run("examples/run_two_sum.py", [("f(2)", "Run")])`], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /prints no result for \['f\(2\)'\]/);
});

test("table: a wrapped cell with more lines than its row holds fails the build", () => {
  const long = "arrays already sorted, or memory is tight and you may sort in place, as written, for the loop version";
  const out = frame("Compare", `try:
    F.table(["a", "when", "b"], [["Sets", ${JSON.stringify(long)}, "x"]], 104, 240, [300, 400, 300], size=40, row_h=100, wrap=(1,))
    F.html.append("NO-ERROR")
except ValueError as e:
    F.html.append("ERR:" + str(e))`);
  assert.match(out, /ERR:table cell \(0,1\).*wraps to ~\d+ lines .* in a 100px row/);
});

test("pointer_walk: named chips with carets that move one step at a time; a name that reads as a digit is refused", () => {
  const out = frame("Read walks then write moves", `w = F.pointer_walk([1, 1, 2, 2, 3], 300, 400, {"read": ("above", 1), "write": ("below", 1)}, eid="pw")
w.walk([{"t": "walks", "read": 2}, {"t": "moves", "read": 3, "write": 2}, {"t": "moves", "read": 3}])
F.html.append("CELL:" + w.cell(4) + " SEL:" + w.sel("write"))
F.html.append("TWEENS:" + "\\n".join(F.tweens))
try:
    F.pointer_walk([1, 2], 300, 700, {"l": ("above", 0)})
    F.html.append("NO-ERROR")
except ValueError as e:
    F.html.append("ERR:" + str(e))`);
  assert.match(out, /id="pw-p0"[^>]*>read</);
  assert.match(out, /id="pw-p1"[^>]*>write</);
  assert.match(out, /CELL:#pw-a-c4 SEL:#pw-p1, #pw-p1-sv/);
  const moves = out.split("TWEENS:")[1].split("\n").filter((l) => /tl\.to\("#pw-p/.test(l));
  assert.equal(moves.length, 3, "read twice, write once; a pointer already there does not move");
  assert.match(moves[0], /x: 138/, "one cell (120 + 18) along from where read started");
  assert.match(out, /ERR:pointer name 'l' reads as a digit/);
  assert.doesNotMatch(out, /NO-ERROR/);
});

test("reject: a true fact that breaks a rule gets a cross and an arrow into the rule, never a strike", () => {
  const out = frame("extra memory breaks the rule", `F.text("O(n)", 900, 520, size=60, eid="fact")
x, ar = F.reject((900, 520, 160, 70), (640, 690, 400, 60), "extra", sel="#fact")
F.html.append("SEL:" + x + "|" + ar)
F.html.append("TWEENS:" + "\\n".join(F.tweens))`);
  assert.match(out, />✗</);
  assert.match(out, /<path id="f01-plan-rej\d+-ar" d="M980,598 /, "from under the fact, toward the rule below it");
  assert.match(out, /tl\.to\("#fact"[^\n]*color/);
  assert.doesNotMatch(out, /line-through/);
});

test("block_table: a source table drawn as written, rows picked by their first cell", () => {
  const md = "| Way | Time | Memory |\\n|---|---|---|\\n| \`sorted(set(nums))\` | O(n log n) | O(n) |\\n| Two pointers | O(n) | O(1) |";
  const out = frame("Compare", `F.block = lambda bid: {"id": bid, "text": "${md}"}
head, rows = F.table_rows("p045")
F.html.append("ROWS:" + repr(rows))
F.block_table("p045", 104, 240, [500, 300, 300], pick=["Two"], cols=(0, 2))`);
  assert.match(out, /ROWS:\[\['sorted\(set\(nums\)\)', 'O\(n log n\)', 'O\(n\)'\], \['Two pointers', 'O\(n\)', 'O\(1\)'\]\]/);
  assert.match(out, />Two pointers</);
  assert.match(out, />O\(1\)</);
  assert.doesNotMatch(out, /O\(n log n\)<\/div>/, "the row not picked is not drawn");
});

test("table: a one-line cell that would run into the next column fails the build; wrap=(c,) lets it break instead", () => {
  const long = "arrays already sorted, or memory is tight and you may sort in place";
  const out = frame("Compare", `try:
    F.table(["a", "when", "b"], [["Sets", ${JSON.stringify(long)}, "x"]], 104, 240, [400, 600, 300], size=40)
    F.html.append("NO-ERROR")
except ValueError as e:
    F.html.append("ERR:" + str(e))
F.table(["a", "when", "b"], [["Sets", ${JSON.stringify(long)}, "x"]], 104, 240, [400, 600, 300], size=40, row_h=104, wrap=(1,))`);
  assert.match(out, /ERR:table cell \(0,1\).*wrap=\(1,\)/);
  assert.doesNotMatch(out, /NO-ERROR/);
  assert.match(out, /white-space:normal;line-height:1\.15;">arrays already sorted/);
  // a last column may use the room up to the canvas edge
  frame("Go", `F.table(["a", "b"], [["x", "only to state as the starting point"]], 104, 240, [400, 300], size=40)`);
});

test("code_run numbers each call from its own notebook cell, consecutive or not, and fails on a call the notebook never runs", () => {
  const out = join(tmp, "nb-spread");
  spawnSync("mkdir", ["-p", join(tmp, "examples"), out]);
  writeFileSync(join(out, "chapter.json"), JSON.stringify({ blocks: [{ id: "c1", kind: "code", lang: "python", text: "def f(n): return n" }] }));
  // the notebook merged a repeat: "nums" runs in the second section, away from "f(x)" (dsa-05's "Careful")
  writeFileSync(join(out, "video.json"), JSON.stringify({ notebook: { sections: [
    { title: "a", code: "c1", run: ["x = 2", "f(x)"] },
    { title: "b", run: ["nums"] },
  ] } }));
  writeFileSync(join(tmp, "examples", "run_spread.py"),
    'import json\nprint(json.dumps({"calls": {"x = 2": "", "f(x)": "2", "nums": "[1]", "g(1)": "1"}}))\n');
  const html = frame("Set it run it then nums", `F.video["out_dir"] = ${JSON.stringify(out)}
F.code_run("examples/run_spread.py", [("f(x)", "run"), ("nums", "nums")])
F.html.extend(F.tweens)
try:
    F.code_run("examples/run_spread.py", [("g(1)", "Set")])
    F.html.append("NO-ERROR")
except ValueError as e:
    F.html.append("ERR:" + str(e))`);
  assert.match(html, /In \[3\]:/, "f(x) is the third code cell");
  assert.match(html, /In \[4\]:/, "nums is the fourth, in the next section");
  assert.match(html, /ERR:.*never runs \['g\(1\)'\]/);
  assert.doesNotMatch(html, /NO-ERROR/);
});

test("code_run numbers its cells as the notebook does, and a statement shows no Out row", () => {
  const out = join(tmp, "nb-out");
  spawnSync("mkdir", ["-p", join(tmp, "examples")]);
  spawnSync("mkdir", ["-p", out]);
  writeFileSync(join(out, "chapter.json"), JSON.stringify({ blocks: [{ id: "c1", kind: "code", lang: "python", text: "def f(n): return n" }] }));
  writeFileSync(join(out, "video.json"), JSON.stringify({ notebook: { sections: [
    { title: "a", code: "c1", run: ["f(0)"] },
    { title: "b", run: ["x = 2", "f(x)"] },
  ] } }));
  writeFileSync(join(tmp, "examples", "run_seq.py"),
    'import json\nprint(json.dumps({"calls": {"x = 2": "", "f(x)": "2"}}))\n');
  const html = frame("Set it run it", `F.video["out_dir"] = ${JSON.stringify(out)}
F.code_run("examples/run_seq.py", [("x = 2", "Set"), ("f(x)", "run")])
F.html.extend(F.tweens)  # the cell numbers are set on the timeline`);
  assert.match(html, /In \[3\]:/, "x = 2 is the notebook's third code cell (the def, f(0), then x = 2)");
  assert.match(html, /In \[4\]:/);
  assert.match(html, /Out\[4\]:/);
  assert.doesNotMatch(html, /Out\[3\]:/, "a statement prints nothing, so it has no Out row");
  const replay = frame("Again here", `F.video["out_dir"] = ${JSON.stringify(out)}
F.code_run("examples/run_seq.py", [("x = 2", "Again"), ("f(x)", "here")], ran=True)
F.html.extend(F.tweens)`);
  assert.match(replay, /In \[4\]:/, "a replay keeps the notebook's number");
  assert.doesNotMatch(replay, /In \[\*\]:|running…<\/div>/.source ? /In \[\*\]:/ : /x/, "a replay is not running again");
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
console.log(`\n${tests.length - failed}/${tests.length} frames tests passed`);
process.exit(failed ? 1 : 0);
