#!/usr/bin/env node
// smoke.mjs — the Short format: deliver's gates and kit, and the S criteria on a built-by-hand Short.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repo = resolve(root, "../..");
const deliverJs = join(root, "skills/chalk-short/scripts/deliver.mjs");
const { evaluate } = await import(join(repo, "evals/run.mjs"));
const tmp = mkdtempSync(join(tmpdir(), "chalk-short-"));
const haveFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const write = (p, body) => {
  mkdirSync(resolve(p, ".."), { recursive: true });
  writeFileSync(p, body);
};

const CHAPTER = {
  title: "t",
  blocks: [
    { id: "p001", kind: "para", text: "Does any value appear twice? Keep a set of what you have seen." },
    { id: "c002", kind: "code", lang: "python", text: "def f(xs):\n    seen = set()\n    return seen" },
  ],
};
const SCRIPT = (last = "[pipeline]", extraScenes = 0) => `# 00 — Seen it?

## Scene 1 — the question
visual: text card (tier 1)
duration: ~9s

- spoken: "Does any value appear twice?"
  display: "Does any value appear twice?"
  source: [p001]

- spoken: "Keep a set of what you have seen."
  display: "Keep a set of what you have seen."
  source: [p001]
${Array.from({ length: extraScenes }, (_, i) => `
## Scene ${i + 2} — more
visual: text card (tier 1)
duration: ~9s

- spoken: "Keep a set."
  display: "Keep a set."
  source: [p001]
`).join("")}
- spoken: "The full walkthrough is on the channel."
  display: "The full walkthrough is on the channel."
  source: ${last}
`;
const SHORT = {
  title: "Seen it? One pass",
  thesis: "A set checks each value once.",
  part_id: "seen-set",
  full_video: { title: "DSA Patterns #1", url: "https://youtu.be/x" },
  notebook: { publish_as: "01-seen-set/contains-duplicate.ipynb" },
  hashtags: ["#Shorts", "#LeetCode"],
  segments: [{ id: "00", title: "Seen it?" }],
};
const CHANNEL = { series: { name: "DSA Patterns", parts: [{ id: "seen-set", title: "The Seen-Set" }] }, notebooks: { repo: "o/r" } };

function shortDir(name, { size = "1080x1920", seconds = 20, short = SHORT, script = SCRIPT() } = {}) {
  const dir = join(tmp, name);
  write(join(dir, "short.json"), JSON.stringify(short));
  write(join(dir, "chapter.json"), JSON.stringify(CHAPTER));
  write(join(dir, "channel.json"), JSON.stringify(CHANNEL));
  write(join(dir, "segments/00/script.md"), script);
  write(join(dir, "segments/00/segment.vtt"), "WEBVTT\n\n00:00.000 --> 00:02.000\nDoes any value appear twice?\n");
  if (haveFfmpeg) {
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=black:size=${size}:rate=30:duration=${seconds}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", join(dir, "segments/00/segment.mp4")]);
  }
  return dir;
}
const deliver = (dir, ...a) => spawnSync(process.execPath, [deliverJs, dir, ...a], { encoding: "utf8" });

test("deliver: a portrait render becomes short.mp4 with captions, a description that links the full video and the notebook, and a plan", () => {
  if (!haveFfmpeg) return "no ffmpeg";
  const dir = shortDir("ok");
  const r = deliver(dir);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ["short.mp4", "captions.srt", "description.txt", "plan.md"]) assert.ok(existsSync(join(dir, f)), f);
  const d = readFileSync(join(dir, "description.txt"), "utf8");
  assert.match(d, /^Seen it\? One pass\n\nA set checks each value once\./);
  assert.match(d, /Full walkthrough: DSA Patterns #1\nhttps:\/\/youtu\.be\/x/);
  assert.match(d, /colab\.research\.google\.com\/github\/o\/r\/blob\/main\/01-seen-set\/contains-duplicate\.ipynb/);
  assert.match(d, /#Shorts #LeetCode/);
  assert.match(readFileSync(join(dir, "plan.md"), "utf8"), /Keep a set of what you have seen\. — `p001`/);
});

test("deliver: a landscape render, an ungrounded line or a title naming the book writes nothing", () => {
  if (!haveFfmpeg) return "no ffmpeg";
  const wide = shortDir("wide", { size: "1920x1080" });
  let r = deliver(wide);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /1920x1080 .* a Short is 1080x1920/);
  assert.ok(!existsSync(join(wide, "short.mp4")));
  const bare = shortDir("bare", { script: SCRIPT("[]") });
  r = deliver(bare);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /step-3 gate/);
  const book = shortDir("book", { short: { ...SHORT, title: "From the book: seen sets" } });
  r = deliver(book);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /title says "book"/);
});

test("deliver: over 3 minutes is refused; over 60 s is allowed with a warning", () => {
  if (!haveFfmpeg) return "no ffmpeg";
  const long = shortDir("long", { seconds: 75 });
  const r = deliver(long);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /over 60s/);
  const tooLong = shortDir("toolong", { seconds: 181 });
  assert.equal(deliver(tooLong).status, 1);
});

test("eval S1/S5/S6: one part of at most three scenes, a clean title, ending on a [pipeline] pointer", () => {
  const ok = evaluate(shortDir("ev-ok"), { format: "short" });
  const st = (r, id) => r.results.find((x) => x.id === id).status;
  assert.equal(st(ok, "S1"), "pass");
  assert.equal(st(ok, "S5"), "pass");
  assert.equal(st(ok, "S6"), "pass");
  const many = evaluate(shortDir("ev-many", { script: SCRIPT("[pipeline]", 3) }), { format: "short" });
  assert.equal(st(many, "S1"), "fail");
  const noPointer = evaluate(shortDir("ev-np", { script: SCRIPT("[p001]") }), { format: "short" });
  assert.equal(st(noPointer, "S6"), "fail");
  const book = evaluate(shortDir("ev-book", { short: { ...SHORT, title: "The book's seen-set" } }), { format: "short" });
  assert.equal(st(book, "S5"), "fail");
});

test("eval S4: anything drawn below y=1320 in a frame is in the platform's zone", () => {
  const dir = shortDir("ev-s4");
  const frame = (top) => `<template><div id="root" data-width="1080" data-height="1920"><div id="f01-x-stage">
    <div id="f01-x-a" style="position:absolute;left:104px;top:${top}px;">hi</div></div></div><script>tl.set({}, {}, 5);</script></template>`;
  write(join(dir, "segments/00/video/compositions/frames/f01-x.html"), frame(1400));
  const st = () => evaluate(dir, { format: "short" }).results.find((x) => x.id === "S4");
  assert.equal(st().status, "fail");
  assert.match(st().evidence.join(), /#f01-x-a at y=1400/);
  write(join(dir, "segments/00/video/compositions/frames/f01-x.html"), frame(900));
  assert.equal(st().status, "pass");
});

let failed = 0;
let skipped = 0;
for (const [name, fn] of tests) {
  try {
    const why = await fn();
    if (typeof why === "string") {
      skipped++;
      console.log(`  skip  ${name} (${why})`);
    } else console.log(`  ok    ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        ${String(err.message).split("\n").join("\n        ")}`);
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\nshort smoke: ${tests.length - failed - skipped}/${tests.length - skipped} passed${skipped ? `, ${skipped} skipped` : ""}`);
process.exit(failed ? 1 : 0);
