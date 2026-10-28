// stages.mjs — the YouTube build as a list of stages, each with what it reads, what it writes and how
// it runs. The runner (run.mjs) hashes `inputs`, compares them with the last run, and reruns a stage only
// when they changed or its `outputs` are missing.
//
// kind:
//   run      mechanical; the runner runs `cmd` itself
//   author   written by you or an agent (outline, scripts, frame specs, review); the runner says what is
//            missing and stops
//   approve  a human stop; `chalk pipeline approve <out> --<name>` records what was approved
//
// `per: "segment"` stages run once per segments/NN; their paths take the segment id as `nn`.

import { join } from "node:path";

export const REPO = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
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
const NARRATE_CODE = [core("narrate.mjs"), core("kokoro_narrate.py"), frames("seg.mjs")];
const ALIGN_CODE = [core("build-tokens.mjs"), core("align-captions.mjs"), core("apply-display.mjs")];
const FRAME_CODE = [frames("framelib.py"), frames("gen.py"), frames("build.sh"), core("fix-index.mjs")];

export const youtube = [
  {
    name: "ingest",
    kind: "run",
    inputs: (o) => (o.doc ? [o.doc, core("ingest.mjs")] : []),
    outputs: () => ["chapter.json"],
    cmd: (o) => (o.doc ? ["node", chalk, "ingest", o.doc, "--out", "chapter.json"] : null),
    missing: "chapter.json — pass --doc <source> once so the runner can ingest it",
  },
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
      ["node", coreBin, "check-spoken", ...o.segments.map((nn) => `segments/${nn}/script.md`), "--banned",
        ["chapter", "chapters", "book", "section", "the author", ...(o.channel?.banned_terms ?? [])].join(","), "--max-avg", "16",
        ...(o.channel?.min_you != null ? ["--min-you", String(o.channel.min_you)] : [])],
      ["node", chalk, "eval", ".", "--format", "youtube", "--text", "--no-write", ...(o.channelPath ? ["--channel", o.channelPath] : [])],
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
    name: "scripts-approved",
    kind: "approve",
    inputs: (o) => ["outline.md", "grounding.md", ...o.segments.map((nn) => `segments/${nn}/script.md`)],
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
    name: "frame-spec",
    kind: "author",
    per: "segment",
    inputs: () => [],
    outputs: (o, nn) => [`frames/s${nn}.py`],
    missing: "frames/sNN.py — one per segment (the chalk-frames agent writes them, in parallel)",
  },
  {
    name: "frames",
    kind: "run",
    per: "segment",
    inputs: (o, nn) => [`frames/s${nn}.py`, `segments/${nn}/video/audio_meta.json`, "chapter.json", `segments/${nn}/examples`, ...FRAME_CODE],
    outputs: (o, nn) => [`segments/${nn}/video/index.html`],
    cmd: (o, nn) => ["bash", frames("build.sh"), nn, "frames"],
  },
  {
    name: "render",
    kind: "run",
    per: "segment",
    jobs: true,
    inputs: (o, nn) => [`segments/${nn}/video/index.html`, `segments/${nn}/video/compositions`, `segments/${nn}/video/caption_groups.json`],
    outputs: (o, nn) => [`segments/${nn}/segment.mp4`, `segments/${nn}/segment.vtt`],
    cmd: (o, nn) => ["bash", frames("build.sh"), nn, "render"],
  },
  {
    name: "deliver",
    kind: "run",
    inputs: (o) => [...o.segments.flatMap((nn) => [`segments/${nn}/segment.mp4`, `segments/${nn}/segment.vtt`, `segments/${nn}/script.md`]),
      "video.json", "chapter.json", join(REPO, "formats/youtube/skills/chalk-youtube/scripts")],
    outputs: (o) => ["video.mp4", "captions.srt", "chapters.txt", "description.txt", "plan.md", ...(o.notebook ? ["notebook.ipynb"] : [])],
    cmd: (o) => ["node", chalk, "deliver", ".", "--format", "youtube", "--keep-work", ...(o.notebook ? ["--notebook"] : [])],
  },
  {
    name: "eval",
    kind: "run",
    inputs: (o) => ["video.mp4", "captions.srt", "video.json", ...o.segments.map((nn) => `segments/${nn}/script.md`), join(REPO, "evals"),
      join(REPO, "formats/youtube/eval")],
    outputs: () => ["eval.json", "eval.md"],
    cmd: (o) => ["node", chalk, "eval", ".", "--format", "youtube", "--deep", ...(o.channelPath ? ["--channel", o.channelPath] : [])],
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
    name: "review",
    kind: "author",
    inputs: () => ["eval.json"],
    outputs: () => ["review.md"],
    newerThan: ["eval.json", "learner.md", "grounding.md"],
    missing: "dispatch the chalk-reviewer agent on the output dir (it writes review.md)",
  },
  {
    name: "resolve",
    kind: "author",
    inputs: () => [],
    outputs: () => ["resolution.md"],
    newerThan: ["eval.json", "grounding.md", "learner.md", "review.md"],
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
const same = (name) => youtube.find((s) => s.name === name);
const LESSON_SKILL = join(REPO, "formats/lesson/skills/chalk");
export const lesson = [
  same("ingest"),
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
  { ...same("scripts-approved"), inputs: (o) => ["syllabus.md", "lesson.json", "grounding.md", ...o.segments.map((nn) => `segments/${nn}/script.md`)],
    missing: "your review of the syllabus, the checkpoints and every script — then: chalk pipeline approve <out> --scripts" },
  same("narrate"),
  same("align"),
  same("frame-spec"),
  same("frames"),
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
    join(REPO, "evals"), join(REPO, "formats/lesson/eval")],
    cmd: (o) => ["node", chalk, "eval", ".", "--format", "lesson", "--deep", ...(o.channelPath ? ["--channel", o.channelPath] : [])] },
  { ...same("learner"), newerThan: ["lesson.mp4", "lesson.html"] },
  same("review"),
  same("resolve"),
  { ...same("watched"), inputs: () => ["lesson.mp4", "lesson.html", "resolution.md"],
    missing: "your run through lesson.html against resolution.md — then: chalk pipeline approve <out> --watched" },
];

export const FORMATS = { youtube, lesson };
