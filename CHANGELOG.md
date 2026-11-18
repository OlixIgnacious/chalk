# Changelog

Earlier history is in `git log`. This file starts at 0.8.0.

## 0.9.0 — 2026-11-18: any genre, any length, published anywhere, checked at the source

chalk began as certification prep from textbook chapters. It now makes a video of any kind for any channel
(coding lessons, focus and motivational pieces, news, skits), long or short, and publishes it anywhere, without
loosening what it exists for: every line is grounded in a cited source, and the source itself is checked.
The plan and its reasons are in `docs/anywhere-plan.md`.

### Checked at the source

- **The source check** (`facts.md`, the chalk-factcheck agent, `chalk-core facts`): once per version of the source
  (a hash of the blocks' text), every block with a number, a superlative or a quotation gets a verdict and its
  evidence; a contradicted claim stops the build until the source is fixed or the person waives it in
  `facts-accepted.md`. G7 and G8 in the eval. A quotation needs the primary text or two independent sources.
- **Three kinds of source**: a document, the person's own script (`--kind script`), or a topic with no document
  (`--topic "…"`): the chalk-research agent writes `research.md`, a reference per paragraph, and the person approves
  it before anything is outlined. A paragraph's `[ref: url | retrieved date | "quote"]` comes off its text onto the
  block; deliver lists the references in `plan.md` and the description.
- **The network is per agent**: only chalk-factcheck and chalk-research (`network: true`) reach the web.

### Shape × pack

- `formats/youtube` is now **`formats/long`**, `/chalk-youtube` is **`/chalk-long`** (the old name still works),
  `--format youtube` is read as `long`, and new output goes to `long-output/`.
- A **pack** (`packs/<name>/`) holds a genre's rules: its criteria and the outline and script references.
  `coding-lesson` is what the long video always was (O1–O6, T1–T10, B1); new: `essay` (Y1–Y5), `news` (W1–W5),
  `skit` (K1–K3). `channel.json` or the manifest names it; `chalk pack <out>` says which.

### Every build better

- **Frames reviewer** (A1): `chalk stills NN --at-cues` renders three stills per reveal from the frames build;
  the chalk-frames-reviewer agent writes `frames-review.md`; a `FIXES` verdict holds the render.
- **R6**: every timed text is up long enough to read (framelib writes `texts.json`).
- **Loudness** (A5, V4): every deliver masters to −14 LUFS, −1 dBTP in two passes (`chalk-core loudness`).
- **`frames/COMPONENTS.md`** (A3), generated from framelib's docstrings, and **`frames/LESSONS.md`** (A4), the
  defects seen in real builds; the resolver turns a defect class into a pipeline item.

### Published anywhere

- Deliver writes a neutral **`kit.json`**; `description.txt` is its YouTube shaping, byte for byte as before.
- **`chalk publish <out> --to youtube,instagram,facebook,tiktok,linkedin,x,kit`**, a per-platform record in
  `published.json`, the **P criteria** (P1–P6, `--plan`), `publish/platforms.json` for the limits, and a `kit`
  destination that writes a folder per platform for posting by hand. Nothing goes public at once unless the person
  says `--public-now`. The API destinations other than YouTube are checked offline against their documented request
  shapes and have **not** been run against the live APIs.
- **The Short's safe box** is measured from HyperFrames' TikTok, Reels and Shorts safe areas (`frames/safe.json`);
  S4 checks every edge; **S7** checks the hook.

### Themes

Twenty-two themes, each a folder (`theme.json`, `THEME.md`, `captions.css`, `poster.png`), chosen by the channel or
the video, never the repo; your own in `~/.config/chalk/themes/`. framelib gains reveal styles (draw-on, typed,
beam, step, fade), finishes (grain, paper, scanlines, halftone, vignette, riso, dither, flicker, glow, grid) and
fields (drift, firefly, flow); `chalk assets` stages Caveat, VT323 and Press Start 2P. `chalk themes`.
Not built: spreadsheet, transit, sketchnote, pictogram, comic and silhouette, which each need components first.

### One chapter, many outputs

`chalk shorts-plan <long-out>` lists the parts that could be Shorts; `chalk recut <long-out> NN` makes one with its
narration unchanged.

### Upgrading a finished build

- **Deliver and eval run again** once: their inputs now include the moved paths, the pack and the loudness master.
  The video is re-mastered to −14 LUFS; the picture is copied.
- **Frames show stale** (framelib changed); a rebuild gives the same frames unless the build names a new theme.
- **New stages do not hold builds in flight**: the source check and the frames reviewer report done for a build
  ingested before they landed, or already watched. Writing a `facts.md` or a `frames-review.md` opts one in.
- **New eval failures**: R6 and V4 on rebuilt or re-delivered parts; S4 and S7 on Shorts (the box is now measured;
  older Shorts drew to x=930 and y=1300). Fix or accept each.
- **`channel.json`**: `destinations.youtube` replaces the top-level `youtube` block, which is still read; `theme`
  and `pack` may now be set per channel.

## 0.8.0 — 2026-11-15: the lessons of DSA Patterns #3–#5, made into guards

### What the last three builds taught

Each build ran the full check loop (eval, grounding, learner, review, resolver), and each one found real
problems. But the fixes went into the video, and the guards that would stop them coming back stayed in
prose under "Pipeline" in `resolution.md`. dsa-03 (Nov 5) asked for N3, T10, E5, `F.pointer` and frames in
grounding's dependencies. dsa-04 and dsa-05 asked again. None of them landed. These are the patterns that
kept coming back:

1. **Pipeline items never landed.** No stage owned them, so each round said "later".
2. **Narration dropped branches of the code it showed.** dsa-03 and dsa-05 explained the "too small" pointer
   move but not "too big". dsa-04 read `if not result or …` without its `or`. The learner caught each one
   after render, so each fix cost a re-narration.
3. **Source gaps surfaced after render.** dsa-04's grounding ran nine rounds. The learner's questions ("why
   `not result`?", "what are n and m?") became author fixes, then a re-ingest, then re-narration.
4. **The notebook was tied to the frames.** The `In [n]` numbers shown on screen decided notebook questions
   ("keep the order, or the panel numbers change") in dsa-04 and dsa-05. The notebook is meant to stand alone.
5. **Reports signed off on stale files.** Grounding never re-ran when a frame spec changed. The review
   never re-ran when notebook-review changed. Old stills survived re-renders. A waiver passed any failure
   under its ID. T8 counted a part that had been cut.
6. **Frame code was copied between builds.** `pointers`, `pointer`, `md_rows` and hand-placed ✗ arrows were
   repeated across dsa-04 and dsa-05. Pointer visuals had a problem in every video (`l` read as `1`, a
   pointer swept to the end and jumped back).

### 1. Open pipeline items now block the next build

- `resolution.md` ends with a `## Pipeline` checklist (`agents/chalk-resolver.md`). An item closes only when
  it names a commit that exists in the chalk repo (`- [x] … — 3f2c1ab`), or says `deferred: <why>`. A tick
  alone does not close it.
- New stage **`pipeline-debt`**, a new stage kind `gate`, before `frame-spec` in every format
  (`pipeline/debt.mjs`). It reads every other build's `resolution.md` in the workspace and waits, listing
  each open item, until all are closed. A build whose frame specs are all written is past the gate and is
  not held back.

### 2. Staleness: reports wait when what they read changes

- New stage **`grounding-frames`** after `frame-spec`. It waits for the grounding agent again whenever a
  `frames/sNN.py`, a script, `chapter.json` or `video.json` is newer than `grounding.md`. On-screen text is a
  claim too (`agents/chalk-grounding.md`).
- `scripts-approved` checks only that `grounding.md` exists, not its content, so a re-run of grounding over
  the frames does not undo the approval.
- `review` now also waits on `notebook-review.md`.
- `render` deletes the part's old `work/stills/NN*.png`, so nobody reads stills of frames that no longer exist.
- **Pinned waivers.** `chalk eval <out> --pin` records the evidence each accepted failure had
  (`"accepted": {"E3": {"reason": …, "evidence": […]}}`). A new evidence line, or a number that grows more
  than 2% (a 130.5 s part becoming 140 s), fails again. A reason-only waiver still works but is reported as
  unpinned.
- The eval ignores outline rows for parts cut from `video.json`, so T8 counts the parts that are in the video.
- `deliver` no longer re-runs when only a waiver or `thesis_source` changes in `video.json`.

### 3. T10: every branch of narrated code is said

- New criterion **T10** (`formats/youtube/eval/criteria.mjs`). It runs in the text gates, before anything is
  voiced:
  - If a part narrates one branch of an `if/elif/else`, it must narrate them all. Branches are matched by
    the script's `lines:`, or failing that by the branch's own comment words.
  - A narrated `if a or b` must say "or" (likewise "and").
  - A scene's `skips: c020 — <why>` excuses one block.
- On the real builds it fails dsa-04 part 11 (`not result or …`) and dsa-05 part 05 (the `else` for "too
  big"). It passes dsa-01, dsa-02 and dsa-03.
- `step-3-examples.md` has the matching writing rule: every branch, every clause, and every step you name
  says its choice.

### 4. The learner reads the scripts before narration

- New command **`chalk read-aloud <out>`** (`pipeline/read-aloud.mjs`). It prints each part's title, the
  on-screen line, the code shown and the caption lines, and nothing else: no citations, stages or visual
  notes.
- New stage **`learner-scripts`** between grounding and the scripts approval. The chalk-learner agent has a
  script mode that reads only `read-aloud` and writes `learner-scripts.md`, ending with "Questions the
  scripts never answer". Those go to the author while the fix is still a script line or a source sentence.
  A `learner.md` newer than every script also satisfies the stage.

### 5. Frame helpers in the library, not copied between builds

- **`F.pointer_walk(values, x, y, {"read": ("above", 1), …})`** draws cells with named pointer chips and
  carets. `.walk([...])` and `.move()` move them one step at a time. Names that read as digits next to
  number cells (`l`, `I`, `O`, `o`) are refused.
- **`F.block_table(bid, …, pick=, cols=)`** and **`F.table_rows(bid)`** draw or read a source markdown
  table as written. They replace each spec's own `md_rows`.
- **`F.reject(box, against, cue, sel=)`** handles a true fact that breaks a rule: it turns the accent colour,
  and a ✗ and an arrow point into the rule. The chalk-frames agent now has the rule "never draw a line
  through a sourced fact".
- `F.table` now also measures wrapped cells: more lines than `row_h` holds fails the build. Rebuilding
  dsa-04's frames 11 and 12 confirmed the shipped tables still fit.
- `agents/chalk-frames.md`: no helpers copied from another build. A helper the library lacks is named in the
  agent's reply so it can be added to the library.

### 6. Run-panel numbers follow the notebook

- `code_run` numbers each call from its own notebook cell, consecutive or not (`notebook_numbers`). A
  reordered or merged notebook just rebuilds the frames, with no spec edit. A call the notebook never runs is
  now a build error, where it used to be a warning and a silent `In [1]`.
- Rule 7 in `agents/chalk-resolver.md`: "the panel numbers would change" is never a reason to keep a
  notebook as it is. The notebook's order is decided on what reads best there.
- I rebuilt every `code_run` part of dsa-03, dsa-04 and dsa-05. dsa-04 and dsa-05 come out identical.
  dsa-03's panels in parts 02, 07 and 09 change from `In [1]`/`[2]` to `In [2]`, `[14]`, `[15]`, which are
  their real notebook cells. Those frames were rendered before notebook numbering existed, and dsa-03's
  review flagged them as its top finding.

### 7. N3 and G6

- **N3**: the notebook never re-runs itself. Two consecutive code cells that repeat, in the same order,
  further down fail. A lone reset (`nums = [...]` before a different call) or a bare name shown twice passes.
- **G6**: the thesis cites its blocks. `video.json` gets `thesis_source: [...]`, and the grounding agent
  checks the title and thesis against those blocks. Why not word overlap: I tried it on all five theses.
  dsa-05's wrong thesis scored 0.78, and dsa-01's accurate one scored 0.37.

### Upgrading a finished build

- **Approve the scripts once more**: `chalk pipeline approve <out> --scripts`. The approval's hash changed
  shape. Nothing in the scripts changed.
- **`chalk pipeline adopt <out>`** records `deliver`'s new `video.json` view without delivering again.
- **Frames show stale** because `framelib.py` changed. Rebuilding gives the same frames, except dsa-03's
  run panels. When you rebuild one part, use `--only NN` so the others are not re-rendered.
- **`grounding-frames` waits** where frame specs changed after `grounding.md`. On dsa-05 this is real: s04,
  s05, s10 and s14 were edited after grounding r5.
- **New eval failures on finished builds.** For each, fix it or accept it with `--pin`:
  - T10: dsa-04 part 11, dsa-05 part 05.
  - N3: dsa-05's "Careful" section; dsa-04's side-by-side section, which you approved on purpose.
  - G6: every build until `thesis_source` is added.
- **Older resolutions are prose.** `pipeline-debt` reads only `## Pipeline` checklists. Their items that this
  release does not cover are listed below. Put them into a checklist, or defer them, so the gate can see them.

### Still open (from the dsa-03 to dsa-05 resolutions, not in this release)

- `REASON` in `criteria.mjs` still counts `why` and a bare `so` as a reason (T6's false pass on dsa-05's
  cut part 11).
- E5, the insight-pace criterion, and the spoken-style pause rule.
- A words-per-second warning for dense tables (the old s12 table at 32 px).
- `gen.py`: warn when a frame reads `steps[k]`, k > 0, before the scene that walks it. `code_run(run_first=True)`.
- `step-2-outline.md`: a series-slot check before "its own video".
- `build-notebook.mjs`: normalise U+2212 (−) in code.
- The voice notes from `notes.md` ("no" and "memory" sound robotic; practice-part alignment).
