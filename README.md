# chalk

**Chalk it up.**

Turn a book chapter into minimal animated lessons — the board, the diagram, the voice that walks you
through.

Point `/chalk` at a chapter and it reads it, works out the order the ideas actually need to be
taught in, and produces a short lesson series: an MP4 per segment plus an interactive `lesson.html`
that plays them in order and stops at a checkpoint question between each one.

Every line it says is traceable to a paragraph in the source.

## Status

Early. The pipeline plans and scripts a chapter, and stops at the step-3 review gate — which is
where it is meant to stop, but also as far as it currently goes.

| | |
|---|---|
| Ingest | `.md` and `.txt`. EPUB and PDF are not implemented — convert to Markdown first |
| Syllabus, script | working, with the grounding and readability gates enforced |
| Segments (step 4) | delegated to `faceless-explainer`; the Tier 2 Manim path is a stub |
| Lesson page (step 5) | not built — `build-lesson-page.mjs` validates the manifest and stops |
| Deliver (step 6) | not built |

`npm test` is the regression gate for the scripts.

## Requirements

- Node ≥ 22, FFmpeg, Chrome — check with `npx hyperframes doctor`
- Optional, for maths: `manim` and a LaTeX distribution (see `skills/chalk/references/manim.md`)
- Later, for PDFs: `pdftotext` (poppler) and `tesseract` for scanned pages — not wired up yet

## Install

```bash
git clone https://github.com/OlixIgnacious/chalk.git
cd chalk
npx hyperframes doctor     # environment gate
npx hyperframes skills     # installs faceless-explainer + the hyperframes domain skills

# Kokoro TTS is not bundled, and macOS system Python is too old for it
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python kokoro-onnx soundfile
export HYPERFRAMES_PYTHON="$PWD/.venv/bin/python"
```

Put `HYPERFRAMES_PYTHON` in your shell profile. Without it, voiceover fails at step 4 — after all
the planning work is done.

Open the repo in Claude Code and the `chalk` skill is discovered automatically. To use it elsewhere,
symlink `skills/chalk` into `~/.claude/skills/`.

## Use

```bash
/chalk fixtures/gutenberg-chapter.md
/chalk chapter-4.md --segments 5 --format vertical
/chalk fixtures/gutenberg-math-chapter.md --math on
/chalk this chapter, but assume they've never seen calculus
```

EPUB and PDF input is not implemented yet; `ingest.mjs` says so rather than guessing at the text.
Convert to Markdown and pass that.

| Option | Values | Default |
|---|---|---|
| `--chapter` | number or title | inferred — needs EPUB/PDF input, so not yet usable |
| `--segments` | 3–6 | inferred from length |
| `--format` | `landscape`, `vertical`, `square` | `landscape` |
| `--audience` | freeform, e.g. "first-year undergrads" | inferred |
| `--math` | `auto`, `on`, `off` | `auto` |

It stops after planning the lessons and writing the scripts, so you can correct the teaching before
anything renders. Rendering a chapter takes tens of minutes; reviewing the plan takes two.

## Output

What a complete run produces. Today everything from `segments/NN/script.md` upward is written; the
rendered video and the player are not.

```
chalk-output/<chapter-slug>/
  lesson.html          interactive: segment nav, checkpoints, captions, glossary
  lesson.mp4           all segments concatenated
  lesson.json          the manifest the player reads
  lesson-plan.md       syllabus, objectives, and a source citation per claim
  segments/NN/
    segment.mp4
    segment.vtt
    script.md
```

## How it works

```
chapter → ingest → syllabus → script → segments → player → deliver
          ↓         ↓          ↓        ↓          ↓
          block     concept    two-     faceless-  checkpoints
          ids       graph +    layer    explainer  + nav
                    objectives VO/      + manim
                               display
```

chalk owns the pedagogy: what to teach, in what order, grounded in which paragraphs. The video
itself is rendered by [Hyperframes](https://github.com/heygen-com/hyperframes) and its
`faceless-explainer` skill.

## Licence

Apache-2.0. See `CREDITS.md`.
