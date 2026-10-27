#!/usr/bin/env node
// cli.mjs — the one `chalk` entry point routes each command to the part that owns it.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const chalk = (...a) => spawnSync(process.execPath, [join(root, "bin/chalk.mjs"), ...a], { encoding: "utf8", cwd: root });

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("help and version", () => {
  assert.equal(chalk("--help").status, 0);
  assert.match(chalk("--version").stdout, /^\d+\.\d+\.\d+/);
});

test("an unknown command or format is a usage error", () => {
  assert.equal(chalk("nope").status, 2);
  assert.equal(chalk("eval", "x", "--format", "podcast").status, 2);
  assert.equal(chalk("frames").status, 2, "a step-4 stage needs its segment number");
});

test("core commands go to core/", () => {
  assert.equal(chalk("path").stdout.trim(), join(root, "core"));
  assert.equal(chalk("check-readability").status, 2, "core's own usage error comes through");
});

test("eval scores a fixture with the format's pack plus the shared criteria", () => {
  const r = chalk("eval", join(root, "evals/fixtures/youtube/good"), "--no-write", "--json");
  assert.equal(r.status, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.format, "youtube");
  for (const g of ["orientation", "teaching", "grounding", "voice"]) assert.ok(g in report.groups, g);
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
console.log(`\n${tests.length - failed}/${tests.length} cli tests passed`);
process.exit(failed ? 1 : 0);
