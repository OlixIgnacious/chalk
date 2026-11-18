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

// ── destinations: the neutral kit, shaped per platform ──

const { shortKit, longKit, validate } = await import("../publish/lib/kit.mjs");
const { shape } = await import("../publish/lib/shape.mjs");
const { platformEval } = await import("../publish/eval.mjs");
const { readRecord, targets } = await import("../publish/lib/destination.mjs");
const DEST = (await import("../publish/index.mjs")).DESTINATIONS;

const aShort = (extra = {}) => shortKit({ short: { title: "Two Sum in one pass", thesis: "A set turns two loops into one pass.",
  hashtags: ["#Shorts", "#LeetCode", "#Python", "#fyp"], full_video: { title: "DSA Patterns #3", url: "https://youtu.be/abc" }, ...extra },
  links: null, duration: 42, width: 1080, height: 1920 });

function kitDir(name, kit, extra = {}) {
  return outDir(name, { "kit.json": JSON.stringify(kit), [kit.files.video]: "x", "short.json": JSON.stringify({ title: kit.title }),
    "captions.srt": "1\n", ...extra });
}

test("the kit validates, and a long kit and a short kit both shape for every platform", () => {
  assert.deepEqual(validate(aShort()), []);
  const lk = longKit({ manifest: { title: "Running totals", thesis: "Keep one running total." }, chapters: [{ at: 0, title: "Hook" }, { at: 30, title: "Write" }], notebook: false, duration: 300 });
  assert.deepEqual(validate(lk), []);
  assert.deepEqual(validate({ ...lk, shape: "square" }).length, 1);
  for (const p of ["youtube", "instagram", "facebook", "tiktok", "linkedin", "x"]) for (const k of [aShort(), lk]) assert.ok(shape(p, k).text.length > 0, p);
});

test("a Short with #Shorts, a generic tag and a URL passes for YouTube, and its Instagram caption passes too", () => {
  const k = aShort();
  const dir = kitDir("shaped", k);
  const yt = platformEval(dir, k, {}, ["youtube"]).filter((r) => r.status === "fail");
  const ig = platformEval(dir, k, {}, ["instagram"]).filter((r) => r.status === "fail");
  assert.deepEqual(yt.map((r) => r.id), [], JSON.stringify(yt));
  assert.deepEqual(ig.map((r) => r.id), [], JSON.stringify(ig));
  const s = shape("instagram", k);
  assert.ok(s.text.startsWith("A set turns two loops into one pass."), "the thesis leads, inside the 125 characters a feed shows");
  assert.doesNotMatch(s.text, /https?:\/\//, "a dead link is not in an Instagram caption");
  assert.match(s.text, /link in bio/);
  assert.doesNotMatch(s.text, /#Shorts|#fyp/i);
  assert.match(shape("youtube", k).text, /#Shorts/, "#Shorts stays on YouTube");
  assert.ok(shape("x", k).text.length <= 280);
});

test("P criteria fail what a platform would refuse: too long, too many tags, a dead link, a weak opening", () => {
  const k = aShort();
  const long = { ...k, duration: 200 };
  const dir = kitDir("p", k);
  assert.ok(platformEval(dir, long, {}, ["youtube"]).some((r) => r.id === "P1·youtube" && r.status === "fail"), "a 200 s Short is over YouTube's 180");
  const forced = platformEval(dir, k, {}, ["instagram"], { instagram: { text: "Hey! See https://x.y #a #b #c #d #e #f" } });
  const failing = forced.filter((r) => r.status === "fail").map((r) => r.id.split("·")[0]).sort();
  assert.deepEqual(failing, ["P3", "P4", "P6"]);
});

test("published.json keeps one entry per platform, and the old YouTube-only shape is read as the youtube entry", () => {
  const dir = outDir("rec", { "published.json": JSON.stringify({ videoId: "abc", url: "https://youtu.be/abc", steps: { thumbnail: "ok" } }) });
  const r = readRecord(dir);
  assert.equal(r.youtube.videoId, "abc");
  assert.equal(r.youtube.steps.thumbnail, "ok");
  assert.equal(r.instagram, undefined, "a second platform starts empty: the first does not skip it");
});

test("where a build goes: --to, then the manifest's publish.to, then the channel's destinations for its shape, then youtube", () => {
  const ws = join(tmp, "ws2");
  mkdirSync(join(ws, "s"), { recursive: true });
  writeFileSync(join(ws, "channel.json"), JSON.stringify({ destinations: { youtube: {}, linkedin: { shapes: ["long"] }, instagram: {}, kit: { platforms: ["tiktok"] } } }));
  writeFileSync(join(ws, "s", "short.json"), JSON.stringify({ title: "t" }));
  assert.deepEqual(targets(join(ws, "s")), ["youtube", "instagram", "kit"], "linkedin is for long videos only here");
  assert.deepEqual(targets(join(ws, "s"), ["--to", "x"]), ["x"]);
  writeFileSync(join(ws, "s", "short.json"), JSON.stringify({ title: "t", publish: { to: ["tiktok"] } }));
  assert.deepEqual(targets(join(ws, "s")), ["tiktok"]);
  assert.throws(() => targets(join(ws, "s"), ["--to", "myspace"]), /unknown destination/);
  assert.deepEqual(targets(outDir("lonely", { "video.json": "{}" })), ["youtube"]);
});

test("nothing goes public by accident: Instagram, LinkedIn and X need --public-now; Facebook drafts; TikTok posts SELF_ONLY; X cannot schedule", () => {
  const k = aShort();
  const dir = kitDir("priv", k);
  for (const p of ["instagram", "linkedin", "x"]) assert.throws(() => DEST[p].plan(dir, []), /--public-now/, p);
  assert.throws(() => DEST.x.plan(dir, ["--public-now", "--at", "2099-01-01 10:00"]), /cannot schedule/);
  assert.equal(DEST.facebook.plan(dir, []).state, "DRAFT");
  assert.equal(DEST.facebook.plan(dir, ["--at", "2099-01-01 10:00"]).state, "SCHEDULED");
  assert.equal(DEST.facebook.plan(dir, ["--public-now"]).state, "PUBLISHED");
  assert.equal(DEST.tiktok.plan(dir, []).privacy, "SELF_ONLY");
});

test("each API destination plans its requests offline, in the platform's documented shape", () => {
  const k = aShort();
  const dir = kitDir("api", k);
  const li = DEST.linkedin.plan(dir, ["--public-now"]);
  assert.match(li.requests[0].url, /videos\?action=initializeUpload$/);
  assert.equal(li.requests[0].body.initializeUploadRequest.fileSizeBytes, 1);
  assert.equal(li.requests.at(-1).body.commentary, shape("linkedin", k).text);
  const ig = DEST.instagram.plan(dir, ["--public-now", "--dry-run"]);
  assert.equal(ig.requests[1].body.media_type, "REELS");
  assert.doesNotMatch(ig.requests[1].body.caption, /https?:/);
  const tt = DEST.tiktok.plan(dir, []);
  assert.deepEqual(tt.requests[0].body.source_info, { source: "FILE_UPLOAD", video_size: 1, chunk_size: 1, total_chunk_count: 1 });
  const xp = DEST.x.plan(dir, ["--public-now"]);
  assert.ok(xp.requests.at(-1).body.text.length <= 280);
  assert.throws(() => DEST.instagram.plan(dir, ["--public-now"]), /host/, "no host command, no Instagram publish");
});

test("--to kit writes a folder per platform with the file, the caption shaped for it, and what to set in the app", async () => {
  const k = aShort();
  const dir = kitDir("kitdest", k);
  const rec = {};
  assert.equal(await DEST.kit.publish(dir, ["--platforms", "instagram,x"], rec, () => {}), 0);
  const { readFileSync, existsSync } = await import("node:fs");
  assert.ok(existsSync(join(dir, "publish/instagram/short.mp4")));
  assert.match(readFileSync(join(dir, "publish/instagram/caption.txt"), "utf8"), /^A set turns two loops/);
  assert.match(readFileSync(join(dir, "publish/instagram/NOTES.md"), "utf8"), /## Set in the app/);
  assert.ok(readFileSync(join(dir, "publish/x/caption.txt"), "utf8").trim().length <= 280);
  assert.deepEqual(rec.platforms, ["instagram", "x"]);
});

test("chalk publish --plan runs the destination pack and sends nothing", () => {
  const k = aShort();
  const dir = kitDir("plan", k);
  const r = spawnSync(process.execPath, [join(root, "bin/chalk.mjs"), "publish", dir, "--to", "youtube,instagram", "--plan"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /P6·instagram/);
});

test("a script's or research brief's references reach the description as sources and plan.md as the audit trail", async () => {
  const { citedRefs, refSources, refsSection, describe } = await import("../publish/lib/kit.mjs");
  const chapter = { blocks: [
    { id: "p001", text: "a", ref: [{ url: "https://www.example.org/a", retrieved: "2026-11-18", quote: "said a" }] },
    { id: "p002", text: "b", ref: [{ title: "Poor Richard's Almanack, 1748" }] },
    { id: "p003", text: "c", ref: [{ url: "https://other.org/c", title: "The council" }] }] };
  const refs = citedRefs(chapter, ['- spoken: "x"\n  display: "x"\n  source: [p001, p002]\n']);
  assert.deepEqual(refs.map((r) => r.block), ["p001", "p002"], "only what the scripts cite");
  assert.deepEqual(refSources(refs), [{ name: "example.org", url: "https://www.example.org/a" }]);
  assert.match(refsSection(refs).join("\n"), /\| `p001` \| https:\/\/www\.example\.org\/a \| 2026-11-18 \| "said a" \|/);
  const k = longKit({ manifest: { title: "T", sources: refSources(refs) }, chapters: [{ at: 0, title: "a" }], notebook: false, duration: 60 });
  assert.match(describe(k), /Sources:\nexample\.org: https:\/\/www\.example\.org\/a\n$/);
  const none = longKit({ manifest: { title: "T" }, chapters: [{ at: 0, title: "a" }], notebook: false, duration: 60 });
  assert.doesNotMatch(describe(none), /Sources/, "a video with no references reads as it always has");
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
