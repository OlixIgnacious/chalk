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
