# chalk-core — working rules

The shared core under the chalk skills. It turns a source text into **grounded blocks**, gates a
**script** against them, and aligns **captions** to narration. It knows nothing about lessons,
YouTube or any other output: the skills built on it (`/chalk` for interactive lessons, `/chalk-long` and
`/chalk-short` for video) and the genre packs (`packs/`) own pedagogy, structure and delivery.

Read this before changing anything here. A change to core changes every skill that depends on it, so
the bar is: *would every skill want this?* If only one would, it belongs in that skill.

## What lives here

- `scripts/` — `ingest`, `check-readability`, `check-spoken`, `build-tokens`, `align-captions`,
  `apply-display`, `narrate`, `emit-vtt`, `fix-index`, `manim-render`, `facts` (the source check's mechanical half),
  `loudness` (every deliver masters to −14 LUFS, −1 dBTP through it). One entry point: `bin/chalk-core.mjs` (`npx chalk-core <command>`).
- `references/` — the shared method: `fidelity`, `spoken-style`, `step-1-ingest`, `step-3-script`,
  `visual-registry`, `manim`, `captions-and-engine`, `edge-cases`. Skills receive these through `chalk-core sync`.
- `templates/manim/` — the Tier 2 base scene and the worked example.
- `fixtures/` — public-domain Project Gutenberg text and files built from it.

The video engine is [Hyperframes](https://github.com/heygen-com/hyperframes) and its
`faceless-explainer` skill. If you are writing a lot of code, you are probably rebuilding something
the engine already does. This list should grow slowly and reluctantly.

## Invariants

These erode silently if nobody writes them down. They are inherited by every skill.

### Every claim is grounded

Every narration line and every piece of on-screen text maps to block ids in `chapter.json`. No
invented numbers, dates, examples, entities or citations. Illustrative scaffolding (axis labels,
generic placeholders) is fine, and must never read as a sourced fact.

**Never render an equation the extractor could not read cleanly.** If the source notation is
uncertain, show the cropped source image or ask for the LaTeX. A silently mis-transcribed formula is
the worst failure this tool can produce.

Where the chapter is ambiguous, surface it to the user. Do not resolve it by guessing.

### The audio is the clock

Scene timing derives from VO word timings, never the other way round. `hyperframes tts` does not emit
word timings — run `hyperframes transcribe` on the generated WAV, then map them onto display tokens
with `align-captions`. Regenerating VO invalidates every downstream timing: a hard reset, not a tweak.

**And do not cut the clock.** TTS generates a segment as one continuous take, so a frame that runs
longer than its narration splices digital silence into the middle of flowing speech. A frame's
duration equals its narration, exactly. The one exception is the last frame of a segment, where a
hold is just trailing silence.

### Tier routing is per scene, not per book

- **Tier 1 — HTML/SVG + KaTeX.** The default.
- **Tier 2 — Manim.** Only when an equation must visibly *become* another equation, or for geometric
  construction, limits, convergence, fields and 3D surfaces.
- **Tier 3 — the book's own figure**, when it is already the clearest available visual.

Tier 2 is flat video and drags in a LaTeX toolchain. It is earned by a scene, never chosen by default.

### The narration is for the ear

A script can pass every grounding gate and still sound like a document read aloud by a robot. The spoken
layer is a person talking to one viewer, written by the rules in `references/spoken-style.md` and measured
by `check-spoken`. Grounding does not loosen for it: every conversational line still cites a block. Pauses
are made by `narrate`, inside each take, so the audio-is-the-clock rule still holds.

### Gates are not advisory

Every step ends in a gate. Do not proceed past a failing one; report it instead.

## Vendored code

`scripts/align-captions.mjs` is vendored from `heygen-com/hyperframes` (Apache-2.0). Keep its header
comment, do not let it silently diverge, and record upstream changes in `CREDITS.md`.

## How skills depend on this

- **Scripts:** `npx chalk-core <command>`, pinned to a version. Never reach into `scripts/` by path.
- **References:** `chalk-core sync <skill-dir>` copies `references/*.md` to the skill's
  `references/core/` and stamps the version. `chalk-core sync <skill-dir> --check` fails on drift;
  run it in the skill's own tests.
- **Behaviour changes ship as a version bump.** A skill changes shared behaviour only by upgrading.
- **Never edit `references/core/` inside a skill.** Change it here and sync, or the next sync
  overwrites it.

## Local setup

`npx hyperframes doctor` gates the environment: Node, FFmpeg, Chrome and `whisper-cpp` come from
Homebrew. Kokoro TTS is not bundled and needs Python `>=3.10,<3.14`, so it lives in a venv:

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python kokoro-onnx soundfile
export HYPERFRAMES_PYTHON="$PWD/.venv/bin/python"
```

Tier 2 also needs `manim`, and `MathTex` additionally needs TinyTeX or BasicTeX; see
`references/manim.md`. `.venv/` is gitignored, and a symlink to another checkout's venv works.

## Testing

Test against `fixtures/` — public-domain text. **Never test against a copyrighted book.**

`test/smoke.mjs` is the regression gate: one dependency-free file, run with `npm test`. It pins the
grounding rules in particular — an unsourced spoken line and a `source:` that migrates onto the wrong
entry both used to pass, and both are asserted. **Add a case there before fixing anything in
`scripts/`.** It also covers the CLI and `sync`. `npm run test:tier2` renders Manim and checks alpha.
