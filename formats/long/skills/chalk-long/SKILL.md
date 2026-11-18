---
name: chalk-long
description: Turn a checked source (a chapter, notes, your own script) into one chaptered long video, 1080p landscape, with an upload kit — captions, chapter timestamps, description, thumbnail — and, for coding topics, a hands-on Jupyter notebook. Any genre the channel makes: a coding lesson, a focus or motivational essay, a news explainer, a skit. Use when someone says "/chalk-long", "/chalk-youtube", "make a video from this chapter", "turn this script into a video I can upload", or wants a video with a notebook to follow along. Every claim is traceable to the source, and the source is fact-checked.
---

# /chalk-long

`/chalk-long` reads a source, checks it, works out the order its ideas need to go in, and builds **one**
narrated, minimally animated video, 1080p landscape, with the files you need to publish it: captions,
chapter timestamps, a description and a thumbnail. For a coding topic it also writes a Jupyter notebook so
viewers can run what they just watched. `/chalk-youtube` is its old name and still works.

It is the long sibling of `/chalk-short` (one idea, vertical) and `/chalk` (interactive lessons). They share
chalk-core: ingest, the source check, the grounding gate, caption alignment and Manim.

## Shape and pack

This skill owns the **shape**: a hook, chapters, an outro, the upload kit, 16:9. What the parts are and what
each must do is the **genre's**, and lives in a pack under `references/packs/<pack>/`:

| Pack | For |
|---|---|
| `coding-lesson` | a coding tutorial: the problem → think → plan → write → trace arc, code built line by line |
| `essay` | focus, motivational and reflective pieces: one thesis, an opening image, a turn, an ending that echoes |
| `news` | reporting: every fact attributed, sources listed, a dated label |
| `skit` | two or more voices on a stage; the comedy's facts are still facts |

`npx chalk pack <output-dir>` prints the build's pack and its references directory: the manifest's `pack`, else
`channel.json`'s, else `coding-lesson`. Read the pack's `rules.md` before step 2, its `step-2-outline.md` at
step 2 and its `step-3-script.md` at step 3. The eval scores the pack's criteria alongside the shape's and the
shared ones.

## What this skill owns, and what it delegates

This skill owns the **shape of a video people will choose to watch**: a hook, chapters, examples
worth comparing against, an outro, and the upload kit.

chalk-core owns **grounding and the pipeline mechanics** (`npx chalk-core <command>`, with its
reference docs under `references/core/`). [Hyperframes](https://hyperframes.heygen.com) and
its `faceless-explainer` skill own the **video**: animation, exact timing, frames, render. Hand them
a `BRIEF.md`; do not rebuild them.

Read `CLAUDE.md` at the repo root before changing how any of this behaves.

## Parsing the invocation

```
/chalk-long chapter-4.epub
/chalk-long book.pdf --chapter 4 --segments 6 --notebook
/chalk-long stats.md --audience "first-year undergrads"
/chalk-long my-script.md --pack essay
/chalk-long this chapter, but keep it under ten minutes
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
| `--pack` | `coding-lesson`, `essay`, `news`, `skit` | `channel.json`'s `pack`, else `coding-lesson`; written into `video.json` as `pack` |

**`channel.json`** holds what stays the same across a channel's videos: the narration `voice` (a Kokoro
voice or blend), `speed` and `polish`, the `series` (its name and ordered `parts`, each with an `id` and a
viewer-facing `title`), and `banned_terms` the viewer must never hear, and optionally `min_you`: the share of sentences that must talk to the
viewer ("you"), below which a part fails the text gates. Read it before step 2, and say which
voice you are using. With no `channel.json`, audition voices and ask; never fall back silently.

`--draft` output is for checking the storyboard only. Delivery refuses anything that is not
1920x1080, so a draft cannot be uploaded by accident.

Freeform direction overrides the defaults and must be carried into the outline and every `BRIEF.md`.

## Output directory

`long-output/<chapter-slug>/` (an older `youtube-output/` dir keeps working). If it already exists, use `long-output/<chapter-slug>-YYYY-MM-DD-HHmmss/`
and keep that timestamp consistent across every path in the run. Intermediates go in `work/`.

## Running it

```bash
npx chalk pipeline <output-dir> --doc <source> [--notebook]   # runs every stage it can, then stops and says why
npx chalk status <output-dir>                                 # done / stale / waiting, per stage and segment
npx chalk pipeline approve <output-dir> --scripts             # only after the user has reviewed the outline and scripts
npx chalk pipeline <output-dir> --only 03 [--from frames]     # redo one part
```

The runner does the mechanical steps below itself and reruns only what changed: an edited script redoes
that part's voice and everything after it, an edited frame spec only its frames and render, an aligner fix
only alignment. It stops where a person or an agent has to write or approve something: `facts.md` (step 1b, the chalk-factcheck
agent, once per version of the source), `outline.md` (step 2),
the scripts (step 3), `grounding.md` (the chalk-grounding agent, shown with the scripts),
`learner-scripts.md` (the chalk-learner agent in script mode, also shown with the scripts: its "questions the
scripts never answer" go to the author now, not after the render), the user's review, `pipeline-debt` (the
pipeline items earlier builds' resolutions left open: land them in chalk or have the user defer them),
`frames/sNN.py` (step 4, the chalk-frames agent per part), `grounding.md` again over the frame text
(grounding-frames), then after delivery `learner.md` (chalk-learner), `notebook-review.md` (chalk-notebook-reviewer, with `--notebook`),
`review.md` (chalk-reviewer), `resolution.md` (chalk-resolver, which settles where those disagree) and the
user's watch. At each stop, do that step as described below, then run it again.

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

**One idea per part.** A part is one chapter of the video. If a part needs "and", it is two.

**The pack's rules are laws too.** `references/packs/<pack>/rules.md` adds the genre's: for a coding lesson,
never naming the book, the teaching arc and code built line by line; for an essay, quotations attributed and
checked; for news, every fact attributed.

**Readable.** Text the viewer must read holds about 0.3s per word from when it settles.

**The audio is the clock.** Scene timing derives from VO word timings. Regenerating VO is a hard
reset of everything downstream.

**Say what the chapter says**, including its hedges. Flag, never quietly fix.

---

## Step 1: Ingest

**Read:** [references/core/step-1-ingest.md](references/core/step-1-ingest.md)

```bash
npx chalk-core ingest <input> --out <output-dir>/chapter.json [--chapter N|title] [--list] [--kind document|script|research]
```

The source may be a chapter (a document), the user's own script (`--kind script`: its lines become the blocks,
and you rewrite them into the two-layer form at step 3), or a topic with no document (`chalk pipeline <out>
--topic "…"`: the chalk-research agent writes `research.md` with a reference per paragraph, the user approves it,
and it is ingested as `research`). See `references/core/step-1-ingest.md` § Three kinds of source.

Code blocks are kept verbatim with their language. If `chapter.json` has `"has_code": true`, offer
the notebook.

**Gate:** `chapter.json` exists, blocks are in reading order, quality is classified, and you can state
the thesis in one sentence. Anything not `clean`, and every `confidence: "low"` block, gets a human
skim first.

---

## Step 1b: Check the source

Dispatch the **chalk-factcheck** agent on the output dir. It runs `npx chalk-core facts <output-dir> --claims`
for its worklist (every block with a number, a superlative or a quotation) and writes `facts.md`: a verdict
and the evidence per claim. It runs once per version of the source. Show the user every `contradicted` row:
the source is fixed and ingested again, or the user accepts the claim in `facts-accepted.md` (theirs; no
agent writes it). A user's own script is the least certain source and is checked hardest.

**Gate:** `npx chalk-core facts <output-dir>` exits 0.

---

## Step 2: Outline

**Read:** the pack's `references/packs/<pack>/rules.md` and `step-2-outline.md`

Write `<output-dir>/outline.md`: the hook, the ordered parts (each a chapter of the video, one idea), an
**example slot** per part, the outro, one design preset or theme, and the gaps. What the parts are, and the
order they come in, is the pack's.

**Gate:** exactly one hook and one outro; at least three parts; every part has source block ids and an
example (from the source, derived, or a named gap); the pack's outline gate passes; one preset is named.
Catching a missing part here is free; catching it after render costs the render.

---

## Step 3: Script

**Read:** [references/core/step-3-script.md](references/core/step-3-script.md),
[references/core/spoken-style.md](references/core/spoken-style.md),
the pack's `references/packs/<pack>/step-3-script.md`,
[references/core/visual-registry.md](references/core/visual-registry.md) and
[references/core/fidelity.md](references/core/fidelity.md)

Per chapter, write `<output-dir>/segments/NN/script.md` as a two-layer script, with `example:` and
`computed-by:` on every worked-example scene, and the spoken and display layers carrying the **same words**. Write each derived example's script under
`segments/NN/examples/` and **run it**: the numbers on screen come from its output.

```bash
npx chalk-core check-readability <output-dir>/segments/*/script.md --chapter <output-dir>/chapter.json
npx chalk-core check-spoken <output-dir>/segments/*/script.md --banned "chapter,chapters,book,section,the author,<channel banned_terms>" --max-avg 16 [--min-you <channel min_you>]
npx chalk eval <output-dir> --channel <channel.json>     # shape, pack and shared criteria; text criteria run now
```

**Gate:** sources on every line, a visual and tier per scene, every example scene declares its source,
no unknown lexicon terms, readability passes (every code build narrates every line of its block), and
`check-spoken` reports no failure (a sentence too long for one breath, one that reads out a list, a banned
term, an average over the limit; read its warnings too). The pack's groups in the eval pass.

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
npx chalk deliver <output-dir> [--notebook] [--keep-work] [--dry-run]
```

Writes `video.mp4`, `captions.srt`, `chapters.txt`, `description.txt`, `thumbnail.png`, `plan.md` and,
with `--notebook`, `notebook.ipynb`. It refuses, writing nothing, if a script is ungrounded, a segment
is not 1080p, or the chapters would not parse (first at 0:00, at least three, each at least 10 s).

**Gate:** all of the above exist; `plan.md` cites every line; the chapters pass.

---

## Step 6: Evaluate and review

```bash
npx chalk eval <output-dir> --channel <channel.json> [--deep]
```

Writes `eval.md` / `eval.json`: every mechanical criterion of the shape, the pack and what every build shares
(grounding, the source check, ease, voice, render, notebook) with evidence. Then dispatch, in order:

1. **chalk-learner** with the audience: watches only the captions and stills, writes `learner.md`; with a
   notebook, also **chalk-notebook-reviewer**: runs it as the learner would, writes `notebook-review.md`;
2. **chalk-reviewer**: judges what the eval cannot, traces each gap to the file in the chalk repo that let it
   through, writes `review.md`;
3. **chalk-resolver**: reads the eval, `grounding.md`, `learner.md` and `review.md`, settles every place they
   disagree (or the source contradicts itself) by fixed rules, and writes `resolution.md`, one decided list
   with an owner per item.

Tell the user the score and `resolution.md`'s "Do next" list, including what only they can decide.

**Gate:** no eval criterion fails; `review.md` has no high-severity finding, or each one is shown to the
user.

A failure the user has seen and chosen to keep goes in `video.json` as `"accepted": { "T6": "<their reason>" }`,
only on the user's say-so. It still scores nothing, but it no longer fails the run, so the text gates pass and one
part can be rebuilt with `--only NN`. The eval names any accepted criterion that now passes; remove it then.
Then run `chalk eval <out> --pin` once. It records the evidence the waiver covers
(`{ "reason": …, "evidence": [...] }`). A later failure the user never saw, such as a 130.5 s part grown to
140 s, or another part over the limit, fails again rather than passing under the old reason. A waiver with a
reason only still works, but the eval reports it as unpinned.

---

## Skill directory

`<skill-dir>` is the directory containing this `SKILL.md`; Claude Code prints it as "Base directory
for this skill" when the skill loads. Scripts are under `<skill-dir>/scripts/`. Don't guess the path.

Shared steps run as `npx chalk-core <command>`. Its reference docs are read in place through `<skill-dir>/references/core/`,
a symlink to the repo's `core/references/`; edit them there.
