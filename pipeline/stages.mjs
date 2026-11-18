// stages.mjs — each shape's build (long, lesson, short) as a list of stages, each with what it reads, what it writes and how
// it runs. The runner (run.mjs) hashes `inputs`, compares them with the last run, and reruns a stage only
// when they changed or its `outputs` are missing.
//
// kind:
//   run      mechanical; the runner runs `cmd` itself
//   author   written by you or an agent (outline, scripts, frame specs, review); the runner says what is
//            missing and stops
//   approve  a human stop; `chalk pipeline approve <out> --<name>` records what was approved
//   gate     a stop on something outside this build (`gate(o)` says done or waiting, and why); no agent writes it
//
// `per: "segment"` stages run once per segments/NN; their paths take the segment id as `nn`.

import { join } from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { openDebt } from "./debt.mjs";
import { checkFacts } from "../core/scripts/facts.mjs";
import { packOf, manifestOf } from "../formats/index.mjs";
import { PACKS } from "../packs/index.mjs";

export const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
/** Words the viewer must never hear: the pack's (a coding lesson never names the book), a Short's (S5: it never
 * names its source), and the channel's banned_terms. → ["--banned", "a,b"] or [] */
const SOURCE_WORDS = ["chapter", "chapters", "book", "section", "the author"];
const banned = (o, shape) => {
  const p = packOf(shape, { manifest: manifestOf(o.out), channel: o.channel });
  const words = [...new Set([...(PACKS[p]?.BANNED ?? []), ...(shape === "short" ? SOURCE_WORDS : []), ...(o.channel?.banned_terms ?? [])])];
  return words.length ? ["--banned", words.join(",")] : [];
};
/** The genre pack this build is judged by, as an eval input: its criteria change the verdict. */
export const packDir = (o, shape) => {
  const p = packOf(shape, { manifest: manifestOf(o.out), channel: o.channel });
  return p ? [join(REPO, "packs", p)] : [];
};
const core = (f) => join(REPO, "core/scripts", f);
const frames = (f) => join(REPO, "frames", f);
const chalk = join(REPO, "bin/chalk.mjs");
const coreBin = join(REPO, "core/bin/chalk-core.mjs");

/** Files every narration depends on besides the segment's own script. */
const spokenOnly = (md) => md.split("\n").filter((l) => /^##\s/.test(l) || /^\s*-\s*spoken:/.test(l)).join("\n");
const lexiconSpoken = (t) => {
  try {
    return JSON.stringify((JSON.parse(t).terms ?? []).map(({ display, spoken }) => [display, spoken]));
  } catch {
    return t;
  }
};
// what every part's frames share from video.json: the part list (the "NN / total" tag and the progress strip),
// stage renames, the theme, and the notebook outline (run panels number their cells from it) — not, say, accepted
const videoForFrames = (t) => {
  try {
    const v = JSON.parse(t);
    return JSON.stringify([v.segments, v.stage_names, v.theme, v.notebook?.sections?.map((s) => [s.code, s.run])]);
  } catch { return t; }
};
// the approval of the scripts reads grounding.md for being there, not for what it says: the report is rewritten
// once the frame specs exist (grounding-frames), and that must not take back an approval of unchanged scripts
const GROUNDED = { path: "grounding.md", as: "present", only: () => "" };
// deliver reads video.json for the title, thesis, part list and notebook; a waiver or the thesis's citation
// changes what is checked, not the video
const videoForDeliver = (t) => {
  try {
    const { accepted, thesis_source, ...v } = JSON.parse(t);
    return JSON.stringify(v);
  } catch { return t; }
};
const stageLine = (md) => md.split("\n").filter((l) => /^stage:/.test(l)).join("\n");
/** every listed part's stage line: the strip on each part's frames is built from all of them */
const allStages = (o) => {
  let ids = [];
  try { ids = JSON.parse(readFileSync(join(o.out, "video.json"), "utf8")).segments.map((s) => s.id); } catch { /* none */ }
  return ids.map((id) => ({ path: `segments/${id}/script.md`, as: "stage", only: stageLine }));
};

// The source check landed on this date: a build whose source was ingested before it, or that is already watched,
// is not held for a facts.md it never had. Writing one opts it in: a facts.md that exists is always checked.
export const SOURCE_CHECK_SINCE = "2026-11-17T12:00:00Z";
const FACTCHECK = "dispatch the chalk-factcheck agent on the output dir (it runs `chalk-core facts <out> --claims` for its worklist and writes facts.md), " +
  "then show the user facts.md; a contradicted claim waits until the source is fixed or the user waives it in facts-accepted.md";

/** The source check: done once per version of the source (facts.md names the hash of the blocks it checked). */
const sourceCheck = {
  name: "source-check",
  kind: "author",
  inputs: () => [],
  outputs: () => ["facts.md"],
  gate: (o) => {
    if (!existsSync(join(o.out, "chapter.json"))) return { status: "waiting", why: "chapter.json is not there yet" };
    if (!existsSync(join(o.out, "facts.md"))) {
      const ingested = o.state.stages.ingest?.at;
      if (o.state.approvals.watched || (ingested && ingested < SOURCE_CHECK_SINCE)) return { status: "done" };
    }
    const r = checkFacts(o.out);
    if (r.status === "done") return { status: "done" };
    return { status: "waiting", why: r.status === "missing" ? FACTCHECK : `${r.why} — ${r.status === "stale" ? FACTCHECK : "fix the source, or the user waives it in facts-accepted.md"}` };
  },
  missing: FACTCHECK,
};

// The frames reviewer landed on this date; the same grandfather rule as the source check.
export const FRAMES_REVIEW_SINCE = "2026-11-17T18:00:00Z";
const FRAMES_REVIEW = "dispatch the chalk-frames-reviewer agent for this segment (it runs `chalk stills NN --at-cues` and writes " +
  "segments/NN/frames-review.md ending in VERDICT: PASS or VERDICT: FIXES: n); a FIXES verdict waits until the frame spec is fixed and the frames rebuilt";
/** The verdict line of a frames review: "PASS", "FIXES: n", or null when the review has none. */
export const framesVerdict = (md) => md.match(/^VERDICT:\s*(PASS|FIXES:\s*\d+)\s*$/m)?.[1].replace(/\s+/g, " ") ?? null;

/** Before the render, an agent looks at three stills per reveal; a review that asks for fixes holds the render. */
const framesReview = {
  name: "frames-review",
  kind: "author",
  per: "segment",
  inputs: () => [],
  outputs: (o, nn) => [`segments/${nn}/frames-review.md`],
  gate: (o, nn) => {
    const review = join(o.out, "segments", nn, "frames-review.md");
    const built = join(o.out, "segments", nn, "video", "index.html");
    if (!existsSync(built)) return { status: "waiting", why: `segments/${nn}/video/index.html is not built yet` };
    if (!existsSync(review)) {
      const ingested = o.state.stages.ingest?.at;
      if (o.state.approvals.watched || (ingested && ingested < FRAMES_REVIEW_SINCE)) return { status: "done" };
      return { status: "waiting", why: FRAMES_REVIEW.replace(/NN/g, nn) };
    }
    if (statSync(review).mtimeMs < statSync(built).mtimeMs) {
      return { status: "waiting", why: `segments/${nn}/frames-review.md is older than the frames it reviewed: ${FRAMES_REVIEW.replace(/NN/g, nn)}` };
    }
    const v = framesVerdict(readFileSync(review, "utf8"));
    if (!v) return { status: "waiting", why: `segments/${nn}/frames-review.md has no "VERDICT: PASS" or "VERDICT: FIXES: n" line` };
    if (v !== "PASS") return { status: "waiting", why: `segments/${nn}/frames-review.md: ${v} — fix frames/s${nn}.py as it says; the frames rebuild and the review runs again` };
    return { status: "done" };
  },
  missing: FRAMES_REVIEW,
};

const NARRATE_CODE = [core("narrate.mjs"), core("kokoro_narrate.py"), frames("seg.mjs")];
const ALIGN_CODE = [core("build-tokens.mjs"), core("align-captions.mjs"), core("apply-display.mjs")];
const FRAME_CODE = [frames("framelib.py"), frames("gen.py"), frames("build.sh"), core("fix-index.mjs")];

// A research build (chalk pipeline <out> --topic "…") starts with no document: the chalk-research agent writes a
// brief from fetched pages, a reference per paragraph, and the person approves it before anything is outlined —
// a wrong brief makes everything after it wrong, and it is cheapest to fix here. A document build skips both.
const RESEARCH = "dispatch the chalk-research agent (it writes research.md: short paragraphs, each with [ref: url | retrieved date | \"the sentence it rests on\"]), then show it to the user";
const research = {
  name: "research",
  kind: "author",
  skip: (o) => !o.topic,
  inputs: () => [],
  outputs: () => ["research.md"],
  missing: RESEARCH,
};
const researchApproved = {
  name: "research-approved",
  kind: "approve",
  skip: (o) => !o.topic,
  inputs: () => ["research.md"],
  missing: "your read of research.md: every paragraph says only what its reference says — then: chalk pipeline approve <out> --research",
};

export const long = [
  research,
  researchApproved,
  {
    name: "ingest",
    kind: "run",
    inputs: (o) => (o.doc ? [o.doc, core("ingest.mjs")] : []),
    outputs: () => ["chapter.json"],
    cmd: (o) => (o.doc ? ["node", chalk, "ingest", o.doc, "--out", "chapter.json", ...(o.kind ? ["--kind", o.kind] : [])] : null),
    missing: "chapter.json — pass --doc <source> once so the runner can ingest it",
  },
  sourceCheck,
  {
    name: "outline",
    kind: "author",
    inputs: () => ["chapter.json"],
    outputs: () => ["outline.md"],
    missing: "outline.md — step 2 of the skill (references/step-2-outline.md)",
  },
  {
    name: "scripts",
    kind: "author",
    inputs: () => ["outline.md"],
    outputs: (o) => (o.segments.length ? o.segments.map((nn) => `segments/${nn}/script.md`) : ["segments/00/script.md"]),
    missing: "segments/NN/script.md for every part — step 3 of the skill",
  },
  {
    name: "text-gates",
    kind: "run",
    inputs: (o) => ["chapter.json", "outline.md", "video.json", ...o.segments.map((nn) => `segments/${nn}/script.md`), "lexicon.json",
      ...o.segments.map((nn) => `segments/${nn}/examples`)],
    outputs: () => [],
    cmd: (o) => [
      ["node", coreBin, "check-readability", ...o.segments.map((nn) => `segments/${nn}/script.md`), "--chapter", "chapter.json"],
      ["node", coreBin, "check-spoken", ...o.segments.map((nn) => `segments/${nn}/script.md`), ...banned(o, "long"), "--max-avg", "16",
        ...(o.channel?.min_you != null ? ["--min-you", String(o.channel.min_you)] : [])],
      ["node", chalk, "eval", ".", "--format", "long", "--text", "--no-write", ...(o.channelPath ? ["--channel", o.channelPath] : [])],
    ],
  },
  {
    name: "grounding",
    kind: "author",
    inputs: () => [],
    outputs: () => ["grounding.md"],
    newerThan: (o) => ["chapter.json", ...o.segments.map((nn) => `segments/${nn}/script.md`)],
    missing: "dispatch the chalk-grounding agent on the output dir (it writes grounding.md), and show it to the user with the scripts",
  },
  {
    // the learner, before anything is voiced: it reads the scripts as captions and screens (chalk read-aloud), so
    // its questions reach the author while the fix is a script edit or a source sentence, not a re-narration
    name: "learner-scripts",
    kind: "author",
    inputs: () => [],
    outputs: () => ["learner-scripts.md"],
    newerThan: (o) => o.segments.map((nn) => `segments/${nn}/script.md`),
    // a learner who watched the render of these very scripts (learner.md newer than all of them) has already read them
    gate: (o) => {
      const t = (p) => (existsSync(join(o.out, p)) ? statSync(join(o.out, p)).mtimeMs : null);
      const newest = Math.max(0, ...o.segments.map((nn) => t(`segments/${nn}/script.md`) ?? 0));
      for (const f of ["learner-scripts.md", "learner.md"]) if (t(f) != null && t(f) >= newest) return { status: "done" };
      const why = t("learner-scripts.md") != null ? "learner-scripts.md is older than a script: " : "";
      return { status: "waiting", why: why + "dispatch the chalk-learner agent in script mode (it reads `chalk read-aloud <out>` and writes learner-scripts.md), and show it to the user with the scripts" };
    },
    missing: "dispatch the chalk-learner agent in script mode (it reads `chalk read-aloud <out>` and writes learner-scripts.md), and show it to the user with the scripts",
  },
  {
    name: "scripts-approved",
    kind: "approve",
    inputs: (o) => ["outline.md", GROUNDED, ...o.segments.map((nn) => `segments/${nn}/script.md`)],
    missing: "your review of the outline and every script — then: chalk pipeline approve <out> --scripts",
  },
  {
    name: "narrate",
    kind: "run",
    per: "segment",
    jobs: true,
    // what the voice says and how it is cut into takes: the spoken lines, the scene breaks and each lexicon
    // term's spoken form. A citation, a display word or an on-screen line does not re-narrate a part.
    inputs: (o, nn) => [{ path: `segments/${nn}/script.md`, as: "spoken", only: spokenOnly }, { path: "lexicon.json", as: "spoken", only: lexiconSpoken },
      o.channelPath, ...NARRATE_CODE].filter(Boolean),
    outputs: (o, nn) => [`segments/${nn}/video/audio_meta.json`, `work/${nn}/words.json`],
    cmd: (o, nn) => ["bash", frames("build.sh"), nn, "narrate"],
  },
  {
    name: "align",
    kind: "run",
    per: "segment",
    inputs: (o, nn) => [`segments/${nn}/script.md`, "lexicon.json", `work/${nn}/words.json`, ...ALIGN_CODE],
    outputs: (o, nn) => [`work/${nn}/captions.json`],
    cmd: (o, nn) => ["bash", frames("build.sh"), nn, "align"],
  },
  {
    // the pipeline items earlier builds' resolutions left open (pipeline/debt.mjs). They block a new build's
    // frame specs, so this round's guards are in the frame library before the next video copies frame code.
    // A build whose frame specs are all written is past this point and is not held back.
    name: "pipeline-debt",
    kind: "gate",
    inputs: () => [],
    outputs: () => [],
    gate: (o) => {
      if (o.segments.length && o.segments.every((nn) => existsSync(join(o.out, `frames/s${nn}.py`)))) return { status: "done" };
      const open = openDebt(o, REPO);
      if (!open.length) return { status: "done" };
      const list = open.map((d) => `\n     ${d.file}:${d.line}  ${d.text}${d.why === "open" ? "" : `  (${d.why})`}`).join("");
      return { status: "waiting", why: `${open.length} pipeline item(s) from earlier builds are still open:${list}\n   ` +
        "Land each in chalk and tick it with its commit (- [x] … — <sha>), or mark it \"deferred: <why>\"." };
    },
    missing: "the open pipeline items of earlier builds",
  },
  {
    name: "frame-spec",
    kind: "author",
    per: "segment",
    inputs: () => [],
    outputs: (o, nn) => [`frames/s${nn}.py`],
    missing: "frames/sNN.py — one per segment (the chalk-frames agent writes them, in parallel)",
  },
  {
    // the same report, again once the frame specs exist: on-screen text is a claim too, and a frame edited after
    // grounding.md was written (a recap reworded, a label added) has not been checked against its block
    name: "grounding-frames",
    kind: "author",
    inputs: () => [],
    outputs: () => ["grounding.md"],
    newerThan: (o) => ["chapter.json", "video.json", ...o.segments.flatMap((nn) => [`segments/${nn}/script.md`, `frames/s${nn}.py`])],
    missing: "re-run the chalk-grounding agent over the frame text as well (frames/sNN.py changed after grounding.md was written)",
  },
  {
    name: "frames",
    kind: "run",
    per: "segment",
    inputs: (o, nn) => [`frames/s${nn}.py`, `segments/${nn}/video/audio_meta.json`, "chapter.json", `segments/${nn}/examples`,
      { path: "video.json", as: "frames", only: videoForFrames }, ...allStages(o), ...FRAME_CODE],
    outputs: (o, nn) => [`segments/${nn}/video/index.html`],
    cmd: (o, nn) => ["bash", frames("build.sh"), nn, "frames"],
  },
  framesReview,
  {
    name: "render",
    kind: "run",
    per: "segment",
    jobs: true,
    inputs: (o, nn) => [`segments/${nn}/video/index.html`, `segments/${nn}/video/compositions`, `segments/${nn}/video/caption_groups.json`],
    outputs: (o, nn) => [`segments/${nn}/segment.mp4`, `segments/${nn}/segment.vtt`],
    // then drop this part's old stills: whoever reads work/stills next would see frames that no longer exist
    cmd: (o, nn) => [["bash", frames("build.sh"), nn, "render"],
      ["bash", "-c", `rm -f work/stills/${nn}.png work/stills/${nn}-*.png work/stills/${nn}_*.png`]],
  },
  {
    name: "deliver",
    kind: "run",
    inputs: (o) => [...o.segments.flatMap((nn) => [`segments/${nn}/segment.mp4`, `segments/${nn}/segment.vtt`, `segments/${nn}/script.md`]),
      { path: "video.json", as: "deliver", only: videoForDeliver }, "chapter.json", join(REPO, "formats/long/skills/chalk-long/scripts")],
    outputs: (o) => ["video.mp4", "captions.srt", "chapters.txt", "description.txt", "kit.json", "plan.md", ...(o.notebook ? ["notebook.ipynb"] : [])],
    cmd: (o) => ["node", chalk, "deliver", ".", "--format", "long", "--keep-work", ...(o.notebook ? ["--notebook"] : [])],
  },
  {
    name: "eval",
    kind: "run",
    inputs: (o) => ["video.mp4", "captions.srt", "video.json", ...o.segments.map((nn) => `segments/${nn}/script.md`), join(REPO, "evals"),
      join(REPO, "formats/long/eval"), ...packDir(o, "long")],
    outputs: () => ["eval.json", "eval.md"],
    cmd: (o) => ["node", chalk, "eval", ".", "--format", "long", "--deep", ...(o.channelPath ? ["--channel", o.channelPath] : [])],
    // a failing criterion is a finding for the reviewer, not a reason to stop before it
    allowFail: true,
  },
  {
    name: "learner",
    kind: "author",
    inputs: () => [],
    outputs: () => ["learner.md"],
    newerThan: ["video.mp4", "captions.srt"],
    missing: "dispatch the chalk-learner agent on the output dir with the audience (it writes learner.md)",
  },
  {
    name: "notebook-review",
    kind: "author",
    inputs: () => [],
    // only when a notebook was asked for: with no outputs the stage is done
    outputs: (o) => (o.notebook ? ["notebook-review.md"] : []),
    newerThan: ["notebook.ipynb"],
    missing: "dispatch the chalk-notebook-reviewer agent on the output dir (it runs the notebook and writes notebook-review.md)",
  },
  {
    name: "review",
    kind: "author",
    inputs: () => ["eval.json"],
    outputs: () => ["review.md"],
    newerThan: ["eval.json", "learner.md", "grounding.md", "notebook-review.md"],
    missing: "dispatch the chalk-reviewer agent on the output dir (it writes review.md)",
  },
  {
    name: "resolve",
    kind: "author",
    inputs: () => [],
    outputs: () => ["resolution.md"],
    newerThan: ["eval.json", "grounding.md", "learner.md", "review.md", "notebook-review.md"],
    missing: "dispatch the chalk-resolver agent on the output dir (it settles where the reports disagree and writes resolution.md)",
  },
  {
    name: "watched",
    kind: "approve",
    inputs: () => ["video.mp4", "resolution.md"],
    missing: "your watch of video.mp4 against resolution.md — then: chalk pipeline approve <out> --watched",
  },
];

/** An interactive lesson: the same voice, alignment and frames; a syllabus, lesson.json and a page around them. */
const same = (name) => long.find((s) => s.name === name);
const LESSON_SKILL = join(REPO, "formats/lesson/skills/chalk");
export const lesson = [
  same("research"),
  same("research-approved"),
  same("ingest"),
  same("source-check"),
  {
    name: "syllabus",
    kind: "author",
    inputs: () => ["chapter.json"],
    outputs: () => ["syllabus.md"],
    missing: "syllabus.md — step 2 of the lesson skill (references/step-2-syllabus.md)",
  },
  { ...same("scripts"), inputs: () => ["syllabus.md"] },
  {
    ...same("text-gates"),
    inputs: (o) => ["chapter.json", "syllabus.md", "lesson.json", ...o.segments.map((nn) => `segments/${nn}/script.md`), "lexicon.json"],
    cmd: (o) => [
      ["node", coreBin, "check-readability", ...o.segments.map((nn) => `segments/${nn}/script.md`), "--chapter", "chapter.json"],
      ["node", coreBin, "check-spoken", ...o.segments.map((nn) => `segments/${nn}/script.md`)],
      ["node", chalk, "eval", ".", "--format", "lesson", "--no-write", ...(o.channelPath ? ["--channel", o.channelPath] : [])],
    ],
  },
  same("grounding"),
  same("learner-scripts"),
  { ...same("scripts-approved"), inputs: (o) => ["syllabus.md", "lesson.json", GROUNDED, ...o.segments.map((nn) => `segments/${nn}/script.md`)],
    missing: "your review of the syllabus, the checkpoints and every script — then: chalk pipeline approve <out> --scripts" },
  same("narrate"),
  same("align"),
  same("pipeline-debt"),
  same("frame-spec"),
  same("grounding-frames"),
  same("frames"),
  same("frames-review"),
  same("render"),
  {
    name: "lesson-page",
    kind: "run",
    inputs: (o) => ["lesson.json", join(LESSON_SKILL, "assets/player"), join(LESSON_SKILL, "scripts/build-lesson-page.mjs")],
    outputs: () => ["lesson.html"],
    cmd: () => ["node", chalk, "lesson-page", "lesson.json"],
  },
  {
    name: "deliver",
    kind: "run",
    inputs: (o) => [...o.segments.flatMap((nn) => [`segments/${nn}/segment.mp4`, `segments/${nn}/script.md`]), "lesson.json",
      join(LESSON_SKILL, "scripts/deliver.mjs")],
    outputs: () => ["lesson.mp4", "lesson-plan.md"],
    cmd: () => ["node", chalk, "deliver", ".", "--format", "lesson", "--keep-work"],
  },
  { ...same("eval"), inputs: (o) => ["lesson.mp4", "lesson.html", "lesson.json", ...o.segments.map((nn) => `segments/${nn}/script.md`),
    join(REPO, "evals"), join(REPO, "formats/lesson/eval"), ...packDir(o, "lesson")],
    cmd: (o) => ["node", chalk, "eval", ".", "--format", "lesson", "--deep", ...(o.channelPath ? ["--channel", o.channelPath] : [])] },
  { ...same("learner"), newerThan: ["lesson.mp4", "lesson.html"] },
  same("review"),
  same("resolve"),
  { ...same("watched"), inputs: () => ["lesson.mp4", "lesson.html", "resolution.md"],
    missing: "your run through lesson.html against resolution.md — then: chalk pipeline approve <out> --watched" },
];

/** A Short: one idea from the chapter as a vertical video for YouTube Shorts and Instagram Reels. One part,
 * portrait frames (short.json switches framelib and the Hyperframes project to 1080x1920), captions burned
 * in, and no outline: short.json names the idea and the script is the plan. */
const SHORT_SKILL = join(REPO, "formats/short/skills/chalk-short");
export const short = [
  same("research"),
  same("research-approved"),
  same("ingest"),
  same("source-check"),
  { ...same("scripts"), inputs: () => ["chapter.json", "short.json"], outputs: () => ["segments/00/script.md"],
    missing: "short.json and segments/00/script.md — the chalk-short skill" },
  {
    ...same("text-gates"),
    inputs: (o) => ["chapter.json", "short.json", ...o.segments.map((nn) => `segments/${nn}/script.md`), "lexicon.json",
      ...o.segments.map((nn) => `segments/${nn}/examples`)],
    cmd: (o) => [
      ["node", coreBin, "check-readability", ...o.segments.map((nn) => `segments/${nn}/script.md`), "--chapter", "chapter.json"],
      ["node", coreBin, "check-spoken", ...o.segments.map((nn) => `segments/${nn}/script.md`), ...banned(o, "short"), "--max-avg", "16"],
      ["node", chalk, "eval", ".", "--format", "short", "--text", "--no-write", ...(o.channelPath ? ["--channel", o.channelPath] : [])],
    ],
  },
  same("grounding"),
  { ...same("scripts-approved"), inputs: (o) => ["short.json", GROUNDED, ...o.segments.map((nn) => `segments/${nn}/script.md`)],
    missing: "your review of short.json and the script — then: chalk pipeline approve <out> --scripts" },
  same("narrate"),
  same("align"),
  same("pipeline-debt"),
  same("frame-spec"),
  same("grounding-frames"),
  same("frames"),
  same("frames-review"),
  same("render"),
  {
    name: "deliver",
    kind: "run",
    inputs: (o) => [...o.segments.flatMap((nn) => [`segments/${nn}/segment.mp4`, `segments/${nn}/segment.vtt`, `segments/${nn}/script.md`]),
      "short.json", "chapter.json", join(SHORT_SKILL, "scripts")],
    outputs: () => ["short.mp4", "captions.srt", "description.txt", "kit.json", "plan.md"],
    cmd: (o) => ["node", chalk, "deliver", ".", "--format", "short", ...(o.channelPath ? ["--channel", o.channelPath] : [])],
  },
  { ...same("eval"), inputs: (o) => ["short.mp4", "short.json", ...o.segments.map((nn) => `segments/${nn}/script.md`), join(REPO, "evals"),
    join(REPO, "formats/short/eval"), ...packDir(o, "short")],
    cmd: (o) => ["node", chalk, "eval", ".", "--format", "short", "--deep", ...(o.channelPath ? ["--channel", o.channelPath] : [])] },
  { ...same("review"), newerThan: ["eval.json", "grounding.md"] },
  { ...same("watched"), inputs: () => ["short.mp4", "review.md"],
    missing: "your watch of short.mp4 on a phone against review.md — then: chalk pipeline approve <out> --watched" },
];

export const FORMATS = { long, lesson, short };
