# chalk — working rules

`/chalk` turns a book chapter into short, minimal, animated lessons: an MP4 per segment plus an
interactive `lesson.html` that wraps them with checkpoints.

Read this before changing anything in `skills/chalk/`.

## What this repo is

**Markdown and reference data, not an application.** The skill is a pipeline of instructions with a
gate at every step. The video engine is [Hyperframes](https://github.com/heygen-com/hyperframes)
(HeyGen, Apache-2.0) and its `faceless-explainer` skill, which already own storyboarding, design
presets, audio, caption alignment, frame construction and rendering.

If you find yourself writing a lot of code, stop — you are probably rebuilding something the engine
already does. The four scripts in `skills/chalk/scripts/` exist because nothing upstream covers
them; that list should grow slowly and reluctantly.

The layout is deliberate: a thin `SKILL.md`, one `references/step-N-*.md` per step loaded only when
that step runs, and a hard gate between steps.

## Invariants

These are the rules that erode silently if nobody writes them down.

### Every claim is grounded

Every narration line and every piece of on-screen text maps to block ids in `chapter.json`. No
invented numbers, dates, examples, entities or citations. Illustrative scaffolding (axis labels,
generic placeholders) is fine, and must never read as a sourced fact.

**Never render an equation the extractor could not read cleanly.** If the source notation is
uncertain, show the cropped source image or ask the user for the LaTeX. A silently mis-transcribed
formula in a stats book is the worst failure this tool can produce.

Where the chapter is ambiguous, surface it to the user. Do not resolve it by guessing.

### The audio is the clock

Scene timing derives from VO word timings, never the other way round. `hyperframes tts` does not
emit word timings — get them by running `hyperframes transcribe` on the generated WAV, then map them
onto display tokens with `scripts/align-captions.mjs`.

Regenerating VO invalidates every downstream timing. Treat it as a hard reset, not a tweak.

### Tier routing is per scene, not per book

- **Tier 1 — HTML/SVG + KaTeX.** The default. Everything conceptual and narrative, diagrams, charts,
  and equations that only need to be displayed and annotated.
- **Tier 2 — Manim.** Only when an equation must visibly *become* another equation, or for geometric
  construction, limits, convergence, fields and 3D surfaces.
- **Tier 3 — the book's own figure**, when it is already the clearest available visual.

A Tier 2 scene is flat video: it cannot be interactive, cannot be restyled without re-rendering, and
drags in a LaTeX toolchain. Tier 2 is earned by a scene, never chosen by default.

### One design preset per series

Chosen once, in step 2, for the whole chapter. Picking per segment is how a course ends up looking
like six unrelated videos.

The house look is dark, high-contrast, low-chroma, one accent, generous negative space, line-drawn
diagrams. **Not** chalk texture or a skeuomorphic blackboard — the reference is 3Blue1Brown's
restraint, not a classroom prop.

### Gates are not advisory

Every step ends in a gate. Do not proceed past a failing one; report it instead. The expensive
mistake is rendering before the teaching has been reviewed, so the step-3 gate stops for the user.

## Conventions

- Output goes to `chalk-output/<chapter-slug>/`, timestamped if it already exists.
- `SKILL.md` stays thin. Detail belongs in `references/`, loaded per step.
- `BRIEF.md` is the contract boundary with `faceless-explainer`: chalk owns pedagogy, script, source
  material and tier routing; the engine owns animation mechanics, timing and render.

## Vendored code

`skills/chalk/scripts/align-captions.mjs` is vendored from `heygen-com/hyperframes` (Apache-2.0).
Keep its header comment, do not let it silently diverge, and record upstream changes in
`CREDITS.md`.

## Local setup

`npx hyperframes doctor` gates the environment. Node, FFmpeg, Chrome and `whisper-cpp` (which
supplies the word timings) come from Homebrew.

Kokoro TTS is not bundled and the system Python is too old for it, so it lives in a repo-local venv:

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python kokoro-onnx soundfile
export HYPERFRAMES_PYTHON="$PWD/.venv/bin/python"     # hyperframes tts looks here
```

Set `HYPERFRAMES_PYTHON` in your shell profile, or export it before any run that generates VO.
Without it, `hyperframes tts` fails with "the kokoro-onnx package is not installed" and the whole
pipeline stalls at step 4 — after the expensive planning work is already done.

`.venv/` is gitignored.

## Testing

Test against `fixtures/` — public-domain Project Gutenberg text. **Never test against a copyrighted
book.** The tool paraphrases and caps verbatim quoting; development should not undercut that.

`test/smoke.mjs` is the regression gate for the scripts — one dependency-free file, run with `npm
test`. It pins the grounding rules in particular: an unsourced spoken line and a `source:` that
migrates onto the wrong entry both used to pass, and both are now asserted. Add a case there before
fixing anything in `scripts/`. `test/player-browser.mjs` is the step-5 gate — file://, checkpoint
holding, no-localStorage and phone width are things only a browser can answer. It skips when Chrome
is absent, so `npm test` stays the everyday gate.

Useful gates while working:

```bash
npm test                                     # the script regression gate
npm run test:player                          # the lesson page, driven in Chrome
npx hyperframes doctor                       # environment
npx hyperframes check <project>              # the browser gate, zero errors required
npx hyperframes snapshot <project> --at 2,15 # inspect stills instead of re-rendering
```
