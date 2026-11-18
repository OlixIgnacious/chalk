# Plan: long and short form, published anywhere

Status: carried out 2026-11-17/18 as release 0.9.0 (see `CHANGELOG.md`). Companion to the README and the
per-directory `CLAUDE.md` files.

## Where it stands

| Item | State |
|---|---|
| S1 source check | landed; run by hand on a sample source, not yet by the agent on a real build |
| S2 script sources | landed: `--kind script`, `[ref: …]` on blocks, references in `plan.md` and the description |
| S3 research sources | landed: chalk-research (`network: true`), research and research-approved stages, UI topic start; the agent has not run yet |
| S4 quotation rule | landed in the script reference, the frames agent and G8 |
| C2 rename | landed; old builds resume under `long`, `/chalk-youtube` is an alias |
| C3 shape × pack | landed: coding-lesson, essay, news, skit, with fixtures that pass and fail across genres |
| A1 frames reviewer | landed; stills tested on a real Short; the agent has not run yet |
| A2 R6 | landed; finds real flashes on a real Short |
| A3, A4 | landed |
| A5 loudness, V4 | landed; a real Short measures −14.2 LUFS |
| B1 kit | landed; 17 of 17 current descriptions byte-identical |
| B2–B4 contract, kit folder, P criteria | landed |
| B5 safe box, S7 | landed, numbers from HyperFrames' safe areas, not this page's guesses |
| B6 API destinations | LinkedIn, Instagram, Facebook, TikTok, X written and checked offline; **not run against the live APIs** (no accounts) |
| C1 theme folders | landed: 22 themes with posters, reveal styles, finishes, fields, contrast checks |
| C1a catalogue | 17 new themes landed; **spreadsheet, transit, sketchnote, pictogram, comic, silhouette not built** (each needs framelib components); dimension lines, ornate intertitles, an iris wipe, corner brackets, a brush face and sprites are later components too |
| D1 recut, D2 shorts plan | landed; a real part recut passes every text gate at 100% with no new narration; frames and render of a recut not yet done |
| Music clock (open question 7) | not built: focus videos still mix music in the focus-music project |
| Square (1:1) | not planned (decision 5) |

Decisions taken where this page left them open, as its recommendations said: packs `coding-lesson`, `essay`, `news`,
`skit`, and the music step stays in focus-music (0c); platforms in the order YouTube, Instagram, LinkedIn, then
TikTok, X and Facebook (1); no accounts assumed, so the kit folder is the path wherever an API is not set up (2);
Instagram and Facebook take a host command the person names (3); the names `long`, `/chalk-long`, `long-output/`
(4); no square (5).

## The goal

chalk makes a video of any kind and any shape, for any channel, and publishes it anywhere: YouTube, Instagram
Reels, TikTok, LinkedIn, X, Facebook, or a folder the user posts from by hand. What does not change is the
reason chalk exists: **everything it says is grounded in a cited source, and the source itself has been
checked.** It began as certification prep from textbook chapters, and "chapter" is still the word the code
uses, but a chapter is one case of a source. The channels it serves today are already different in kind:
coding lessons, focus and motivational pieces, tech-news Shorts, comedy skits. Nothing in this plan assumes one
of them.

The pipeline stays what it is: grounded, computed, audio as the clock, reviewed before rendered, gated.

## What is tangled today

Three ideas share the word "youtube":

| Idea | Where it lives now | What it should be |
|---|---|---|
| The **shape** of a video (16:9 chaptered, 9:16 one idea) | `formats/youtube`, `formats/short` | `formats/long`, `formats/short` |
| The **genre's rules** (the teaching arc, code built line by line, one running example, never name the book, no quizzes) | `formats/youtube/eval/criteria.mjs` and the `/chalk-youtube` skill steps, described as "YouTube's rules" | a **pack**: the genre's criteria and skill steps, chosen by the channel, independent of the shape |
| The **destination** (title, description, chapters, tags, upload) | `publish/youtube.mjs`, and `deliver.mjs` writing a YouTube-shaped `description.txt` | a destination layer: one neutral kit, shaped per platform |

The second row is the one that decides whether "any channel" is true. Today's long-form pack is a
**coding-lesson** pack in code, not in parameters: T1 requires the arc `problem → think → plan → write →
trace`, T2 fails any video with no `code build` scene ([criteria.mjs:176](../formats/youtube/eval/criteria.mjs#L176)),
E2 wants one running example made of numbers. A focus or motivational video fails all of them by design, and
the gates are the product. So the model becomes **shape × pack**: the shape (`long`, `short`, `lesson`) owns
stages, deliver and orientation; the pack (`coding-lesson`, `essay`, `news`, `skit`) owns the criteria and the
skill's outline and script steps; `channel.json` or the manifest names the pack; `evals/run.mjs` loads it. See
C3.

Untangling these is most of the work. Nothing in ingest, grounding, voice, align, frames or render cares where
the file goes or which genre it is.

## Ideas adopted

Ideas, with the phase that carries each:

- A hook is checked for what it says, not only when it starts; captions have per-platform rules (hashtag caps,
  dead links, the 125 visible characters). → B4, B5
- A style is a folder with a grammar (essence and what it is not, colour meaning, type and reading time, motion,
  camera grammar, native moves, pitfalls), kept outside the library when it is the user's own. → C1
- Every on-screen text is checked after render for reading time, not only in the script. → A2
- A reviewer that renders stills at entry, settled and end of hold for every beat and reports a concrete fix per
  finding. → A1
- Finish landscape, then re-cut keeping every beat. → D1
- A component index with "use for / avoid for" that the agent must read before picking. → A3
- A kept record of on-screen defects with symptom, evidence and fix. → A4

## The source, and checking it

This is the part that needs the most thought, so it is written as a design with open questions, not as
finished items.

### Two different checks

chalk has one check today and needs two:

| | Grounding (exists) | Fact-checking (new) |
|---|---|---|
| Question | Does every line trace to a block of the source? | Is the source right? |
| Kind | mechanical, deterministic, every run | judgement with evidence, once per version of the source |
| Done by | `check-readability`, the grounding agent, G1–G5 | a `chalk-factcheck` agent, a `source-check` stage |
| Output | `grounding.md` | `facts.md` |
| Fails on | an unsourced line, a number not computed | a claim the evidence contradicts |

Grounding guarantees chalk never adds anything the source did not say. It says nothing about whether the
source is true. A textbook is usually right; a user's own script, a news summary, a motivational piece
quoting someone, or a page fetched from the web is not guaranteed to be. The fact-checker is the second
guarantee, and it does not need to run every time. **"Once per version of the source" means once per hash of
the blocks' text, not once per mtime of `chapter.json`**: an author stage goes stale by mtime
([run.mjs:181-185](../pipeline/run.mjs#L181)) and ingest rewrites `chapter.json` whenever its own code changes
([stages.mjs:68](../pipeline/stages.mjs#L68)), which would re-run a web fact-check of an unchanged text. So
`facts.md` records the hash of the blocks it checked, and the stage's `gate` compares that hash. The waivers
pin to the same hash, so one mechanism serves both.

**What this does and does not guarantee.** The fact-check covers *checkable* claims: numbers, dates, names,
attributed quotations, superlatives, causal statements. A script source with none of those in a wrong
argument passes grounding (trivially) and the fact-check (nothing to check). What stands between a weak
script and a render is then the learner and the reviewer, and the scripts gate where the user reads them. That
is the honest statement; the gates catch what can be checked, the review catches the rest.

### Three kinds of source

Everything downstream of ingest sees `chapter.json`: numbered blocks. Today a block is `{id, kind, text}` plus
`lang`, `page`, `latex`, `confidence` ([core/scripts/ingest.mjs:76-85](../core/scripts/ingest.mjs#L76)) and
provenance is **one top-level `source`** for the whole document ([ingest.mjs:609](../core/scripts/ingest.mjs#L609)).
The script and research kinds need a **block-level `ref`** (`{url, title, retrieved, quote}`), which is an
ingest schema change with fixtures, not only an agent; without it a URL inside the prose is groundable text
that can reach the screen. What produces the blocks can vary:

| Kind | Given | Ingest does | Provenance per block |
|---|---|---|---|
| **document** (today) | a chapter: md, txt, epub, pdf | splits into blocks | the document and its position |
| **script** | the user's own narration, with or without citations | splits it into blocks; each block is its own source | the script; plus any reference the user attached to a line |
| **research** | a topic, optionally a set of URLs or files | a `chalk-research` agent writes a research brief: short paragraphs, each attributed to one fetched page with the URL, the retrieval date and the quoted sentence it rests on; the brief is ingested like a document | the URL and the quote |

The news Short does a weaker form of the third by hand: facts attributed in prose and a `sources` list in
`short.json`, with no per-block URL. This generalises and tightens it: a research brief is a source document
that chalk wrote, with a `ref` per block, and it goes through the same fact-check as one the user supplied, and
the user approves it at a gate before the outline is written.

**Pipeline shape.** `ingest` is a `run` stage keyed on `--doc` and reads only md, txt, epub and pdf
([pipeline/stages.mjs:66-70](../pipeline/stages.mjs#L66), [ingest.mjs:596](../core/scripts/ingest.mjs#L596)).
A research source adds two stages **before** ingest in all three format lists (lesson and short reuse
`same("ingest")`): `research` (author: the `chalk-research` agent writes `research.md`) and `research-approved`
(approve). `ingest` runs only when `o.doc` is set ([stages.mjs:68-70](../pipeline/stages.mjs#L68)), and for a
research source there is no doc when the run starts, so `context()` defaults `doc` to `research.md` once
`research-approved` is done. A script source is ingested first, so its lines get block ids, and then rewritten into the two-layer
form citing those ids: grounding is trivial (the script is the source) and all the weight moves onto the
fact-check, which is right: that is where the bugs are.

### The fact-checker

- `agents/chalk-factcheck.md`: reads `chapter.json` and nothing downstream. Lists every **checkable claim**:
  a number, a date, a name, a quotation attributed to someone, a cause-and-effect statement, a definition, a
  "the fastest / the first / the only". For each, finds evidence: the source's own other blocks (consistency),
  a computed example when the claim is computable (already how numbers are checked), an attached reference, or
  the web (WebSearch and WebFetch, with the URL and quoted sentence recorded). Writes `facts.md`: one row per
  claim with the block id, the verdict (**supported**, **contradicted**, **unverifiable**, **computed**),
  the evidence and its date.
- `pipeline/stages.mjs`: stage `source-check`, kind author, after ingest, `newerThan: ["chapter.json"]`, so it
  reruns only when the source changes. **An author stage's check only tests that its report exists and is
  newer than what it read; it never reads the report** ([pipeline/run.mjs:177-186](../pipeline/run.mjs#L177)),
  so "a contradicted claim stops the run" needs the stage's own `gate(o)` function, the pattern
  `learner-scripts` uses ([pipeline/stages.mjs:118-124](../pipeline/stages.mjs#L118)): it does the mtime
  comparison itself, parses `facts.md`, and returns `waiting` with the contradicted rows while any is
  unaccepted. The same mechanism serves the frames reviewer (A1).
- **Waivers cannot live in `video.json`**: at source-check time no manifest exists yet (`video.json` arrives
  with the outline, `short.json` with the script). Accepted facts go in `facts-accepted.md` beside `facts.md`
  (claim id, reason, date), with the same pin-or-stale rule the eval's `accepted` has: a waiver names the
  block's text hash and lapses when the block changes. **Unverifiable** is reported, not fatal, and the reviewer
  sees it.
- **Existing builds**: inserting a stage makes every build in flight wait on it ([pipeline/run.mjs:205-241](../pipeline/run.mjs#L205)).
  `.chalk/pipeline.json` has no creation stamp, only a per-stage `at` ([run.mjs:305, 348](../pipeline/run.mjs#L305)),
  so the rule is: `source-check` and `frames-review` report `done` when the build's `ingest` stage `at` is older
  than the date the stage landed (a constant in `stages.mjs`), or the `watched` gate is approved; a
  writing a `facts.md` opts an old build in (one that exists is always checked).
- Attributed quotations get a rule of their own, because misattributed quotes are the commonest fabrication in
  motivational content: a quotation reaches the screen only with its attribution, and only when `facts.md`
  marks it supported. **What counts as support for a quotation**: the primary text (the book, speech transcript,
  interview or paper, with its location), or two independent secondary sources that agree on the words and
  the attribution. One quote-collection page is not support. Without that, the quotation stays off screen or
  loses its attribution ("as the saying goes"), which is a change the user makes at the scripts gate.
- **The web, and agents.** Every agent today runs with `WebFetch`, `WebSearch`, `curl` and `wget` disallowed
  ([ui/launchers.py:164](../ui/launchers.py#L164)) and the README promises "no network fetches". The fact-checker
  and the research agent need the web; the grounding, learner, reviewer and frames agents must not have it.
  Decision 0b below: a per-agent `network: true` in the agent's frontmatter that `launchers.py` honours only for
  those two, the README sentence changed to say so, and an `--offline` run that marks web-dependent claims
  `unverifiable`. The alternative is no web at all and a user-supplied evidence pack per build; it is honest but
  makes research sources impossible.
- `evals/shared.mjs`: **G7** and **G8** (youtube's pack already has a G6, the thesis), kept mechanical, since the eval never re-runs a judgement
  ([evals/shared.mjs:6-7](../evals/shared.mjs#L6)). G7: `facts.md` exists and names this version of the source (the hash of the blocks' text);
  every block that matches a **threshold regex class** (a digit, a four-digit year, a quotation in quote marks,
  "first / only / fastest / most / never") has at least one row citing it; no row is `contradicted` without a
  live waiver. G8: every quoted span in a `display` line or on a frame has a row whose verdict is `supported`.
  The threshold list is the criterion's definition and is written down there; what the agent *decided* about
  each claim is its job, not the eval's. G8's "quoted span" means four or more words, or any span followed by
  an attribution (a dash or "said" and a capitalised name), so string literals in code (`"rat"`, `"car"`) and
  scare quotes do not count. Shared criteria, because they hold for every format.
- The eval and the reviewer keep their jobs: the eval checks that the fact-check was done and is consistent;
  the fact-checker is the one that judges.

### Open questions

1. **How deep.** Every claim, or claims above a threshold (numbers, dates, names, quotes, superlatives, causal
   statements) with the rest left to grounding? Start with the threshold list; "every sentence" is unbounded.
2. **Offline.** A fact-check that needs the web cannot run on a machine without it. Proposal: without network
   the stage marks web-dependent claims unverifiable and the run continues; the reviewer flags them.
3. **Who approves a research brief.** A gate before the outline (like the scripts gate), since a wrong brief
   makes everything after it wrong and cheap to fix at that point.
4. **Evidence quality.** A web page is not a source of truth either. Record the evidence, show it to the user,
   prefer primary sources (the paper, the documentation, the transcript) over summaries; never settle a claim
   on one secondary page.
5. **Scripts without citations.** Accept them, ground them to themselves, fact-check them hard, and say in
   `plan.md` that the source was the user's script. Or require citations per line. Accepting is the
   recommendation: the fact-checker is what makes that safe.
6. **What a focus or motivational video is grounded in.** Its claims are few, but its quotations, names and
   dates are exactly the risk; its source can be a short script with references. The rule stays: nothing on
   screen or in the narration that is not in the source, and the source has been checked.
7. **What a focus video's clock is.** "Audio is the clock" means the voice-over's word timings. A focus piece
   has sparse narration and long music, and the long deliver has no music mix at all (only the Short's has one,
   [short deliver.mjs:161-167](../formats/short/skills/chalk-short/scripts/deliver.mjs#L161)). The `essay` pack
   (C3) therefore needs a **music clock**: a beat grid and section marks in `audio_meta.json` from the track,
   which frames may cue on where there is no word, and a music mix in the long deliver. Until that lands, a
   focus video runs through chalk with its narration as the clock and its music added in the focus-music
   project's own step, which is how it is done today. The goal paragraph does not promise more than that yet.

### Items

- **S1. `facts.md` and the `source-check` stage** — **landed 2026-11-17**: `core/scripts/facts.mjs` (`chalk-core facts`),
  the stage with its gate and the grandfather rule in all three formats, `agents/chalk-factcheck.md`
  (`network: true`, honoured by `ui/launchers.py`), G7 and G8, tests in core smoke, `test/pipeline.mjs`,
  `test/evals.mjs` and `ui/test_ui.py`. Not yet run on a real build. Originally: with the fact-check agent, the gate behaviour, G7 and G8,
  fixtures (a source with a wrong date fails; an accepted one passes with the reason shown). 2 sessions.
- **S2. Script sources**: the block-level `ref` in ingest (schema, fixtures, `load.mjs`), a narration script
  as input with per-line references in a light syntax (`[ref: url or title]`), the ingest-then-rewrite step in
  the skills. 1½ sessions.
- **S3. Research sources**: the `chalk-research` agent, the brief format with a `ref` per paragraph, the two
  pre-ingest stages in every format list, URL provenance carried through to `plan.md` and the description (the
  news Short's "Sources are in the description" becomes general). 2–3 sessions.
- **S4. Attributed-quote rule** in the frames and script references and the G8 criterion. Half a session.

S1 comes before anything in the phases below: it is the one that changes what chalk promises.

## Phases

Each item names the files it touches, how it is tested, and when it is done. The order table at the end gives
the dependencies; items inside a phase are ordered.

### Phase A: every build better now

No platform work. Each item is small, fixture-tested, and lands once in `core/` or `frames/` for every format.

#### A1. Frames reviewer: an agent that looks at the frames before the render

Today the learner sees a still every 4 s and judges teaching; nobody checks clipping, overflow, contrast, empty
frames or a jump between cues, and nobody does it before the expensive render. framelib's table-overflow
`ValueError` is the mechanical half of this; the rest needs eyes.

- `bin/chalk.mjs`: `chalk stills NN --at-cues`. `write()` adds a `cues.json` beside `index.html` listing each
  substantive reveal's start **and duration**, both parsed from the tween strings after the stage-card clamp
  (tweens are strings, [framelib.py:985-990](../frames/framelib.py#L985); the `duration:` is in each). The
  command renders three stills per reveal from the frames build, not the mp4, with
  `npx hyperframes snapshot <project> --at …` ([formats/lesson/CLAUDE.md](../formats/lesson/CLAUDE.md), Testing),
  so it runs before render: **entry** (t + 0.1 s), **settled** (t + duration), **end of hold** (next reveal
  − 0.1 s), tiled into `work/stills/NN-cues.png` with the cue text under each tile.
- `agents/chalk-frames-reviewer.md`: model sonnet; tools Read, Bash, Write; sees one segment's stills, its
  script's `display` layer and `frames/THEME.md` (C1; until then, the theme's docstring). Writes
  `frames-review.md`, one block per finding, worst first: `[segment, cue, still] what is wrong, as seen` and
  `fix: frames/sNN.py line, the concrete change`. Ends `PASS` or `FIXES: n`. Never taste; every finding points at
  a still. One agent per segment, in parallel, like chalk-frames.
- `pipeline/stages.mjs`: stage `frames-review`, kind author, per segment, after `frames`, `newerThan` the
  segment's `index.html`, with its own `gate(o, nn)` that parses the verdict and returns `waiting` while it
  says `FIXES` (adding the report to `render`'s inputs would only change a hash; nothing would refuse). The
  fix loop is: the user or the frames agent edits `sNN.py`, frames rebuild, the review is older than
  `index.html` and reruns. `cues.json` is computed in `write()` **after** the stage-card clamp rewrites tween
  times ([frames/framelib.py:978-990](../frames/framelib.py#L978)), not from `cue()`, which returns a number and
  records nothing.
- Tests: `test/pipeline.mjs` fixture with a `FIXES: 1` review blocks render and a `PASS` lets it through;
  `test/frames.mjs` checks `cues.json` is written and `--at-cues` tiles the right count.
- Done when: a build with a deliberately overflowing label stops before render with the still and the line to fix.

#### A2. Reading-time check after render

`check-readability` checks the script's reading rate; R5 checks font size. A reveal cued late in a take can still
be on screen for too short a time. framelib knows every text's content, box, reveal time and (when `set` hides
it) its end.

- `frames/framelib.py`: `write()` emits `texts.json`: `[{id, text, from, to, pass}]` per frame. `text()` knows
  x, y and sometimes w but never a height ([frames/framelib.py:233-245](../frames/framelib.py#L233)), so R6
  checks **time, not geometry**: "fully in frame" stays with the frames reviewer's stills. `to` is the frame's
  end or the first `set(..., opacity: 0)` on that id. `pass: true` is the **default** for code lines, labels,
  chrome and anything under 4 characters; prose, headings and results are timed. A code panel built line by line
  would otherwise fail every build.
- `evals/shared.mjs`: criterion **R6** "every timed on-screen text is up for its reading time": at least
  `characters ÷ 15 + 1.5 s`, never under 1.5 s; a text that is a caption of a spoken line never under the line's
  speech + 0.6 s. Weight 2. Uses `texts.json`; skips when it is absent (older builds).
- `evals/lib/load.mjs`: loads `texts.json` per segment.
- Tests: a fixture segment whose last reveal lands 0.8 s before the take ends fails R6; the existing fixtures pass.
- Done when: `npm test` runs the fixture and `chalk eval` on a real build reports R6 with the offending text.

#### A3. Component index the frames agent reads

The chalk-frames agent reads `framelib.py` source to pick components. An index with "use for / avoid for" is
cheaper to read and makes the avoid notes enforceable.

- `frames/index.mjs` (or a Python script beside `gen.py`): generates `frames/COMPONENTS.md` from framelib
  docstrings, which gain a short tagged tail: `Use for:`, `Avoid for:`, `Length:` (the reveal's natural
  duration), `Themes:` (when a component suits only some). One row per public `Frame` method and layout helper.
- `agents/chalk-frames.md`: read `COMPONENTS.md` first; never use a component without reading its row; when an
  "avoid for" matches the scene, take the replacement it names.
- `test/frames.mjs`: every public method has a row; the file is up to date with the source (the test regenerates
  and diffs).
- Done when: the index is generated in `npm test` and the agent prompt points at it.

#### A4. A record of on-screen defects

- `frames/LESSONS.md`: one entry per defect class seen in a real build: symptom, how it showed in a still, the
  cause in framelib or the spec, the fix, a counterexample where the same look is right. **No agent writes it**:
  each agent writes one report and nothing else ([agents/chalk-reviewer.md](../agents/chalk-reviewer.md)). The
  frames reviewer's finding becomes a `## Pipeline` item in `resolution.md`: **the resolver writes it**, since
  only the resolver writes that file, reading `frames-review.md` alongside the other reports; [pipeline/debt.mjs](../pipeline/debt.mjs)
  then holds the *next* build's frames until it is landed or deferred with a reason, which is the right place
  for it. The person lands it in `LESSONS.md` with the commit. The frames agent reads it after `COMPONENTS.md`.
- Done when: the first three entries exist (the table overflow, the stage-card timing, the portrait result
  placement) and both agents reference the file.

#### A5. Loudness for the long form

`formats/short/.../deliver.mjs` masters to −14 LUFS, −1 dBTP with a single-pass `loudnorm`
([deliver.mjs:169](../formats/short/skills/chalk-short/scripts/deliver.mjs#L169)). The long-form and the lesson
delivers only concatenate with `-c copy` ([youtube deliver.mjs:250-252](../formats/youtube/skills/chalk-youtube/scripts/deliver.mjs#L250),
[lesson deliver.mjs:286-291](../formats/lesson/skills/chalk/scripts/deliver.mjs#L286)), and narration is
normalised per take at −18 ([narrate.mjs:276](../core/scripts/narrate.mjs#L276)), so a long video plays quieter
than its Shorts and than the platform target.

- One `loudnorm` helper in `core/scripts/` (two-pass: measure, then apply) used by all three delivers; the
  Short moves to it too. The uniform concat path becomes `-c:v copy -c:a aac`; the "unchanged, skip" byte
  comparison ([deliver.mjs:254](../formats/youtube/skills/chalk-youtube/scripts/deliver.mjs#L254)) is replaced
  by an input hash, since an encode is not byte-stable.
- `evals/shared.mjs`: criterion **V4** "the delivered file plays at −14 LUFS ± 1, true peak ≤ −1 dBTP",
  measured with `ffmpeg -af ebur128`. `load.mjs` must load `lesson.mp4` as `files.video`
  ([evals/lib/load.mjs:182](../evals/lib/load.mjs#L182)) or V4 silently skips lessons, which would make it a
  format criterion in disguise.
- Done when: a delivered long video, lesson and Short measure the same within 1 LU.

### Phase B: publish anywhere

#### B1. One neutral kit from deliver

- Both delivers write `kit.json` (the YouTube `description.txt` keeps being written, but from the kit): title,
  thesis, summary paragraphs, hashtags, links (`full_video`, `notebook`, `sources`), chapters `[{at, title}]`,
  **series** (the "Part N of M, next:" lines, [kit.mjs:124-125](../formats/youtube/skills/chalk-youtube/scripts/kit.mjs#L124)),
  **music_credit** ([short deliver.mjs:112-118](../formats/short/skills/chalk-short/scripts/deliver.mjs#L112)),
  duration, width, height, the file paths (`video.mp4` or `short.mp4`, `captions.srt`, `thumbnail.png`), and
  `shape: "long" | "short"`. `kit.mjs`'s `buildDescription`, `buildChapters`, `notebookLinks` become kit fields.
- `kit.json` is added to both deliver stages' `outputs` ([stages.mjs:214, 360](../pipeline/stages.mjs#L214)) or
  the runner never notices it missing.
- Schema in `publish/kit.schema.json`; `test/publish.mjs` validates both delivers' output.
- Done when: `description.txt` is byte-identical before and after (the YouTube shaping reproduces it).

#### B2. The destination contract

- `publish/lib/destination.mjs`: every platform exports `shape(kit, channel, overrides) → {title, text, tags,
  cover, captions, file, warnings[]}` (pure), `plan(out, argv)` (what would be sent; today's `--dry-run`), and
  `publish(out, argv)`. `publish/youtube.mjs` is refactored onto it with no behaviour change.
- `published.json` becomes `{ youtube: {id, steps…}, instagram: {…} }`; the "uploads once" rule is per platform.
  The old shape (`record.videoId`, [publish/youtube.mjs:260-262](../publish/youtube.mjs#L260)) is read as the
  `youtube` entry.
- `channel.json` today is `youtube: {playlist, shorts_playlist, tags, category, language}`
  ([youtube.mjs:66-101](../publish/youtube.mjs#L66)). `destinations.youtube` keeps every one of those keys, and
  the old top-level `youtube` block goes on being read, with a one-line notice, for as long as anyone has one.
- `chalk publish <out> --to youtube,instagram` or `video.json` / `short.json` `publish.to`. Default: the
  destinations `channel.json` lists for that shape.
- `channel.json`:

  ```jsonc
  "destinations": {
    "youtube":   { "playlist": "DSA Patterns", "tags": ["…"], "category": 27 },
    "instagram": { "hashtags": ["#leetcode", "#python"], "link": "bio" },
    "tiktok":    { "privacy": "SELF_ONLY" },
    "linkedin":  { "author": "urn:li:person:…" },
    "kit":       { "platforms": ["instagram", "tiktok", "x"] }
  }
  ```

  `video.json` / `short.json`: `"publish": { "to": [...], "at": "…", "overrides": { "instagram": { "title": "…" } } }`.
- Done when: the existing publish tests pass unchanged through the new contract, plus a test that a second
  platform's entry does not skip the first.

#### B3. The kit destination (manual posting)

The honest default: three of the APIs below need app review, a business account or a paid tier. A folder per
platform with the right text makes "publish anywhere" true by hand on day one.

- `publish/kit.mjs`: writes `publish/<platform>/` under the output dir: a link or copy of the file, the cover,
  `caption.txt` from that platform's `shape()`, and `NOTES.md` listing what to set in the platform's UI (audience
  flags, schedule, playlist) and the warnings `shape()` returned.
- Done when: `chalk publish <out> --to kit` produces a folder per platform the channel lists with the right
  file, cover and caption; B4 then adds the criteria that judge the captions.

#### B4. Platform shaping and the P criteria

- `publish/platforms.json`: the limits table, one entry per platform: `title_max`, `text_max`, `hashtag_max`,
  `links_clickable`, `duration_max_s` (long / short), `aspect` allowed, `cover` (size, bytes), `captions`
  (`srt` | `burned`), `visible_chars` (the feed's cut, 125 on Instagram), `first_comment` for links. Each entry
  carries a `checked` date, because these numbers move (Instagram's hashtag cap moved to 5 in December 2025).
- `shape()` per platform uses it: Instagram leads with the thesis inside the visible window, moves the link to
  "link in bio" or the first comment, drops `#Shorts`, caps tags; LinkedIn keeps links; X trims to its limit;
  TikTok burns captions.
- **A destination pack, not shared criteria.** Platform rules live in `publish/` by this plan's own invariant,
  a shared criterion must hold for every format and the lesson has no destination, and the eval stage hashes
  only `evals/` and the format pack ([stages.mjs:220-221](../pipeline/stages.mjs#L220)). So `publish/eval.mjs`
  carries group **platform**, run by `chalk publish <out> --plan` (and by `chalk eval` when a manifest names
  `publish.to`), over `shape()`'s output per destination: **P1** duration within the platform's cap for that
  shape (the Short deliver's own `LIMIT`, [deliver.mjs:20](../formats/short/skills/chalk-short/scripts/deliver.mjs#L20),
  **stays**: it is the shape's cap and it refuses before anything is written, which is the deliver rule; P1 is
  the per-platform cap on top);
  **P2** title and text within limits; **P3** hashtags within the cap and none generic (`#viral`, `#fyp`…);
  **P4** no URL where links are dead; **P5** cover within size limits; **P6** the first visible characters carry
  the thesis, not a greeting or a hashtag. Same `{pass, fail, skip}` shape as every other criterion so
  `eval.md` can include it.
- Fixtures: one failing caption per criterion.
- Done when: a Short with four hashtags including `#Shorts` and a URL passes for YouTube and gets an Instagram
  caption that also passes.

#### B5. One Short that fits every platform's screen, and a hook check

- The safe box becomes the intersection of the platforms' overlays, and its numbers live in **one JSON that
  both framelib.py and the Short criteria read** (`SAFE_BOTTOM` is already duplicated,
  [criteria.mjs:8](../formats/short/eval/criteria.mjs#L8)). Starting values, to be measured against the current
  build rather than taken from this page: content x 150–850, y 320–1320 (SKILL.md's current top, [SKILL.md:74](../formats/short/skills/chalk-short/SKILL.md#L74); the series chrome sits at y 230/282,
  [framelib.py:273-275](../frames/framelib.py#L273), and S4 needs the CHROME exclusion S3 already has,
  [criteria.mjs:10](../formats/short/eval/criteria.mjs#L10)); captions as they are today, at 1350 with a 200 px
  stage and 48–62 px type ([build.sh:66-67](../frames/build.sh#L66)), which is two lines, not the 90 px this plan
  first wrote. SKILL.md's 150–930 column narrows to 850 on the right.
- `formats/short/eval/criteria.mjs`: **S4** checks the top and the right margin as well as the bottom; **S7**
  "the first line is a hook", only its deterministic parts: at most 12 words, the first sentence ends by 3 s
  (word timings from `audioMeta`, as S3 does), no weak opener ("so", "today", "in this video", "have you ever",
  "this is"), no greeting or preamble. "A concrete marker" and "a value from the example" are judgement and go
  to the reviewer's checklist, not the eval. Pass or fail with the line quoted; no score.
- `formats/short/skills/chalk-short/SKILL.md`: the safe box as numbers; the hook rules.
- Fixtures: a Short drawn at x=900 fails S4; "Today I want to show you…" fails S7.

#### B6. API destinations

Each behind a prerequisite the user has to have. Build in this order; stop where the accounts stop.

| Platform | Prerequisite | Notes |
|---|---|---|
| LinkedIn | a developer app with `w_member_social` | direct file upload; long and short; SRT supported. The easy one. |
| Instagram / Facebook Reels | a Professional account linked to a Meta app | the API pulls the mp4 from a **public URL**: `channel.json` `destinations.instagram.host` names a command that uploads a file and prints its URL (the user's own: rclone, s3, a web server). No host, no publish; the kit folder instead. Captions burned in (already). |
| TikTok | a developer app; unaudited apps post `SELF_ONLY` | direct upload; burned captions. |
| X | paid API tier | chunked media upload; 2:20 unless Premium; text 280. |

Each: `publish/<platform>.mjs` on the contract, `plan` tested offline against recorded request shapes (as
`test/publish.mjs` does for YouTube), and one `published.json` entry.

### Phase C: formats as shapes, themes as grammars

#### C1. Theme folders

Today a theme is a colour dict in `framelib.py` and a captions CSS. A theme becomes a folder:

```
frames/themes/<name>/
  theme.json      palette (the slots framelib uses), display face, gradient, mark fill, caption file
  THEME.md        essence and what it is not · colour meaning · type and sizes · motion rules ·
                  camera grammar (move → expresses → serves) · native moves · pitfalls
  captions.css
  poster.png      one rendered frame, so the gallery and the agent see it
```

- `set_theme()` reads `theme.json`; the five existing themes move over with the dicts unchanged.
- **Which theme a build uses is the channel's choice, not the repo's.** `video.json` / `short.json` /
  `lesson.json` `theme` wins; otherwise `channel.json` `theme`; otherwise `broadside`, which stays the fallback
  only because something has to be. No theme is promoted to "the house look" in code or docs.
- User themes: `~/.config/chalk/themes/<name>/`, same shape, listed first by `chalk themes`, named in
  `channel.json` `theme`, never touched by a repo update. A "make a theme" step in the chalk UI later; for now a
  copy of a repo theme and an edit.

##### C1a. The theme catalogue

framelib renders HTML/SVG with GSAP, so a theme is palette, type, captions, reveal motion and a few drawing
rules, not a renderer. The style galleries reviewed were triaged against that and
against the kinds of video chalk makes (lessons, focus and motivational pieces, news, skits): about half need a
paint engine, an image generator, real footage or instrument data, and are out for now. True 3D scenes are
possible later as a background layer, since HyperFrames can host three.js behind framelib's components, but
each is a project of its own. What is left splits into two things framelib can carry:

- a **theme**: palette, faces, captions, how things arrive (fade, draw-on, typed, beam), a few drawing rules;
- a **finish**: a post layer over the stage that any theme can wear: grain, scanlines, halftone, paper, a
  misregistered second colour, a vignette. One CSS/SVG filter layer, set in `theme.json` as `finish` or per
  video as `video.json` `finish`.

Every look below is chalk's own: no text or engine from another project. The user or the channel picks;
nothing is promoted to a house look.

**Reveal mechanisms to add to framelib** (each unlocks several themes):

| Mechanism | What it does | Unlocks |
|---|---|---|
| **draw-on** | lines, arrows and shapes appear along their path (SVG `stroke-dashoffset`); text under a left-to-right mask at hand speed; a one-pass wipe leaving a faint haze | chalkboard, marker, sketchnote, blueprint, one-line, mechanism |
| **typed** | text arrives glyph by glyph with a block cursor (the code build already does lines) | crt, hud, ticker |
| **beam** | a curve traces itself with a glow and a fading trail (a blurred copy behind) | oscilloscope, hud |
| **step / snap** | reveals on twos, hard cuts, no easing | pixel, flash |
| **field** | a seeded canvas layer behind the components: particles, flow lines, drifting light; deterministic (seeded, a function of *t*) so any frame renders alone | firefly, flow, dusk, neon |

**Themes**. Grouped by the kind of video each serves best, since no channel is the main one; the cost is after
the mechanism exists. Which a build uses is the channel's or the video's choice.

*For explaining: lessons, how-tos, walkthroughs*

| Theme | Look | Needs | Cost |
|---|---|---|---|
| `chalkboard` | deep slate green with fine grain; chalk white for structure, one accent chalk for what the lesson tracks, a pale chalk for another voice; an OFL hand face; dust at a stroke's end; nothing fades in, things are written or wiped. The skit stage already lives here and shares it | draw-on | 1–2 sessions incl. the mechanism |
| `crt` | phosphor green or amber on near-black, scanlines and a slow flicker, a mono face, bloom on the brightest glyphs; no second colour | typed; scanline finish | ½ session |
| `blueprint` | white and pale cyan line work on blueprint blue, a faint grid, dimension lines with arrowheads and small-caps labels, hatching for a filled region; line-drawn variants of the array, pointer, tree and trace-table components | draw-on; a dimension-line helper | ½ session |
| `marker` | marker on white paper: black for structure, two marker colours with fixed meanings, a chisel-tip face, boxes and arrows drawn by hand, a paper finish. `sketch` is the version without colour; both stay | draw-on | ½ session |
| `sketchnote` | one page of lecture notes filling up: headings in a brush face, small icons, containers, connectors, a highlighter marker; the running example as a sticky note | draw-on; a highlight stroke; a small icon set | 1 session |
| `oscilloscope` | a dark grid, one beam colour, curves that trace themselves, readouts in a mono face; for math chapters and anything plotted | beam | 1 session incl. the mechanism |
| `spreadsheet` | the trace table as the whole screen: a grid of cells with the cursor moving, cells filling, a formula bar reading out the step, a column highlighted; the strongest look for traces and for "why fast" | a cell cursor and fill animation | ½ session |
| `transit` | the graph as a transit map: thick coloured lines, round stations, interchange rings, a legend; for graph, tree and linked-list chapters | draw-on; a map component for nodes and edges | 1 session |
| `swiss` | a strict grid, one signal colour, type leading, every move on a beat; `broadside` and `yellow` are near it, this is the cleaner version | none | ½ session |
| `pictogram` | flat pictograms, one weight, people and objects as signs; for a problem statement or a process | an icon set (OFL) | ½ session |
| `bauhaus` | primary colours and simple shapes standing for the parts of an idea, moving on a grid; for principles and mechanisms | none | ½ session |

*For focus, motivational and ambient pieces*

| Theme | Look | Needs | Cost |
|---|---|---|---|
| `dusk` | a warm room at dusk: soft gradient light through a window, slow drift, one line of type at a time with long holds, the music carrying the time | field (drifting light); a slow-hold caption style | ½ session |
| `poster` | flat silkscreen colours, a grain finish, big type with generous air, one line per screen; for quotations and manifestos | grain finish | ½ session |
| `ink` | ink on paper: strokes with a soft bleed (SVG displacement and blur on the draw-on), a lot of empty space, a seal-red accent | draw-on; a bleed filter; paper finish | 1 session |
| `firefly` | points of light gathering into a word or a shape and dispersing again, on near-black | field | 1 session |
| `flow` | a living background of flow-field lines, slow, one colour, type set over it | field | ½ session after `firefly` |
| `neon` | neon-tube type and lines with a glow and a faint hum of flicker, on a dark wall; for an energetic opener | draw-on (the tube lights along its path); flicker finish | ½ session |
| `silhouette` | flat silhouettes against a graded sky, scenes changing on the beat; for montage-shaped pieces | an OFL silhouette set; beat-cued cuts (the audio clock already carries beats) | 1 session |

*For news*

| Theme | Look | Needs | Cost |
|---|---|---|---|
| `ticker` | an LED ticker and a terminal-style status bar as the chrome, beside `midnight` | typed | ¼ session |
| `hud` | a readout: thin cyan lines, corner brackets, numbers counting up, a scan line | typed; beam | ½ session |

*For skits and stories*

| Theme | Look | Needs | Cost |
|---|---|---|---|
| `comic` | panels with gutters, speech balloons, a halftone finish, an action word | panel layout; balloon component | 1 session |
| `silent` | black-and-white, intertitle cards in an ornate frame for the spoken line, a flicker finish, iris transitions | iris wipe; flicker finish | ½ session |
| `pixel` | 16-bit palette, `image-rendering: pixelated`, a bitmap face, reveals on twos; the cast as sprites later | step; a bitmap face | ½ session for the look, more for sprites |

Already covered: `apple` (dark keynote), `midnight` (news), `broadside`, `yellow`, `sketch` (whiteboard).

**Finishes** (one CSS/SVG layer each, a quarter session together): `grain`, `scanlines`, `halftone`,
`paper`, `riso` (two inks, slightly misregistered, a touch of noise), `dither` (1-bit), `vignette`, `flicker`.
A finish never changes the layout, so every eval that reads geometry still holds; R5 and R6 read the text
before the finish is applied.

**Honest accounting.** Several rows above are not themes by this plan's own definition: `blueprint`, `transit`,
`spreadsheet`, `comic` and `sketchnote` each need new **components** (line-drawn array, pointer and tree
variants; a map; a cell cursor; balloons; icons), and those are framelib work costed separately from the look.
Two rows lean on something that does not exist: frames never see music, which is mixed after render and only in
the Short deliver ([short deliver.mjs:161-167](../formats/short/skills/chalk-short/scripts/deliver.mjs#L161)),
so `silhouette`'s beat cuts and `dusk`'s "music carrying the time" wait for a beat grid in `audio_meta.json`
(a later item). Every new face is a `build.sh` asset entry, a `FONTS` entry and a `doctor` check
([build.sh:21-25](../frames/build.sh#L21), [framelib.py:72-75](../frames/framelib.py#L72)); `pixel`'s
`image-rendering: pixelated` does nothing to text, so it needs a bitmap face. Finishes that animate (flicker,
moving grain) must be on the GSAP timeline or seeded by *t*, never a CSS animation, which runs on the wall
clock and breaks deterministic frames. `draw()` and the clip-path hand wipe already exist
([framelib.py:212](../frames/framelib.py#L212)), so draw-on is an extension, not a new mechanism. Halftone,
dither and riso cut contrast that nothing measures: a **contrast check** (text against what is behind it,
from a still) ships before those finishes do.

Each theme ships with `theme.json`, `THEME.md` (the sections above), `captions.css`, a poster rendered from
one real fixture segment, and rows in `COMPONENTS.md` for any component that does not suit it. The frames
reviewer (A1) reads the pitfalls section.

**Order**: the mechanisms first, each with the theme that proves it: draw-on with `chalkboard`, field with
`dusk`, typed with `crt`. After that, themes land as a channel asks for them; each group above has a cheap
first pick (`poster`, `blueprint`, `ticker`, `silent`). The finishes land with their first theme (`grain` with
`chalkboard`, `scanlines` with `crt`, `paper` with `marker` or `ink`). A theme is not added to the catalogue
until a real segment renders in it and the frames reviewer passes it.
- The frames agent reads `THEME.md`; the frames reviewer (A1) checks stills against its pitfalls; the reviewer
  cites it.
- Tests: every theme folder has the four files; `theme.json` has every slot; `set_theme` on each theme renders a
  fixture frame.

#### C2. The rename

- `formats/youtube` → `formats/long`; `/chalk-youtube` → `/chalk-long` with `/chalk-youtube` kept as an alias
  (a one-line SKILL.md that points at the other); `--format youtube` accepted as `long`; `youtube-output/` is
  only a convention in docs and becomes `long-output/` in new text, old dirs keep working.
- This is **bigger than a session**: about thirty files name `chalk-youtube` or `youtube-output`; the Short
  deliver imports `kit.mjs` from `formats/youtube` by relative path ([short deliver.mjs:15](../formats/short/skills/chalk-short/scripts/deliver.mjs#L15));
  `.chalk/pipeline.json` stores `format: "youtube"` ([run.mjs:272, 428](../pipeline/run.mjs#L272)); `bin/chalk.mjs`,
  `evals/run.mjs`, `ui/chalk_api.py` and `ui/launchers.py` each key on the name; the asset cache path is in
  three places ([bin/chalk.mjs:109](../bin/chalk.mjs#L109), [build.sh:14](../frames/build.sh#L14),
  [seg.mjs:20](../frames/seg.mjs#L20)). Two sessions.
- **It goes first or last, never in the middle**: B1–B3 would otherwise write new files under the old name.
  It does not depend on B2. The recommendation is first, right after S1, while the tree is quiet.
- `~/.cache/chalk-youtube/assets` → `~/.cache/chalk/assets` with a fallback to the old path.
- `frames/seg.mjs` `destination:` label; `framelib.py` docstring; `pipeline/run.mjs` defaults.
- `CLAUDE.md` and the README: "never name the book" and "no quizzes" are the long format's rules for this
  channel, not YouTube's.
- Done when: `npm test`, `npm run test:ui` and `chalk doctor` pass with both names, and a build started under
  the old name resumes under the new one.

#### C3. Shape × pack

The change that makes "any channel" true of the gates, not only of the renderer.

- **Shape** (`long`, `short`, `lesson`): the stage list in `pipeline/stages.mjs`, the deliver, the orientation.
  Unchanged in meaning; renamed by C2.
- **Pack**: a directory `packs/<name>/` holding `eval/criteria.mjs` (the genre's criteria), the skill's outline
  and script references (what the parts are, what each must do), and fixtures. Packs to start:
  - `coding-lesson`: today's `formats/youtube/eval/criteria.mjs` and the `/chalk-youtube` script rules, moved;
    O, T, B and R2 unchanged.
  - `essay`: for focus, motivational and reflective pieces: one thesis, a shape (opening image, turn,
    ending that echoes), quotations attributed and supported (G8), sparse words with long holds, no arc of
    code stages; T1/T2/E2 do not apply.
  - `news`: what the news Short does by hand today: every fact attributed in the display layer, sources listed,
    a dated label, no claim the reporting does not make.
  - `skit`: two or more voices, turns, a stage; the grounding rule is that the comedy's facts are still facts.
- `channel.json` `pack`, overridable per manifest. `evals/run.mjs` loads `packs/<pack>/eval/criteria.mjs`
  instead of keying the pack on the format ([evals/run.mjs:19-23, 87-90](../evals/run.mjs#L19)); the eval
  stage's inputs include the pack directory ([stages.mjs:220-221](../pipeline/stages.mjs#L220)). Shared
  criteria stay shared; a pack criterion holds for every shape that pack runs in.
- The skills: `/chalk-long`, `/chalk-short` and `/chalk` read the pack's references for steps 2 and 3 through
  the same `references/` symlink pattern the core references use; the long skill's current text is the
  `coding-lesson` pack's.
- Tests: `test/evals.mjs` runs every pack's fixtures; a focus-video fixture passes `essay` and fails
  `coding-lesson`, and the coding fixture the reverse.
- Size: 2–3 sessions, done together with C2, since both move `formats/youtube`'s contents.

### Phase D: one chapter, many outputs

#### D1. Recut: a long video's segment as a Short

`/chalk-short` writes a new one-idea script. The cheap path reuses a finished segment's narration unchanged.

- `chalk recut <long-out> NN [--out shorts-output/<slug>-NN]`: creates a Short dir with `short.json`
  `{ "recut": { "from": "<long-out>", "segment": "NN" }, title, thesis, part_id, full_video, hashtags }`,
  links `chapter.json`, `lexicon.json`, the segment's `script.md`, narration and `audio_meta.json`, and the
  alignment; the pipeline then waits for a portrait `frames/s00.py`.
- `agents/chalk-frames.md`, recut mode: same cues, same text; stack what sat side by side; shorten a line rather
  than shrink its type; keep content in the safe box (B5). `COMPONENTS.md` states which components reflow and
  which need a different pick in portrait.
- **Narrate cannot simply be skipped.** The `narrate` stage runs setup, TTS, sync and word timings as one
  command ([build.sh:32-47](../frames/build.sh#L32)), and the copied `STORYBOARD.md` is landscape with the
  outro's 20 s end hold ([seg.mjs:45-46, 126, 200](../frames/seg.mjs#L45)). `chalk recut` runs a
  setup-sync-words path with no TTS, regenerates the storyboard in portrait, then `adopt`s the narrate stage
  ([run.mjs:335-354](../pipeline/run.mjs#L335)) so the hash records the reused takes. `adopt` refuses a stage
  whose output is older than an input ([run.mjs:347](../pipeline/run.mjs#L347)), and a copied `script.md` is
  newer than the linked takes, so `recut` copies with mtimes preserved (`cp -p`) and links the takes; the
  check then passes on its own terms, with no `--force`. Portrait captions regroup
  from `caption_groups.json` at frames time, which already happens. `gen.py`'s short context forces the hook
  stage and no stage card ([gen.py:100-116](../frames/gen.py#L100)), which is what a recut wants.
- `formats/short/eval/criteria.mjs`: a recut has no `[pipeline]` pointer line in its narration (the audio is
  untouched), so **S6** accepts `short.json.recut` with a `full_video`. The pointer is drawn, not spoken, and it
  is the **last frame's hold** via `END_HOLD` ([seg.mjs:46](../frames/seg.mjs#L46)), not a card appended at
  deliver: appending would re-encode the video (`-c:v copy` today), stretch `captions.srt` and change the S2
  length after the fact. The hold keeps "audio is the clock". **S2** still applies: only segments of 15–60 s
  recut; `chalk shorts-plan` (D2) says which.
- Grounding and the text gates are already paid for; `grounding-frames` reruns over the new frame text.
- Done when: a recut of a 50 s segment passes the Short eval with no new narration.

#### D2. Shorts plan

- `chalk shorts-plan <long-out>`: lists candidate Shorts from a built video, mechanically: every segment or
  scene range of 15–60 s, with its stage (bug, why-fast, interview, one trace step), duration, first line, and
  the recut command. Marks the ones whose first line would fail S7 so the user knows a rewrite is needed instead.
- `/chalk-short` SKILL.md: start from the plan; give each Short a different opening shape so a week of them
  does not read as one template.

## Order and size

| Step | Item | Size | Depends on |
|---|---|---|---|
| 0 | S1 fact-check stage, `facts.md`, its gate and waivers; S2–S4 follow as sources are needed | 2–3 sessions, then 1½ + 2–3 + ½ | — |
| 1 | C2 rename and C3 shape × pack, together, while the tree is quiet | 4–5 sessions | — |
| 2 | A1 frames reviewer | 1–2 sessions | — |
| 3 | A2 reading-time check | 1 session | — |
| 4 | A5 loudness for long and lesson | 1 session | — |
| 5 | A3 component index, A4 lessons via resolution.md | 1 session | — |
| 6 | B1 kit, B2 contract, B3 kit destination | 2–3 sessions | C2 |
| 7 | B4 platform shaping and the destination pack, B5 safe box and hook | 2 sessions | B1, B2 |
| 8 | C1 theme folders, then the catalogue (C1a) in its order | 1–2 sessions for the folders; ½–2 per theme, plus the components some need | A1 (the reviewer reads THEME.md) |
| 9 | D1 recut, D2 shorts plan | 2–3 sessions | B5 |
| 10 | B6 API destinations, one at a time | 1 session each | B2, the user's accounts |

Phases A and B can run side by side once C2 is in. **Every new stage touches builds in flight** (S1, A1):
each gets the grandfather rule under S1, and the first real build after each lands is watched for a stage that
waits on nothing.

### The UI

`ui/` is not optional in any of this. `ui/test_ui.py` requires every stage in `stages.mjs` to belong to a phase
in `ui/theme.py` and every author stage to have a launcher in `ui/launchers.py`
([ui/test_ui.py:125-134](../ui/test_ui.py#L125)), so S1, S3, A1 and the research gate each add a phase entry,
a launcher and a console tab; the format table in `ui/chalk_api.py` learns `long`; the gates page shows
`facts.md` with its waivers and `frames-review.md` with its stills; and `chalk publish --to` gets a destinations
card. `npm run test:ui` is part of "done" for every step that adds a stage.

## Docs and credits

- README: formats table (long / short / lesson), the destinations table, `kit.json`, theme folders, the new
  commands (`stills --at-cues`, `recut`, `shorts-plan`, `themes`, `publish --to`).
- `CLAUDE.md`: the invariant "the kit is neutral; a platform's rules live in `publish/<platform>.mjs` and
  `platforms.json`, never in deliver or a format".
- `formats/long/CLAUDE.md`, `formats/short/CLAUDE.md` (new): the shape's rules.

## Decisions needed

0. ~~The fact-checker's scope~~ — **decided 2026-11-17**: threshold claims (numbers, dates, names, quotations,
   superlatives, causal statements), not every sentence; a script without citations is accepted and checked
   hard; a quotation is supported by the primary text or two independent secondary sources.
0b. ~~Network for two agents~~ — **decided 2026-11-17**: per-agent `network: true` for `chalk-factcheck` (landed)
   and `chalk-research` (with S3); every other agent and the chat stay offline.
0c. **Packs.** The four to start (`coding-lesson`, `essay`, `news`, `skit`) and their names; and whether the
   focus-music project's music step moves into chalk (the music clock under open question 7) or stays where it is.
1. **Platforms, in order.** Which matter first: YouTube + Instagram + LinkedIn is the guess. This sets B6's order
   and whether TikTok and X are built at all.
2. **Accounts.** Is there, or will there be, an Instagram Professional account with a Meta developer app, a
   TikTok developer app, X API access? Without them B3 (the kit folder) is the Instagram/TikTok/X path and B6
   is LinkedIn only.
3. **Hosting for Instagram.** The API needs a public URL. A command the user provides (`rclone`, `aws s3 cp`, a
   server) is the plan; say if there is a preferred one.
4. **The rename's names** (`long`, `/chalk-long`, `long-output/`): the rename itself is scheduled as step 1;
   only the words are open.
5. **Square (1:1)** for feeds: a third orientation in framelib. Not planned; say if a feed that needs it matters.
