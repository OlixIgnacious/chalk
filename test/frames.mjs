#!/usr/bin/env node
// frames.mjs — the frame library draws what the eval later checks: the plan's reasons at a readable size.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from "node:fs";
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

test("write() leaves a cues.json per frame: each reveal on the segment's clock, its duration and the text it shows", async () => {
  const proj = join(tmp, "cues-proj");
  spawnSync("mkdir", ["-p", proj]);
  const ws = "One two three four five six".split(" ").map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  writeFileSync(join(proj, "audio_meta.json"), JSON.stringify({ voices: [{ frame: 1, words: ws }, { frame: 2, words: ws }] }));
  writeFileSync(join(proj, "STORYBOARD.md"), "# x\n\n## Frame 1 — a\n\n- duration: 4.0s\n\n## Frame 2 — b\n\n- duration: 3.0s\n");
  const code = `import sys; sys.path.insert(0, ${JSON.stringify(join(root, "frames"))})
from framelib import Frame
F = Frame(${JSON.stringify(proj)}, 2, "f02-b", {"stage": "hook"})
a = F.text("too big", 100, 100, eid="lbl")
F.fade(a, "three")
b = F.text("left", 100, 300, eid="l2")
F.rise(b, "five", dur=0.6)
F._no_chrome = True  # no series label in this bare video dict
F.write()`;
  const r = spawnSync(py, ["-I", "-c", code], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const meta = JSON.parse(readFileSync(join(proj, "compositions", "frames", "f02-b.cues.json"), "utf8"));
  assert.equal(meta.start, 4, "frame 2 starts after frame 1's 4 s");
  assert.equal(meta.end, 7);
  const cues = meta.cues.filter((c) => ["#lbl", "#l2"].includes(c.sel));
  assert.deepEqual(cues.map((c) => c.t), [5, 6], "cued on 'three' (1.0 s) and 'five' (2.0 s), plus the frame's start");
  assert.equal(cues[1].dur, 0.6);
  assert.match(cues[0].text, /too big/);
  const texts = JSON.parse(readFileSync(join(proj, "compositions", "frames", "f02-b.texts.json"), "utf8")).texts;
  const lbl = texts.find((x) => x.id === "lbl");
  assert.deepEqual([lbl.from, lbl.to, lbl.pass], [5, 7, false], "up from its cue to the frame's end, and timed");

  const { reveals, stillTimes } = await import(join(root, "frames/cues.mjs"));
  const rows = stillTimes(reveals([meta]));
  const first = rows.find((x) => x.t === 5);
  assert.deepEqual(first.at, [5.1, 5.5, 5.9], "entry, settled (0.5 s fade), end of hold before the next reveal at 6");
  assert.deepEqual(rows.find((x) => x.t === 6).at, [6.1, 6.6, 6.9], "the last reveal holds to the frame's end");
});

test("cues: reveals that start together are one moment, and a hold never comes before its entry", async () => {
  const { reveals, stillTimes } = await import(join(root, "frames/cues.mjs"));
  const frames = [{ frame: "f01", no: 1, start: 0, end: 2, cues: [
    { t: 1.0, dur: 0.5, text: "a" }, { t: 1.02, dur: 0.8, text: "b" }, { t: 1.95, dur: 0.6, text: "c" }] }];
  const rows = stillTimes(reveals(frames));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, "a / b");
  assert.equal(rows[0].dur, 0.82, "the moment settles when its last part does");
  assert.ok(rows[1].at[2] >= rows[1].at[0], "a reveal 50 ms before the frame ends still has its hold after its entry");
});

test("COMPONENTS.md is what framelib's docstrings say, and every component says what it is for and what to avoid", () => {
  const r = spawnSync("python3", ["-I", join(root, "frames/index.py"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const md = readFileSync(join(root, "frames/COMPONENTS.md"), "utf8");
  const rows = md.split("\n").filter((l) => /^\| `\w+\(/.test(l));
  assert.ok(rows.length >= 40, `${rows.length} components`);
  for (const row of rows) {
    const cells = row.split(" | ");
    assert.ok(cells.length >= 5 && cells[2] !== "—" && cells[3] !== "—", `no Use for / Avoid for: ${row.slice(0, 60)}`);
  }
});

test("the frames agent reads the index, the defect log and the theme before it draws; the reviewer the theme's pitfalls", () => {
  const frames = readFileSync(join(root, "agents/chalk-frames.md"), "utf8");
  for (const f of ["COMPONENTS.md", "LESSONS.md", "THEME.md"]) assert.match(frames, new RegExp(f.replace(".", "\\.")));
  assert.match(readFileSync(join(root, "agents/chalk-frames-reviewer.md"), "utf8"), /Pitfalls/);
  const lessons = readFileSync(join(root, "frames/LESSONS.md"), "utf8");
  assert.ok((lessons.match(/^## /gm) ?? []).length >= 3, "the first three defect classes");
});

// ── themes: folders the channel picks from ──

const lum = (hex) => {
  const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("every theme is a folder with theme.json (every slot), THEME.md (every section), captions.css and a poster", async () => {
  const { listThemes } = await import(join(root, "frames/themes.mjs"));
  const themes = listThemes().filter((t) => !t.own);
  assert.ok(themes.length >= 20, `${themes.length} themes`);
  for (const t of themes) {
    for (const f of ["theme.json", "THEME.md", "captions.css", "poster.png"]) assert.ok(existsSync(join(t.dir, f)), `${t.name}/${f}`);
    for (const k of ["ink", "ink_alt", "orange", "cream", "muted", "hint", "border"]) assert.match(t.json.palette[k] ?? "", /^#[0-9A-Fa-f]{6}$/, `${t.name} palette.${k}`);
    const md = readFileSync(join(t.dir, "THEME.md"), "utf8");
    for (const sec of ["Essence", "What it is not", "Colour", "Type", "Motion", "Pitfalls"]) assert.match(md, new RegExp(`^## ${sec}`, "m"), `${t.name} THEME.md § ${sec}`);
  }
});

test("every theme's text is readable on its ground: text 4.5:1, the accent and secondary text 3:1", async () => {
  const { listThemes } = await import(join(root, "frames/themes.mjs"));
  const bad = [];
  for (const t of listThemes().filter((x) => !x.own)) {
    const p = t.json.palette;
    if (contrast(p.cream, p.ink) < 4.5) bad.push(`${t.name}: text ${contrast(p.cream, p.ink).toFixed(2)}`);
    if (contrast(p.orange, p.ink) < 3) bad.push(`${t.name}: accent ${contrast(p.orange, p.ink).toFixed(2)}`);
    if (contrast(p.muted, p.ink) < 3) bad.push(`${t.name}: secondary ${contrast(p.muted, p.ink).toFixed(2)}`);
  }
  assert.deepEqual(bad, []);
});

test("every theme draws a fixture frame, and its finish never moves the layout", async () => {
  const { sampleFrame } = await import(join(root, "frames/poster.mjs"));
  const { listThemes } = await import(join(root, "frames/themes.mjs"));
  const boxes = (html) => [...html.matchAll(/id="(f01-sample-(?!field|noise|flicker)[^"]+)"[^>]*?left:(\d+)px;top:(\d+)px/g)].map((m) => m.slice(1).join(":"));
  const base = boxes(sampleFrame("broadside").html);
  assert.ok(base.length >= 4);
  for (const t of listThemes().filter((x) => !x.own && x.json.finish)) {
    const { html } = sampleFrame(t.name);
    assert.deepEqual(boxes(html), base, `${t.name}'s finish moved something`);
  }
});

test("a build's theme is the manifest's, else the channel's, else broadside; an unknown theme is an error; your own theme shadows chalk's", async () => {
  const { themeFor } = await import(join(root, "frames/themes.mjs") + `?t=${Date.now()}`);
  const ws = join(tmp, "theme-ws");
  const out = join(ws, "long-output", "x");
  spawnSync("mkdir", ["-p", out]);
  writeFileSync(join(out, "video.json"), JSON.stringify({ title: "x" }));
  assert.equal(themeFor(out).name, "broadside");
  assert.equal(themeFor(out).from, "fallback");
  writeFileSync(join(ws, "channel.json"), JSON.stringify({ theme: "dusk" }));
  assert.deepEqual([themeFor(out).name, themeFor(out).from], ["dusk", "channel"]);
  writeFileSync(join(out, "video.json"), JSON.stringify({ title: "x", theme: "crt" }));
  assert.deepEqual([themeFor(out).name, themeFor(out).from], ["crt", "manifest"]);
  writeFileSync(join(out, "video.json"), JSON.stringify({ title: "x", theme: "nope" }));
  assert.throws(() => themeFor(out), /theme "nope"/);
  const own = join(tmp, "own-themes", "dusk");
  spawnSync("mkdir", ["-p", own]);
  writeFileSync(join(own, "theme.json"), JSON.stringify({ name: "dusk", palette: { ink: "#000000" } }));
  const r = spawnSync(process.execPath, ["-e", `import(${JSON.stringify(join(root, "frames/themes.mjs"))}).then(m => console.log(m.listThemes().find(t => t.name === "dusk").own))`],
    { encoding: "utf8", env: { ...process.env, CHALK_THEMES: join(tmp, "own-themes") } });
  assert.equal(r.stdout.trim(), "true");
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
