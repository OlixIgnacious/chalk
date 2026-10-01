<div align="center">

<img src="assets/logo.svg" alt="chalk. Chalk it up." width="480">

**Turn a book chapter into minimal animated lessons.**

The board, the diagram, and the voice that walks you through, with every line traceable to the page it came from.

![License](https://img.shields.io/badge/license-Apache--2.0-blue)
![Node](https://img.shields.io/badge/node-%E2%89%A522-339933)
![Engine](https://img.shields.io/badge/video%20engine-Hyperframes-black)
![Claude Code](https://img.shields.io/badge/runs%20in-Claude%20Code-d97757)

</div>

---

## What it does

Point `/chalk` at a chapter. It reads it, works out the order the ideas actually need to be taught in
(which is rarely page order), and produces a short lesson series:

- an **MP4 per segment**, narrated and minimally animated
- an interactive **`lesson.html`** that plays the segments in order and stops at a **checkpoint question** between each
- a **`lesson-plan.md`** with a source citation for every claim

| | |
|---|---|
| **Grounded** | Every narration line and on-screen word maps to paragraph ids in the source. No invented numbers, dates or examples. |
| **Honest about maths** | An equation the extractor can't read cleanly is never rendered. You get the cropped source or a question. |
| **Audio is the clock** | Scene timing comes from the voiceover's word timings, so captions and cuts never drift. |
| **Reviewed before rendered** | The pipeline stops after planning so you fix the teaching in two minutes, not after a thirty-minute render. |
| **One look** | A single dark, high-contrast, line-drawn design preset for the whole series. |

## How it works

chalk owns the **pedagogy** (what to teach, in what order, grounded in which paragraphs). The video
itself is built by [Hyperframes](https://github.com/heygen-com/hyperframes) and its
`faceless-explainer` skill. Each step ends in a gate, and a failing gate stops the run.

### Agent flow

```mermaid
flowchart TD
    IN(["📖 Chapter<br/>.md · .txt · .epub · .pdf"]) --> S1

    subgraph PLAN["Plan: cheap, reviewable"]
        S1["<b>1 · Ingest</b><br/>ingest.mjs → chapter.json<br/>paragraph-addressed blocks"]
        G1{{"Gate 1<br/>clean extraction?<br/>thesis in one sentence?"}}
        S2["<b>2 · Syllabus</b><br/>concept graph · prerequisite order<br/>objective + checkpoint per segment<br/>one design preset"]
        G2{{"Gate 2<br/>every concept sourced?<br/>durations sum?"}}
        S3["<b>3 · Script</b><br/>two layers: spoken / display<br/>source ids · visual + tier per scene"]
        G3{{"Gate 3<br/>grounded? readable?<br/>check-readability.mjs"}}
        S1 --> G1 -->|pass| S2 --> G2 -->|pass| S3 --> G3
    end

    G1 -. "low confidence / OCR<br/>→ human skim" .-> S1
    G3 -->|pass| REVIEW{{"🛑 <b>Human review</b><br/>approve syllabus + scripts"}}
    REVIEW -. "revise the teaching" .-> S2

    subgraph BUILD["Build: expensive, only after approval"]
        T2["<b>Tier 2 clips</b><br/>Manim: equation becomes equation"]
        S4["<b>4 · Segments</b><br/>BRIEF.md → faceless-explainer<br/>TTS → transcribe → align → render"]
        G4{{"Gate 4<br/>hyperframes check = 0 errors<br/>stills clean · no network"}}
        S5["<b>5 · Lesson page</b><br/>lesson.json → lesson.html<br/>checkpoints · captions · glossary"]
        G5{{"Gate 5<br/>file:// · keyboard · phone width"}}
        S6["<b>6 · Deliver</b><br/>posters · lesson.mp4<br/>lesson-plan.md + citations"]
        T2 --> S4 --> G4 -->|pass| S5 --> G5 -->|pass| S6
    end

    REVIEW -->|approved| T2
    S6 --> OUT(["🎓 chalk-output/&lt;chapter-slug&gt;/"])

    classDef gate fill:#1f2937,stroke:#f59e0b,color:#fde68a;
    classDef stop fill:#7c2d12,stroke:#fb923c,color:#fff;
    classDef io fill:#0f172a,stroke:#38bdf8,color:#e0f2fe;
    class G1,G2,G3,G4,G5 gate;
    class REVIEW stop;
    class IN,OUT io;
```

### Inside step 4: the audio is the clock

```mermaid
flowchart LR
    A["script.md<br/>spoken layer"] --> B["hyperframes tts<br/>Kokoro → one WAV"]
    B --> C["hyperframes transcribe<br/>word timings"]
    C --> D["align-captions.mjs<br/>timings → display tokens"]
    D --> E["faceless-explainer<br/>frames, motion, render"]
    E --> F["fix-index.mjs<br/>engine quirk fixes"]
    F --> G["emit-vtt.mjs<br/>segment.vtt"]
    F --> H[("segment.mp4")]
```

A frame's duration equals its narration, exactly. Regenerating the voiceover invalidates every
downstream timing, so it is a hard reset, not a tweak.

### Tier routing, per scene

| Tier | Used for | Why |
|---|---|---|
| **1 · HTML/SVG + KaTeX** | Concepts, diagrams, charts, displayed equations | The default. Interactive, restylable, no LaTeX toolchain. |
| **2 · Manim** | An equation that must *become* another; geometric construction, limits, fields | Earned by the scene, never chosen by default. It renders to flat video. |
| **3 · The book's own figure** | When the original figure is already the clearest visual | Don't redraw what is already good. |

## Status

Every step has a working implementation. The pipeline pauses at the step-3 review gate by design.

| Step | State |
|---|---|
| Ingest | `.md`, `.txt`, `.epub`, `.pdf`, including scanned PDFs via OCR |
| Syllabus, script | Grounding and readability gates enforced |
| Segments | Delegated to `faceless-explainer`; Tier 2 Manim renders and composites |
| Lesson page | Checkpoints, captions, glossary, progress, keyboard |
| Deliver | Settled-frame posters, `lesson.mp4`, `lesson-plan.md` with citation table |

**Known rough edges:** PDF figures are not extracted, and an equation hands over its whole rendered
page rather than a crop of the region.

## Quick start

### Requirements

- Node ≥ 22, FFmpeg, Chrome. Check with `npx hyperframes doctor`.
- `whisper-cpp`, which supplies the word timings.
- Optional, for maths: `manim`, plus TinyTeX or BasicTeX for `MathTex` (see [manim.md](skills/chalk/references/manim.md)).
- For PDFs: `pdftotext` (poppler); `tesseract` as well for scanned pages.

### Install

```bash
git clone https://github.com/OlixIgnacious/chalk.git
cd chalk
npx hyperframes doctor     # environment gate
npx hyperframes skills     # installs faceless-explainer + the hyperframes domain skills

# Kokoro TTS is not bundled, and it needs its own interpreter (see below)
brew install python@3.12
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python kokoro-onnx soundfile
export HYPERFRAMES_PYTHON="$PWD/.venv/bin/python"
```

<details>
<summary><b>Why a separate Python interpreter?</b></summary>

`kokoro-onnx` needs Python `>=3.10,<3.14`, and the `python3` macOS ships at `/usr/bin/python3` is
3.9. That one cannot be upgraded, because it is part of the OS and macOS tooling depends on it. The
fix is a newer interpreter alongside it, which is what the venv is. If you already have a Homebrew
Python in range, point `HYPERFRAMES_PYTHON` straight at it and skip the venv.

Put `HYPERFRAMES_PYTHON` in your shell profile. Without it, voiceover fails at step 4, after all the
planning work is done.
</details>

Open the repo in Claude Code and the `chalk` skill is discovered automatically. To use it elsewhere,
symlink `skills/chalk` into `~/.claude/skills/`.

### Use

```bash
/chalk fixtures/gutenberg-chapter.md
/chalk book.epub --chapter 4 --segments 5
/chalk stats.pdf --chapter "Sampling" --math on
/chalk this chapter, but assume they've never seen calculus
```

A book with several chapters and no `--chapter` prints its splits and stops rather than guessing
which one you meant.

| Option | Values | Default |
|---|---|---|
| `--chapter` | number or title | asked for, when the input holds several |
| `--segments` | 3–6 | inferred from length |
| `--format` | `landscape`, `vertical`, `square` | `landscape` |
| `--audience` | freeform, e.g. "first-year undergrads" | inferred |
| `--math` | `auto`, `on`, `off` | `auto` |
| `--draft` | flag, renders at 720p | full resolution |

## Output

The segment MP4s come from step 4; everything else is written by the scripts in this repo.

```
chalk-output/<chapter-slug>/
├── lesson.html          interactive: segment nav, checkpoints, captions, glossary
├── lesson.mp4           all segments concatenated
├── lesson.json          the manifest the player reads
├── lesson-plan.md       syllabus, objectives, and a source citation per claim
└── segments/NN/
    ├── segment.mp4
    ├── segment.vtt
    └── script.md
```

If the folder already exists, the run goes to a timestamped sibling instead of overwriting it.

## Repository layout

```
skills/chalk/
├── SKILL.md             thin entry point and the six gates
├── references/          one step-N-*.md per step, loaded only when that step runs
├── scripts/             ingest, build-tokens, align-captions, emit-vtt, fix-index,
│                        manim-render, build-lesson-page, deliver, check-readability
└── assets/
fixtures/                public-domain Project Gutenberg test inputs
test/                    smoke, player-browser and tier2 gates
```

This repo is mostly Markdown and reference data, not an application. The scripts exist only where
nothing upstream covers the job. Read [CLAUDE.md](CLAUDE.md) before changing anything under
`skills/chalk/`.

## Testing

Tests run against `fixtures/` (public-domain text). Never test against a copyrighted book.

```bash
npm test              # the script regression gate
npm run test:player   # the lesson page, driven in Chrome
npm run test:tier2    # the Manim render and its alpha compositing
npx hyperframes doctor
```

## Credits and licence

Video engine: [Hyperframes](https://github.com/heygen-com/hyperframes) by HeyGen (Apache-2.0).
`align-captions.mjs` is vendored from it; see [CREDITS.md](CREDITS.md).

Apache-2.0. See [LICENSE](LICENSE).
