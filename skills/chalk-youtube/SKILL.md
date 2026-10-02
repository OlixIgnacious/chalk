---
name: chalk-youtube
description: Turn a book or a chapter into one chaptered YouTube video with an upload kit — captions, chapter timestamps, description, thumbnail — plus worked examples to compare against and a hands-on Jupyter notebook for coding topics. Use when someone says "/chalk-youtube", "make a YouTube video from this chapter", "turn this chapter into a video I can upload", or wants a video with a notebook to follow along. Every claim is traceable to the source text.
---

# /chalk-youtube

`/chalk-youtube` reads a chapter, works out the order its ideas need to be taught in, and builds
**one** narrated, minimally animated video, 1080p landscape, with the files you need to upload it:
captions, chapter timestamps, a description and a thumbnail. For a coding chapter it also writes a
Jupyter notebook so viewers can run what they just watched.

It is the YouTube sibling of chalk, which makes interactive lessons. They share chalk-core: ingest,
the grounding gate, caption alignment and Manim.

## What this skill owns, and what it delegates

This skill owns the **shape of a video people will choose to watch**: a hook, chapters, examples
worth comparing against, an outro, and the upload kit.

chalk-core owns **grounding and the pipeline mechanics** (`npx chalk-core <command>`, with its
reference docs vendored under `references/core/`). [Hyperframes](https://hyperframes.heygen.com) and
its `faceless-explainer` skill own the **video**: animation, exact timing, frames, render. Hand them
a `BRIEF.md`; do not rebuild them.

Read `CLAUDE.md` at the repo root before changing how any of this behaves.

## Parsing the invocation

```
/chalk-youtube chapter-4.epub
/chalk-youtube book.pdf --chapter 4 --segments 6 --notebook
/chalk-youtube stats.md --audience "first-year undergrads"
/chalk-youtube this chapter, but keep it under ten minutes
```

| Option | Values | Default |
|---|---|---|
| `--chapter` | number or title | inferred; ask if a whole book has no clear split |
| `--segments` | 4–8 | inferred from length |
| `--audience` | freeform | inferred from the text's own level |
| `--math` | `auto`, `on`, `off` | `auto` |
| `--notebook` | flag — write a Python notebook | **offered** when ingest finds code, otherwise off |
| `--draft` | flag — render at 720p to check the storyboard | full 1080p |

`--draft` output is for checking the storyboard only. Delivery refuses anything that is not
1920x1080, so a draft cannot be uploaded by accident.

Freeform direction overrides the defaults and must be carried into the outline and every `BRIEF.md`.

## Output directory

`youtube-output/<chapter-slug>/`. If it already exists, use `youtube-output/<chapter-slug>-YYYY-MM-DD-HHmmss/`
and keep that timestamp consistent across every path in the run. Intermediates go in `work/`.

## Laws

**Grounded.** Every narration line and every piece of on-screen text traces to block ids in
`chapter.json`. No invented numbers, dates or entities. Never render an equation the extractor could
not read cleanly.

**Every idea gets an example.** A video with none is dry and gives the viewer nothing to compare. An
example is the chapter's own, or a derived one whose numbers come from running code and is labelled
"Example, not from the chapter", or an honest gap. Never one made up from memory. See
[references/core/fidelity.md](references/core/fidelity.md) § Examples.

**Open on the point, not a logo.** The hook is the first thing a viewer judges; it states the
question the chapter answers, in the chapter's own terms.

**One idea per chapter.** If a chapter needs "and", it is two.

**Readable.** Text the viewer must read holds about 0.3s per word from when it settles.

**The audio is the clock.** Scene timing derives from VO word timings. Regenerating VO is a hard
reset of everything downstream.

**Say what the chapter says**, including its hedges. Flag, never quietly fix.

---

## Step 1: Ingest

**Read:** [references/core/step-1-ingest.md](references/core/step-1-ingest.md)

```bash
npx chalk-core ingest <input> --out <output-dir>/chapter.json [--chapter N|title] [--list]
```

Code blocks are kept verbatim with their language. If `chapter.json` has `"has_code": true`, offer
the notebook.

**Gate:** `chapter.json` exists, blocks are in reading order, quality is classified, and you can state
the thesis in one sentence. Anything not `clean`, and every `confidence: "low"` block, gets a human
skim first.

---

## Step 2: Outline

**Read:** [references/step-2-outline.md](references/step-2-outline.md)

Write `<output-dir>/outline.md`: the hook, the ordered chapters (one idea each), an **example slot**
per chapter, the outro, and one design preset for the whole video.

**Gate:** exactly one hook and one outro; 4–8 chapters; every chapter has source block ids and an
example (chapter, derived, or a named gap); durations sum to the target; one preset is named.

---

## Step 3: Script

**Read:** [references/core/step-3-script.md](references/core/step-3-script.md),
[references/step-3-examples.md](references/step-3-examples.md),
[references/core/visual-registry.md](references/core/visual-registry.md) and
[references/core/fidelity.md](references/core/fidelity.md)

Per chapter, write `<output-dir>/segments/NN/script.md` as a two-layer script, with `example:` and
`computed-by:` on every worked-example scene. Write each derived example's script under
`segments/NN/examples/` and **run it**: the numbers on screen come from its output.

```bash
npx chalk-core check-readability <output-dir>/segments/*/script.md
```

**Gate:** sources on every line, a visual and tier per scene, every example scene declares its source,
no unknown lexicon terms, readability passes.

**Then stop and show the user the outline and every script** — including each derived example and
each gap. Rendering before the teaching has been reviewed is the expensive mistake.

---

## Step 4: Segments

**Read:** [references/step-4-segments.md](references/step-4-segments.md),
[references/core/captions-and-engine.md](references/core/captions-and-engine.md) and, for any Tier 2
scene, [references/core/manim.md](references/core/manim.md)

One Hyperframes project per segment, handed to `faceless-explainer` through a `BRIEF.md` that pins
**1920x1080 at 30fps**. Load the Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`,
`hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli`. A `BRIEF.md` on disk is what makes
`faceless-explainer` run without its interview.

**Gate:** every segment has an MP4 and a VTT; `npx hyperframes check` returns zero errors; sampled
stills are clean; no composition reaches the network; every frame's duration equals its narration
except the last in the segment.

---

## Step 5: Deliver

**Read:** [references/step-5-deliver.md](references/step-5-deliver.md)

```bash
node <skill-dir>/scripts/deliver.mjs <output-dir> [--notebook] [--keep-work] [--dry-run]
```

Writes `video.mp4`, `captions.srt`, `chapters.txt`, `description.txt`, `thumbnail.png`, `plan.md` and,
with `--notebook`, `notebook.ipynb`. It refuses, writing nothing, if a script is ungrounded, a segment
is not 1080p, or the chapters would not show on YouTube.

**Gate:** all of the above exist; `plan.md` cites every line; chapters pass YouTube's rules.

---

## Skill directory

`<skill-dir>` is the directory containing this `SKILL.md`; Claude Code prints it as "Base directory
for this skill" when the skill loads. Scripts are under `<skill-dir>/scripts/`. Don't guess the path.

Shared steps run as `npx chalk-core <command>`. Its reference docs live in `<skill-dir>/references/core/`
(`npx chalk-core sync <skill-dir>` refreshes them). Never edit those files here; change chalk-core.
