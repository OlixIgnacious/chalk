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
| `--segments` | any number | inferred from the material; no cap |
| `--audience` | freeform | inferred from the text's own level |
| `--math` | `auto`, `on`, `off` | `auto` |
| `--notebook` | flag — write a Python notebook | **offered** when ingest finds code, otherwise off |
| `--draft` | flag — render at 720p to check the storyboard | full 1080p |
| `--channel` | path to `channel.json` | `./channel.json` in the workspace, if present |

**`channel.json`** holds what stays the same across a channel's videos: the narration `voice` (a Kokoro
voice or blend), `speed` and `polish`, the `series` (its name and ordered `parts`, each with an `id` and a
viewer-facing `title`), and `banned_terms` the viewer must never hear. Read it before step 2, and say which
voice you are using. With no `channel.json`, audition voices and ask; never fall back silently.

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
example is the chapter's own, or a derived one whose numbers come from running code and is recorded in
the log as not from the chapter, or an honest gap. Never one made up from memory. See
[references/core/fidelity.md](references/core/fidelity.md) § Examples.

**Sounds like a person.** The narration is a teacher talking to one viewer, not the chapter read aloud: short
sentences mixed with full explanatory ones, "you", questions, a signpost whenever the topic changes, a beat of silence before an answer, the screen carrying the list while the
voice carries the reason. A faithful summary spoken in one even voice passes every grounding gate and still
sounds like a robot. See [references/core/spoken-style.md](references/core/spoken-style.md); `check-spoken`
measures it.

**Open on the viewer's problem, not a logo.** The hook is the first thing a viewer judges; it opens on a
question or situation they recognise, and leads to the one the chapter answers.

**One idea per part.** A part is one YouTube chapter of the video. If a part needs "and", it is two.

**One problem per video, every step with its reason.** Depth, not coverage: about one new idea per 30–45s,
and each claim carries its *because*. A video that states ten topics' facts in ten minutes feels rushed and
teaches none of them. Related problems become their own videos. See step-2-outline.md § Scope.

**Orient the viewer, never the book.** The viewer never saw the source. Nothing they see or hear names a
book, chapter, section, author or file — not the narration, the frames, the captions, the title or the
description. Orient them by topic instead: the series and part number, a roadmap of this video's stages in
the hook, a stage card as each part after the hook opens, a progress strip throughout, and what comes next at the end.
Citations live in `plan.md`, which is the private audit trail.

**Teach the code, don't just show it.** For a coding topic every main problem walks the arc in
[references/step-2-outline.md](references/step-2-outline.md): spot the pattern, the problem, think it
through from brute force to the insight, a plan in plain words, the code built line by line, a trace on
the same example, why it is fast, the bug to avoid, other ways, the interview answer. A bonus problem walks
the same arc with real solution code from the source, or it is cut and named as a gap — never a vague
explanation. No quizzes or exercise segments: engagement comes from the explanation itself.

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

Write `<output-dir>/outline.md`: the hook (with its roadmap), the ordered parts (each a YouTube chapter,
one idea, one `stage`), an **example slot** per part, the outro (naming the next part of the series), one
design preset, and the gaps — including every topic cut for having no solution code.

**Gate:** exactly one hook and one outro; at least three parts; every part has source block ids, a stage
and an example (chapter, derived, or a named gap); for a coding topic every main problem walks the arc in
order and every bonus part has a source code block (else it is cut and listed); no title or planned line
names the source; the title follows `channel.json`'s series; one preset is named. Catching a missing
stage here is free; catching it after render costs the render.

---

## Step 3: Script

**Read:** [references/core/step-3-script.md](references/core/step-3-script.md),
[references/core/spoken-style.md](references/core/spoken-style.md),
[references/step-3-examples.md](references/step-3-examples.md),
[references/core/visual-registry.md](references/core/visual-registry.md) and
[references/core/fidelity.md](references/core/fidelity.md)

Per chapter, write `<output-dir>/segments/NN/script.md` as a two-layer script, with `example:` and
`computed-by:` on every worked-example scene, and the spoken and display layers carrying the **same words**. Write each derived example's script under
`segments/NN/examples/` and **run it**: the numbers on screen come from its output.

```bash
npx chalk-core check-readability <output-dir>/segments/*/script.md --chapter <output-dir>/chapter.json
npx chalk-core check-spoken <output-dir>/segments/*/script.md --banned "chapter,chapters,book,section,the author,<channel banned_terms>" --max-avg 16
node <skill-dir>/../../evals/run.mjs <output-dir> --channel <channel.json>     # the tutorial eval; text criteria run now
```

**Gate:** sources on every line, a visual and tier per scene, every example scene declares its source,
no unknown lexicon terms, readability passes (every code build narrates every line of its block), and
`check-spoken` reports no failure (a sentence too long for one breath, one that reads out a list, a banned
term, an average over the limit; read its warnings too). The eval's orientation, teaching and bonus groups
pass.

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

## Step 6: Evaluate and review

```bash
node <skill-dir>/../../evals/run.mjs <output-dir> --channel <channel.json> [--deep]
```

Writes `eval.md` / `eval.json`: every mechanical criterion of a good tutorial (orientation, teaching arc,
bonus, grounding, ease, voice, render, notebook) with evidence. Then dispatch the **chalk-reviewer** agent
on the output dir: it judges what the eval cannot, traces each gap to the file in chalk, chalk-core or
chalk-youtube that let it through, and writes `review.md`. Tell the user the score and the top findings.

**Gate:** no eval criterion fails; `review.md` has no high-severity finding, or each one is shown to the
user.

---

## Skill directory

`<skill-dir>` is the directory containing this `SKILL.md`; Claude Code prints it as "Base directory
for this skill" when the skill loads. Scripts are under `<skill-dir>/scripts/`. Don't guess the path.

Shared steps run as `npx chalk-core <command>`. Its reference docs live in `<skill-dir>/references/core/`
(`npx chalk-core sync <skill-dir>` refreshes them). Never edit those files here; change chalk-core.
