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
already does. The scripts in `skills/chalk/scripts/` exist because nothing upstream covers them; that list should
grow slowly and reluctantly.

**The shared half is not here.** Ingest, the grounding gate, caption alignment, Manim and the shared
references live in [core/](../../core), and the lesson consumes them as `npx chalk-core <cmd>` (or
`chalk <cmd>`), reading the references in place through the `skills/chalk/references/core/` symlink. What stays here is what
is specific to an interactive lesson: the syllabus and pedagogy, the lesson page, and delivery.

The layout is deliberate: a thin `SKILL.md`, one `references/step-N-*.md` per step loaded only when
that step runs, and a hard gate between steps.

## Invariants

These are the rules that erode silently if nobody writes them down.

### Inherited from chalk-core

Three invariants are owned by chalk-core's CLAUDE.md and apply here unchanged. Read them there; they
are not restated, so they cannot drift:

- **Every claim is grounded** — every line and on-screen text maps to block ids, and an equation the
  extractor could not read cleanly is never rendered.
- **The audio is the clock** — scene timing derives from VO word timings, and a frame's duration
  equals its narration exactly. The one exception, the last frame of a segment, is where the payoff
  hold below applies.
- **Tier routing is per scene, not per book** — Tier 1 by default, Tier 2 (Manim) earned by a scene.

### Hold the payoff — the payoff, not every frame

The frame that carries the point stays on screen after its narration lands. That is one frame per
segment, not all of them. Applied to every frame it produced 20 silent freezes totalling 18% of the
runtime, one every 13–26 seconds, which reads as the video getting stuck — because it is. A hold
inside a segment also cuts the continuous VO (above). Budget: 0s between scenes, ~1.8s at the end.

### One design preset per series

Chosen once, in step 2, for the whole chapter. Picking per segment is how a course ends up looking
like six unrelated videos.

The look is the channel's: `channel.json` `theme` or `lesson.json` `theme` names one of `frames/themes/`
(`chalk themes`), and `broadside` is only the fallback. Whatever the theme, a lesson keeps restraint: high
contrast, one accent with one meaning, generous negative space, diagrams that show the mechanism.

### Gates are not advisory

Every step ends in a gate. Do not proceed past a failing one; report it instead. The expensive
mistake is rendering before the teaching has been reviewed, so the step-3 gate stops for the user.

## Conventions

- Output goes to `chalk-output/<chapter-slug>/`, timestamped if it already exists.
- `SKILL.md` stays thin. Detail belongs in `references/`, loaded per step.
- `BRIEF.md` is the contract boundary with `faceless-explainer`: chalk owns pedagogy, script, source
  material and tier routing; the engine owns animation mechanics, timing and render.

## Shared references

`skills/chalk/references/core/` is a symlink to `core/references/`: one copy, edited in core, read in
place by both formats. `align-captions.mjs` and its `CREDITS.md` notes live in core.

## The engine is not always right for a lesson

`faceless-explainer` is tuned for promos. Four of its defaults are wrong here, and each one cost a
real defect this run — they are documented with their fixes in `references/core/captions-and-engine.md`
§ Engine quirks. In short: `sync-durations` assumes frame duration should equal narration duration
(right for a promo, wrong where text must stay readable); `fetch-sfx` rebuilds `audio_meta.json`
from a neutral sidecar and drops every voice if you wrote only the PL-shape file; the frame-worker
packet's `<frame_id>-` id convention produces ids starting with a digit, which throw in
`querySelector`; and `assemble-index` and `captions.mjs` resolve the SAME `canvas` role for two
surfaces that need opposite contrast.

## Local setup

`npx hyperframes doctor` gates the environment. Node, FFmpeg, Chrome and `whisper-cpp` (which
supplies the word timings) come from Homebrew.

Kokoro TTS is not bundled, and `kokoro-onnx` needs Python `>=3.10,<3.14` while macOS ships 3.9 at
`/usr/bin/python3`. That interpreter is part of the OS and is not upgradeable, so Kokoro lives in a
repo-local venv built on a newer Python:

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python kokoro-onnx soundfile
export HYPERFRAMES_PYTHON="$PWD/.venv/bin/python"     # hyperframes tts looks here
```

Set `HYPERFRAMES_PYTHON` in your shell profile, or export it before any run that generates VO.
Without it, `hyperframes tts` fails with "the kokoro-onnx package is not installed" and the whole
pipeline stalls at step 4 — after the expensive planning work is already done.

`.venv/` is gitignored. Any interpreter in range works — the venv is just the tidy way to get one.

Tier 2 also needs `manim`, and `MathTex` additionally needs TinyTeX or BasicTeX.
`manim-render.mjs` finds a TinyTeX that is installed but not on `PATH`, and passes it to manim,
which shells out to `latex` itself. See `references/core/manim.md`.

## Testing

Fixtures live in core (`../../core/fixtures/`, public-domain Project Gutenberg text). **Never
test against a copyrighted book.** The tool paraphrases and caps verbatim quoting; development should
not undercut that.

`test/smoke.mjs` is the regression gate for chalk's own scripts — the lesson page and delivery — plus
two checks on the core boundary: the references are read from core in place, and no script that
core owns has crept back. It is one dependency-free file, run with `npm test`. Add a case there before
fixing anything in `scripts/`. The grounding and ingest tests live in chalk-core's `test/smoke.mjs`.
`test/player-browser.mjs` is the step-5 gate — file://, checkpoint holding, no-localStorage and phone
width are things only a browser can answer. It skips when Chrome is absent, so `npm test` stays the
everyday gate.

Useful gates while working:

```bash
npm test                                     # lesson page, delivery, core boundary
npm run test:player                          # the lesson page, driven in Chrome
npx hyperframes doctor                       # environment
npx hyperframes check <project>              # the browser gate, zero errors required
npx hyperframes snapshot <project> --at 2,15 # inspect stills instead of re-rendering
```
