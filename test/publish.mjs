#!/usr/bin/env node
// publish.mjs — what `chalk publish` would send, worked out without the network or a sign-in.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { plan, publishTime } from "../publish/youtube.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const tmp = mkdtempSync(join(tmpdir(), "chalk-publish-"));
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

function outDir(name, files) {
  const dir = join(tmp, "ws", name);
  mkdirSync(dir, { recursive: true });
  for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
  return dir;
}
mkdirSync(join(tmp, "ws"), { recursive: true });
writeFileSync(join(tmp, "ws", "channel.json"), JSON.stringify({ youtube: { playlist: "DSA Patterns", tags: ["DSA"], category: "27" } }));

test("a video dir uploads video.mp4 as Private with the channel's tags, category and playlist", () => {
  const dir = outDir("v", { "video.json": JSON.stringify({ title: "DSA Patterns #3: Two Sum" }), "video.mp4": "x",
    "description.txt": "Learn it.\n", "thumbnail.png": "p", "captions.srt": "1\n" });
  const p = plan(dir);
  assert.equal(p.kind, "video");
  assert.equal(p.status.privacyStatus, "private");
  assert.equal(p.status.publishAt, undefined, "no --at: it stays Private");
  assert.deepEqual(p.snippet.tags, ["DSA"]);
  assert.equal(p.snippet.categoryId, "27");
  assert.equal(p.snippet.description, "Learn it.");
  assert.equal(p.playlist, "DSA Patterns");
  assert.ok(p.thumbnail && p.captions);
});

test("a Short dir uploads short.mp4; --at schedules it; declarations are sent only when given", () => {
  const dir = outDir("s", { "short.json": JSON.stringify({ title: "Two Sum in one pass" }), "short.mp4": "x", "description.txt": "d" });
  const p = plan(dir, ["--at", "2099-01-01 10:30", "--made-for-kids", "no"]);
  assert.equal(p.kind, "short");
  assert.equal(p.status.publishAt, new Date(2099, 0, 1, 10, 30).toISOString(), "local time, sent as UTC");
  assert.equal(p.status.selfDeclaredMadeForKids, false);
  assert.equal("containsSyntheticMedia" in p.status, false, "not declared on the owner's behalf");
  assert.equal(p.thumbnail, null);
});

test("refuses a time in the past, a bad time, a missing upload file, and a title over 100 characters", () => {
  assert.throws(() => publishTime("2001-01-01 10:00"), /not in the future/);
  assert.throws(() => publishTime("tomorrow"), /YYYY-MM-DD HH:MM/);
  const noMp4 = outDir("n", { "video.json": JSON.stringify({ title: "t" }), "description.txt": "d" });
  assert.throws(() => plan(noMp4), /video\.mp4 is not in/);
  const long = outDir("l", { "video.json": JSON.stringify({ title: "x".repeat(101) }), "video.mp4": "x", "description.txt": "d" });
  assert.throws(() => plan(long), /1–100 characters/);
});

test("chalk publish --dry-run prints the plan and sends nothing (no sign-in needed)", () => {
  const dir = outDir("d", { "short.json": JSON.stringify({ title: "Dry" }), "short.mp4": "x", "description.txt": "d" });
  const r = spawnSync(process.execPath, [join(root, "bin/chalk.mjs"), "publish", dir, "--dry-run"], {
    encoding: "utf8", env: { ...process.env, CHALK_CONFIG: join(tmp, "no-config") },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /would upload short "Dry" as Private/);
});

test("without a sign-in, a real publish stops with how to sign in", () => {
  const dir = outDir("a", { "short.json": JSON.stringify({ title: "A" }), "short.mp4": "x", "description.txt": "d" });
  const r = spawnSync(process.execPath, [join(root, "bin/chalk.mjs"), "publish", dir], {
    encoding: "utf8", env: { ...process.env, CHALK_CONFIG: join(tmp, "no-config") },
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /chalk publish auth/);
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name}\n       ${err.message}`);
  }
}
console.log(`${tests.length - failed}/${tests.length} publish tests passed`);
process.exit(failed ? 1 : 0);
