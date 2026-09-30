# Edge cases

A clean, English, expository, text-layer chapter is the exception. Consult this whenever the input
isn't one.

Each row is a decision, not a warning.

## Ingestion

| Case | Handling |
|---|---|
| **Scanned PDF, no text layer** | Detect via a chars-per-page threshold. OCR with `tesseract`, set `quality: "ocr"`, and require a human skim before step 2 |
| **Multi-column academic PDF** | `pdftotext -layout` interleaves columns into nonsense. Detect via suspicious line lengths and broken reading order; extract per column region; on low confidence, stop and show the user what was extracted |
| **Equations in a PDF** | Extraction reliably mangles notation. Detect equation-dense regions, **crop them as images**, set `confidence: "low"`. Show the crop (Tier 3) or ask for the LaTeX. **Never reconstruct notation the extractor could not read** — see [fidelity.md](fidelity.md) |
| **Figures and tables** | Extract as images and reference them from the block. The book's own figure is often the clearest available visual — prefer it over redrawing. Attribute it |
| **Footnotes, running heads, page numbers** | Strip running heads and page numbers from the body. Keep footnotes as their own blocks — they often carry the caveat that matters |
| **DRM'd EPUB** | Won't unzip. Say so plainly and stop. Do not attempt to circumvent it |
| **A whole book, not a chapter** | Split via the EPUB `nav`/`ncx`, PDF bookmarks (`pdfinfo`), or Markdown headings. If none exist, show the detected splits and ask. Then process one chapter per run |
| **Non-English text** | Check a Kokoro voice exists for the language **before** planning (`npx hyperframes tts --list`), confirm `transcribe --language`, and verify font coverage. RTL and CJK need layout checks against the design preset. **If no voice exists, stop at step 1** rather than shipping an English-accented reading |
| **Very long chapter (>10k words)** | More than 8 segments is a course, not a lesson. Split into multiple lessons and say so |
| **Very short input (<400 words)** | One segment. Do not pad to hit a duration |
| **Code-heavy technical book** | Route to native Hyperframes code-block animation — typing, diffing, highlighting. Already supported; no new work |

## Content and fidelity

| Case | Handling |
|---|---|
| **Narrative, fiction or history** | Switch [pedagogy.md](pedagogy.md) to narrative mode. A prerequisite graph is the wrong shape and produces a lifeless list of events |
| **Cross-references to other chapters** | Detect "as we saw in Chapter N". Either ingest that chapter for context, or state the assumed prerequisite on screen. Never silently paper over it |
| **The chapter has exercises** | Use them as checkpoints instead of inventing questions |
| **Outdated or contested claims** | Represent the chapter faithfully and flag it. Do not silently correct the book, and do not present a correction as the book's view |
| **Medical, legal or financial content** | Keep the chapter's own framing and hedges; the citation carries the source. Don't upgrade a hedged claim into advice |
| **Copyright** | Paraphrase, cap verbatim quotes, develop against `fixtures/`. A user feeding their own book is their call, but don't make bulk reproduction the easy path |

## Audio and timing

| Case | Handling |
|---|---|
| **Jargon and proper nouns mispronounced** | Per-chapter `lexicon.json`. An unknown term **halts** step 3 until a pronunciation is set |
| **Reading maths aloud** | Every equation carries an authored `spoken` form. Never hand raw notation to TTS |
| **Caption alignment `MISMATCH`** | `align-captions.mjs` prints them. Resolve every one. A spoken interval with no caption is a red gate, not a style choice |
| **VO longer than the planned scene** | Scene durations flex to the audio. Never hardcode a duration when VO is present |

## Render and infrastructure

| Case | Handling |
|---|---|
| **Render cost** | ~5 × 100s × 30fps ≈ 15,000 frames — tens of minutes per chapter. Gate the teaching at step 3, use `--draft` for 720p, and inspect with `snapshot` rather than re-rendering |
| **Manim toolchain absent** | Run the install gate in [manim.md](manim.md) once, up front. Fall back to Tier 1 with a clear message rather than failing mid-run |
| **Alpha compositing unproven** | Verify before designing around it. Fallback: opaque background matching the design preset, cut full-bleed |
| **fps or dimension mismatch** | `manim-render.mjs` pins both from the composition config. A mismatch is an error, not a resize |
| **Partial failure mid-chapter** | One Hyperframes project per segment, so a failure loses one segment. Re-running skips completed ones |
| **Disk** | Frames plus per-segment projects add up. Clean `work/` on success |

## Player

| Case | Handling |
|---|---|
| **Autoplay blocked** | Audio cannot autoplay. Open on a click-to-start poster |
| **Tier 2 scenes aren't interactive** | Manim output is flat video. Don't build affordances that promise interaction it can't deliver |
| **Accessibility** | Captions on by default, keyboard navigation, visible focus, honour `prefers-reduced-motion` in the page chrome |
| **`localStorage` unavailable** | Wrap every read and write in try/catch. The page must work with no persistence |
| **Sharing** | `file://` works locally and relative paths keep the folder portable. Publishing is a separate, offered step |

## Adding a row

When something new breaks, add the row with the decision that resolved it. A warning without a
decision is not useful to the next run.
