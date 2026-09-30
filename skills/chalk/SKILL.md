---
name: chalk
description: Turn a book or a chapter into short, minimal, animated lessons — an MP4 per segment plus an interactive lesson page with checkpoints. Use when someone says "/chalk", "make lessons from this chapter", "turn this book into videos", "explain this chapter", or hands over an EPUB, PDF or chapter of text to learn from. Every claim is traceable to the source text.
---

# /chalk

Chalk it up. You read it — now make it teachable.

`/chalk` reads a chapter, works out the order its ideas actually need to be taught in, and builds a
short lesson series: a narrated, minimally animated MP4 per segment, plus an interactive page that
plays them in order and stops at a checkpoint between each.

## What this skill owns, and what it delegates

chalk owns **pedagogy**: what to teach, in what order, grounded in which paragraphs, shown with
which visual.

[Hyperframes](https://hyperframes.heygen.com) and its `faceless-explainer` skill own the **video**:
animation mechanics, exact timing, frame construction, render. Do not rebuild that — hand it a
`BRIEF.md` and let it work.

Read `CLAUDE.md` at the repo root before changing how any of this behaves.

## Parsing the invocation

```
/chalk chapter-4.epub
/chalk book.pdf --chapter 4 --segments 5
/chalk stats.pdf --math on --audience "first-year undergrads"
/chalk this chapter, but assume they've never seen calculus
```

| Option | Values | Default |
|---|---|---|
| `--chapter` | number or title | inferred; ask if a whole book has no clear split |
| `--segments` | 3–6 | inferred from length |
| `--format` | `landscape`, `vertical`, `square` | `landscape` |
| `--audience` | freeform | inferred from the text's own level |
| `--math` | `auto`, `on`, `off` | `auto` |
| `--draft` | flag — render at 720p | full resolution |

Freeform direction ("assume no calculus", "keep it under five minutes", "focus on the second half")
overrides the defaults and must be carried into the syllabus and every `BRIEF.md`.

## Output directory

`chalk-output/<chapter-slug>/`. If it already exists, use
`chalk-output/<chapter-slug>-YYYY-MM-DD-HHmmss/` and keep that timestamp consistent across every
path in the run. Intermediates go in a `work/` subfolder.

## Skill directory

`<skill-dir>` is the directory containing this `SKILL.md`. Claude Code prints it as "Base directory
for this skill" when the skill loads. Assets are under `<skill-dir>/assets/`, scripts under
`<skill-dir>/scripts/`. Don't guess the path — a plugin install, a `~/.claude/skills/` copy and this
repo all put it somewhere different.

---

## Teaching laws

These hold regardless of subject, tone or format.

**Grounded.** Every narration line and every piece of on-screen text traces to block ids in
`chapter.json`. No invented numbers, dates, examples or entities. Never render an equation the
extractor could not read cleanly.

**One idea per segment.** If a segment needs "and", it is two segments.

**Prerequisite order, not page order.** A chapter's prose order is often not its teaching order.

**Show the mechanism.** A diagram that moves the way the idea moves beats a bullet list of the same
words. Never bullet-list the prose — that is the failure this tool exists to prevent.

**Readable.** Any line the learner must read holds about 0.3s per word, counted from when the whole
line is settled. Pace comes from motion and cuts, never from pulling text away early.

**The audio is the clock.** Scene timing derives from VO word timings. Regenerating VO is a hard
reset of everything downstream.

**Earn the maths.** Tier 2 (Manim) is for equations that must visibly *become* other equations, and
for geometric construction, limits and fields. Everything else is Tier 1.

**Say what the chapter says.** Represent it faithfully, including its hedges. Flag anything it
asserts without explaining, anything outdated, and anything ambiguous — do not quietly fix it.

---

## Step 1: Ingest

**Read:** [references/step-1-ingest.md](references/step-1-ingest.md)

Normalize the input into `chapter.json` — paragraph-addressed blocks with stable ids. Those ids are
the grounding currency for everything that follows.

```bash
node <skill-dir>/scripts/ingest.mjs <input> --out <output-dir>/chapter.json
```

**Gate:** `chapter.json` exists, blocks are in reading order, extraction quality is classified
(`clean` / `needs-review` / `ocr`), and you can state the chapter's thesis in one sentence.

---

## Step 2: Syllabus

**Read:** [references/step-2-syllabus.md](references/step-2-syllabus.md) and
[references/pedagogy.md](references/pedagogy.md)

Write `<output-dir>/syllabus.md`: the concept inventory, the prerequisite ordering, the segment
split, one learning objective and one checkpoint per segment, and the design preset for the series.

**Gate:** every segment has an objective, source block ids and a checkpoint; durations sum to the
target; every concept traces to at least one block id; exactly one design preset is named.

---

## Step 3: Script

**Read:** [references/step-3-script.md](references/step-3-script.md),
[references/visual-registry.md](references/visual-registry.md) and
[references/fidelity.md](references/fidelity.md)

Per segment, write `<output-dir>/segments/NN/script.md` as a two-layer script — `spoken` for TTS,
`display` for captions and on-screen text — with `source:` ids on every line and a registry visual
plus tier on every scene.

```bash
node <skill-dir>/scripts/check-readability.mjs <output-dir>/segments/*/script.md
```

**Gate:** every line carries source ids; every scene names a visual and a tier; the pronunciation
lexicon has no unknown terms; `check-readability.mjs` passes.

**Then stop and show the user the syllabus and the scripts.** This is the only cheap place to fix
the teaching. Everything after this costs tens of minutes of frame capture.

---

## Step 4: Build the segments

**Read:** [references/step-4-segments.md](references/step-4-segments.md) and, for any Tier 2 scene,
[references/manim.md](references/manim.md)

Render Tier 2 clips first, then hand each segment to `faceless-explainer` via a `BRIEF.md`. Load the
Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`,
`hyperframes-keyframes`, `hyperframes-cli`. Do not enter the `hyperframes` intent interview; a
`BRIEF.md` on disk is what tells `faceless-explainer` to run without asking.

**Gate:** every segment has an MP4 and a VTT; `npx hyperframes check` returns zero errors for each;
sampled stills show no overflow, collision or low contrast.

---

## Step 5: Interactive lesson page

**Read:** [references/step-5-player.md](references/step-5-player.md)

Write `lesson.json`, then build the player around it.

```bash
node <skill-dir>/scripts/build-lesson-page.mjs <output-dir>/lesson.json
```

**Gate:** `lesson.html` opens from `file://`, plays every segment in order, each checkpoint gates
advancement and cites a source, and it works at phone width and by keyboard.

---

## Step 6: Deliver

**Read:** [references/step-6-deliver.md](references/step-6-deliver.md)

Concatenate `lesson.mp4`, bake a settled-frame poster as frame 0 of each segment, and write
`lesson-plan.md` with a source-citation table.

**Gate:** `lesson.html`, `lesson.mp4` and `lesson-plan.md` exist; every poster is a settled frame,
not a mid-transition one.

---

## Edge cases

[references/edge-cases.md](references/edge-cases.md) covers scanned and multi-column PDFs, equations
that don't extract, DRM'd EPUBs, whole books, non-English text, narrative rather than expository
chapters, cross-chapter references, mispronounced jargon, partial render failures and player
fallbacks. Consult it when the input is not a clean English expository chapter — which is most of
the time.
