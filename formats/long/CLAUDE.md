# chalk-long — working rules

`/chalk-long` (alias `/chalk-youtube`, its old name) turns a checked source into **one** chaptered long
video, 1080p landscape, plus the upload kit (captions, chapter timestamps, description, thumbnail) and, for
coding topics, a Jupyter notebook. It is the long **shape**: the genre's rules (what the parts are, what the
eval's orientation and teaching groups check) are the pack's, under `packs/` at the repo root. Its siblings are
`/chalk-short` and `/chalk` (interactive lessons).

Read this before changing anything in `skills/chalk-long/`.

## What this repo is

**Markdown and reference data, plus three small scripts.** The pipeline's shared half — ingest, the
grounding gate, caption alignment, Manim, and the references that explain them — is
[chalk-core](../chalk-core). The video engine is [Hyperframes](https://github.com/heygen-com/hyperframes)
and its `faceless-explainer` skill. What is left, and lives here, is what is specific to a video people
choose to watch: the outline (hook, chapters, outro), worked examples, the upload kit and the notebook.

The scripts in `skills/chalk-long/scripts/`:

- `kit.mjs` — pure: chapters, merged captions, description. No disk, no ffmpeg.
- `deliver.mjs` — the CLI: gates, thumbnail, stitch, writes the kit.
- `build-notebook.mjs` — pure builder plus a CLI; emits nbformat 4.5 JSON, no dependency.

That list should grow slowly and reluctantly. If a change would help chalk too, it belongs in chalk-core.

## Invariants

Grounding, the audio-as-clock rule, tier routing and "gates are not advisory" are owned by
[chalk-core's CLAUDE.md](../chalk-core/CLAUDE.md) and apply here unchanged. They are not restated, so
they cannot drift. What is specific to this skill:

### An example is never an invented fact

Every segment has an example, because a video with none is dry. But "add an example" must not become a
way around grounding. An example is the chapter's own, or **derived** — every number computed by a
script named in `computed-by:`, illustrating only a claim the chapter makes — or a **gap**, shown to the user. Never a number typed
from memory. `chalk-core check-readability` enforces the declaration. **The video carries no label.** That the
case is derived lives in the logs (`plan.md`), never in the narration, captions, on-screen text, the
description or the notebook. Do not add it back.

### The narration is for the ear

Grounding is necessary and not sufficient: a faithful summary read in one even voice sounds like a robot.
The spoken layer follows chalk-core's `references/spoken-style.md` (short sentences, "you", questions,
the screen carrying the list while the voice carries the reason, pauses made with `{beat}` / `{pause}` /
`{think}`), measured by `chalk-core check-spoken`, and is voiced by `chalk-core narrate`, not `audio.mjs`, whose
offline voice cannot be tuned. Pauses live inside each take, so a frame's duration still equals its narration.
Choose the voice by ear from an audition, never by default.

### Delivery refuses, and refuses before it writes

`deliver.mjs` runs the grounding gate first, then the size and chapter gates, and only then touches the
disk. A failure writes nothing. Stitching video only to refuse it afterwards wastes the slow part, and a
kit written over an ungrounded script defeats the gate. Keep that order.

### The chapters are the players' rules, not ours

First at 0:00, at least three, each at least ten seconds. These are errors, not warnings: a description
that does not parse as chapters fails silently on YouTube (the strictest player) and nobody notices until
after upload. R2, in this shape's `eval/criteria.mjs`, checks them; so does G6, the thesis citing its blocks.

### The description cannot add a claim

It is built from `video.json` and the chapters only. If it needs a fact, the fact belongs in the
script, where it has a source.

### The notebook runs nothing it has not been shown

Python only. A block in another language, or with no language tag, is listed, not turned into a cell.
No outputs are stored, so no number can drift from the code. Every code cell is parsed before the file
is written. A derived example whose script is missing stops delivery.

## Conventions

- Output goes to `long-output/<chapter-slug>/`, timestamped if it already exists.
- `SKILL.md` stays thin. Detail belongs in `references/`, loaded per step.
- `BRIEF.md` is the contract boundary with `faceless-explainer`: this skill owns the outline, script,
  source material and tier routing; the engine owns animation, timing and render.

## Depending on chalk-core

- Scripts run as `npx chalk-core <command>`. `package.json` declares `"chalk-core": "file:../chalk-core"`
  for development; point it at a published version or git URL for release.
- `skills/chalk-long/references/core/` is vendored by `npx chalk-core sync skills/chalk-long`.
  `npm test` fails if it drifts. **Never edit it here** — change chalk-core and sync.
- A change to shared behaviour arrives as a chalk-core version bump. Sync, run `npm test`, and read the
  diff before accepting it.

## Local setup

`npx hyperframes doctor` gates the environment; see chalk-core's CLAUDE.md for Kokoro, `whisper-cpp` and
the Python venv (`HYPERFRAMES_PYTHON`). Tests also use `.venv/bin/python` to parse and run notebook
cells; a symlink to another checkout's venv works.

## Evals and review

`npm test` is whether the scripts work; `evals/` is whether the **video teaches**. `node evals/run.mjs
<output-dir> --channel <channel.json>` scores an output dir against `evals/criteria.mjs` — orientation (the
source is never named, series, roadmap, stage cards, next part), the teaching arc, bonus parts with real
solutions, grounding (code on screen verbatim, example numbers from output), ease, voice, render and
notebook — and writes `eval.md`. `test/evals.mjs` pins it with two original fixtures (`good/`, `bad/`).
**When a video shows a new kind of failure, add a criterion and a `bad/` case before fixing the pipeline.**

`agents/chalk-reviewer.md` (linked into a workspace's `.claude/agents/`) runs the evals and the repos'
tests, judges what the evals cannot, traces each gap to the file in chalk that
let it through, and writes `review.md`. It edits nothing else.

## Testing

`test/smoke.mjs` is the regression gate, one dependency-free file, run with `npm test`. It covers chapter
offsets and YouTube's rules, the merged captions, the description, the size gate, the thumbnail and the
stitch (on real 1080p clips from ffmpeg), the notebook, and the core boundary. **Add a case there before
fixing anything in `scripts/`.** The ingest, grounding and Manim tests live in chalk-core.

Fixtures are original text (`fixtures/own-code-chapter.md`). **Never test against a copyrighted book.**

```bash
npm test                  # the regression gate
npx chalk-core sync skills/chalk-long --check
npx hyperframes check <project>
```
