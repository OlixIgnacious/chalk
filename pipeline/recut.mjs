// recut.mjs — one chapter, many outputs: a long video's segment as a Short, with its narration unchanged.
//
//   chalk shorts-plan <long-out>                      the segments (and scene ranges) that could be Shorts
//   chalk recut <long-out> NN [--out <dir>] [--title "…"] [--hold 3]
//
// A recut reuses what is already paid for: the source, its check, the script (grounded, approved), the voice takes
// and their word timings. It creates a Short dir whose short.json names where it came from, copies the takes with
// their times (so the pipeline's freshness checks hold on their own terms, no --force), regenerates the storyboard
// in portrait with no TTS, and adopts ingest and narrate. The pipeline then waits for a portrait frames/s00.py: the
// chalk-frames agent in recut mode keeps the same cues and text, stacks what sat side by side and keeps everything in
// the safe box. The pointer to the full video is drawn in the last frame's hold, never spoken and never appended at
// deliver (that would re-encode, stretch the captions and change the length after the fact).

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseScript, stripMarkers } from "../evals/lib/load.mjs";
import { adopt } from "./run.mjs";

const REPO = resolve(dirname(new URL(import.meta.url).pathname), "..");
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
/** S2's window, and S7's weak openers: a candidate outside the first or with the second needs a new script. */
export const MIN_S = 15, MAX_S = 60;
/** The end hold that carries the drawn pointer to the full video: long enough to read it (R6), counted in S2's 60 s. */
export const HOLD = 3;
const WEAK = /^\s*(so\b|today\b|in this (video|short)\b|have you ever\b|this is\b|hey\b|hi\b|hello\b|welcome\b|what's up\b|let's talk\b|did you know\b)/i;

/** A segment's narrated length and its scenes' lengths, from the takes. */
function timing(out, nn) {
  const f = join(out, "segments", nn, "video", "audio_meta.json");
  if (!existsSync(f)) return null;
  const voices = readJson(f).voices ?? [];
  const scenes = voices.map((v) => ({ frame: Number(v.frame ?? v.id), s: v.duration_s })).sort((a, b) => a.frame - b.frame);
  return { total: scenes.reduce((a, x) => a + x.s, 0), scenes };
}

/** What could be a Short: every segment of 15–60 s, and the scene ranges of longer ones. */
export function shortsPlan(out) {
  out = resolve(out);
  const video = readJson(join(out, "video.json"));
  const rows = [];
  for (const seg of video.segments ?? []) {
    const nn = seg.id;
    const t = timing(out, nn);
    const md = join(out, "segments", nn, "script.md");
    if (!t || !existsSync(md)) continue;
    const script = parseScript(readFileSync(md, "utf8"));
    const first = stripMarkers(script.scenes[0]?.entries[0]?.spoken ?? "");
    const words = first.split(/\s+/).filter(Boolean).length;
    const hookProblems = [...(WEAK.test(first) ? ["weak opener"] : []), ...(words > 12 ? [`${words} words`] : [])];
    // S7's timing: the first sentence over by 3 s, from the take's own word times
    const meta = readJson(join(out, "segments", nn, "video", "audio_meta.json"));
    const w1 = (meta.voices ?? []).find((v) => Number(v.frame ?? v.id) === 1)?.words ?? [];
    const k = first.split(/(?<=[.!?])\s/)[0].split(/\s+/).filter(Boolean).length;
    if (w1.length >= k && w1[k - 1].end > 3) hookProblems.push(`first sentence ends at ${w1[k - 1].end.toFixed(1)} s`);
    const stage = script.scenes.find((s) => s.stage)?.stage ?? "";
    if (t.total >= MIN_S && t.total <= MAX_S) {
      rows.push({ nn, title: seg.title, stage, seconds: +t.total.toFixed(1), first, hook: hookProblems, scenes: script.scenes.length,
        how: hookProblems.length || script.scenes.length > 3 ? "rewrite with /chalk-short from this part"
          : t.total + HOLD > MAX_S ? `rewrite with /chalk-short: ${t.total.toFixed(1)} s plus the ${HOLD} s pointer hold is over ${MAX_S} s`
          : `chalk recut ${out} ${nn}` });
    } else if (t.total > MAX_S) {
      // scene ranges that fit: a Short needs its own script for these (the takes run whole scenes)
      for (let a = 0; a < t.scenes.length; a++) {
        let sum = 0;
        for (let b = a; b < t.scenes.length && b < a + 3; b++) {
          sum += t.scenes[b].s;
          if (sum >= MIN_S && sum <= MAX_S) rows.push({ nn, title: seg.title, stage, seconds: +sum.toFixed(1), scenesRange: [a + 1, b + 1],
            first: stripMarkers(script.scenes[a]?.entries[0]?.spoken ?? ""), hook: [], scenes: b - a + 1,
            how: `rewrite with /chalk-short from scenes ${a + 1}–${b + 1} of part ${nn}` });
        }
      }
    }
  }
  return rows;
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/** Copy keeping the file's times, so a copied input is never newer than the takes built from it. */
function cpP(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  const st = statSync(from);
  utimesSync(to, st.atime, st.mtime);
}

export function recut(long, nn, { out, title, hold = HOLD } = {}) {
  long = resolve(long);
  nn = String(nn).padStart(2, "0");
  const video = readJson(join(long, "video.json"));
  const seg = (video.segments ?? []).find((s) => s.id === nn);
  if (!seg) throw new Error(`part ${nn} is not in ${long}/video.json`);
  const t = timing(long, nn);
  if (!t) throw new Error(`part ${nn} is not narrated yet`);
  if (t.total < MIN_S || t.total + hold > MAX_S) throw new Error(`part ${nn} is ${t.total.toFixed(1)} s; a recut keeps its narration and adds a ${hold} s pointer hold, so the part must be ${MIN_S}–${MAX_S - hold} s (S2). chalk shorts-plan ${long} lists what fits`);
  const dest = resolve(out ?? join(dirname(dirname(long)), "shorts-output", `${slug(video.title ?? basename(long))}-${nn}`));
  if (existsSync(join(dest, "short.json"))) throw new Error(`${dest} already has a short.json`);
  mkdirSync(join(dest, "segments", "00"), { recursive: true });
  // the source, its check and the lexicon: the same chapter, so the same facts.md still matches its hash
  for (const f of ["chapter.json", "lexicon.json", "facts.md", "facts-accepted.md"]) if (existsSync(join(long, f))) cpP(join(long, f), join(dest, f));
  cpP(join(long, "segments", nn, "script.md"), join(dest, "segments", "00", "script.md"));
  if (existsSync(join(long, "segments", nn, "examples"))) cpSync(join(long, "segments", nn, "examples"), join(dest, "segments", "00", "examples"), { recursive: true, preserveTimestamps: true });
  const published = existsSync(join(long, "published.json")) ? readJson(join(long, "published.json")) : {};
  const url = published.youtube?.url ?? published.url ?? video.full_video?.url ?? null;
  const short = {
    title: title ?? seg.title,
    thesis: video.thesis,
    ...(video.part_id ? { part_id: video.part_id } : {}),
    full_video: { title: video.title, ...(url ? { url } : {}) },
    hashtags: ["#Shorts", ...(video.hashtags ?? []).filter((h) => h.toLowerCase() !== "#shorts")],
    ...(video.theme ? { theme: video.theme } : {}),
    ...(video.pack ? { pack: video.pack } : {}),
    recut: { from: long, segment: nn, hold },
    segments: [{ id: "00", title: title ?? seg.title }],
  };
  writeFileSync(join(dest, "short.json"), JSON.stringify(short, null, 2) + "\n");
  // the takes, unchanged, with their times; a portrait storyboard; no TTS
  const from = join(long, "segments", nn, "video");
  const to = join(dest, "segments", "00", "video");
  const init = spawnSync("npx", ["hyperframes", "init", to, "--non-interactive", "--example=blank", "--skill=faceless-explainer"], { encoding: "utf8" });
  if (init.status !== 0) throw new Error(`hyperframes init failed: ${init.stderr.slice(-300)}`);
  const seg_ = (cmd, env = {}) => {
    const r = spawnSync("node", [join(REPO, "frames/seg.mjs"), cmd, "00"], { cwd: dest, encoding: "utf8", env: { ...process.env, ...env } });
    if (r.status !== 0) throw new Error(`seg ${cmd}: ${r.stderr || r.stdout}`);
  };
  seg_("setup");
  for (const f of ["audio_meta.json", "audio_meta.transcript.json", "audio_engine_meta.json"]) if (existsSync(join(from, f))) cpP(join(from, f), join(to, f));
  if (existsSync(join(from, "assets", "voice"))) cpSync(join(from, "assets", "voice"), join(to, "assets", "voice"), { recursive: true, preserveTimestamps: true });
  // the pointer to the full video is drawn in the last frame's hold
  seg_("sync", { END_HOLD: String(hold) });
  seg_("words");
  // the takes are this Short's narration now, chosen on purpose: stamp them as written here, so a change to the
  // narration code since the long video was voiced does not ask for a new take of words that are not changing
  const now = new Date();
  utimesSync(join(to, "audio_meta.json"), now, now);
  const n = adopt(dest, { format: "short", stages: ["ingest", "narrate"] });
  // the same source, ingested when the long video's was: the source check's grandfather rule follows the source
  const longState = existsSync(join(long, ".chalk", "pipeline.json")) ? readJson(join(long, ".chalk", "pipeline.json")) : null;
  const stateFile = join(dest, ".chalk", "pipeline.json");
  if (longState?.stages?.ingest?.at && existsSync(stateFile)) {
    const st = readJson(stateFile);
    if (st.stages?.ingest) st.stages.ingest.at = longState.stages.ingest.at;
    writeFileSync(stateFile, JSON.stringify(st, null, 2) + "\n");
  }
  return { dest, adopted: n, seconds: +t.total.toFixed(1) };
}

export async function main(cmd, argv) {
  const val = (n) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : undefined);
  const pos = argv.filter((a, i) => !a.startsWith("--") && !["--out", "--title", "--hold"].includes(argv[i - 1]));
  try {
    if (cmd === "shorts-plan") {
      if (!pos[0]) throw new Error("usage: chalk shorts-plan <long-out>");
      const rows = shortsPlan(pos[0]);
      if (!rows.length) console.log("shorts-plan: no part or scene range of 15–60 s is narrated yet");
      for (const r of rows) {
        console.log(`${r.nn}${r.scenesRange ? ` scenes ${r.scenesRange.join("–")}` : ""}  ${String(r.seconds).padStart(5)} s  ${(r.stage || "—").padEnd(10)} ${r.title}`);
        console.log(`      first line: "${r.first.slice(0, 90)}"${r.hook.length ? `  — hook: ${r.hook.join(", ")}` : ""}`);
        console.log(`      ${r.how}`);
      }
      return 0;
    }
    if (pos.length < 2) throw new Error('usage: chalk recut <long-out> NN [--out <dir>] [--title "…"] [--hold 3]');
    const r = recut(pos[0], pos[1], { out: val("--out"), title: val("--title"), hold: val("--hold") ? Number(val("--hold")) : undefined });
    console.log(`recut: ${r.dest} (${r.seconds} s of the same narration; ${r.adopted} stage(s) adopted). Next: chalk pipeline ${r.dest} — it waits for a portrait frames/s00.py (the chalk-frames agent, recut mode)`);
    return 0;
  } catch (e) {
    console.error(`${cmd}: ${e.message}`);
    return 2;
  }
}
