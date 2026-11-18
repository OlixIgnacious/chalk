# Step 1: Ingest

Turn whatever the user handed over into `chapter.json` — paragraph-addressed blocks with stable ids.
Those ids are the grounding currency for every later step, so they must be stable across re-runs.

```bash
npx chalk-core ingest <input> --out <output-dir>/chapter.json
```

## Schema

```json
{
  "title": "Supply and Demand",
  "source": "principles.epub#ch04",
  "lang": "en",
  "quality": "clean | needs-review | ocr",
  "blocks": [
    { "id": "p012", "kind": "para", "text": "...", "page": 47 },
    { "id": "e003", "kind": "equation", "text": "...", "latex": null, "asset": "work/eq-003.png", "confidence": "low" },
    { "id": "f001", "kind": "figure", "caption": "...", "asset": "work/fig-1.png" },
    { "id": "x002", "kind": "exercise", "text": "..." },
    { "id": "c004", "kind": "code", "lang": "python", "text": "def f(x):\n    return x" }
  ]
}
```

`kind` is one of `para`, `heading`, `quote`, `list`, `figure`, `equation`, `exercise`, `footnote`,
`code`.

A `code` block keeps its text **verbatim, indentation included**, and its `lang` when the source tags
one (a fenced block's info string, or `language-xxx` on an EPUB `<pre>`); otherwise `lang` is `null`.
`has_code` at the top of `chapter.json` is `true` when any exist, and ingest prints a note — that is
the cue to offer a hands-on notebook. In Markdown and text, a paragraph that opens with "Exercise",
"Problem" or "Question" becomes an `exercise` block. PDF code is best-effort: the text layer loses
indentation, so treat PDF code as needing review and never execute it unread.

## Chapter splitting

`--list` prints the splits and stops; `--chapter <number or title>` picks one. With neither, a
multi-chapter file prints its splits and refuses, rather than guessing which chapter was meant.

EPUB splits on the spine, titled from the `nav` (EPUB3) or the `ncx` (EPUB2). PDF splits on detected
chapter headings, because poppler exposes no bookmark listing.

## TODO

- [x] Markdown and plain text
- [x] EPUB — a zip of XHTML; spine order, `nav`/`ncx` titles, footnotes as their own blocks, DRM refused
- [x] PDF — `pdftotext -layout`, multi-column detection, running heads and page numbers stripped
- [x] Scanned PDF — missing text layer detected by chars-per-page, OCR with `tesseract`, `quality: "ocr"`
- [x] Equations — detected and marked `confidence: "low"` with the rendered page as `asset`; notation is never retyped
- [ ] Figures — EPUB `<figure>` carries its caption and `src`; PDF figures are not extracted yet
- [ ] Crop the equation region itself rather than handing over the whole page
- [ ] Detect `lang` for PDF; EPUB reads it from the OPF

See [edge-cases.md](edge-cases.md) for the handling each of these needs.

## Three kinds of source

What produces the blocks can vary; everything after ingest sees `chapter.json` the same way.

| Kind | How it starts | What a block is | Its evidence |
|---|---|---|---|
| **document** (the default) | `--doc chapter.md` (md, txt, epub, pdf) | a paragraph, code block, equation… | the document and its position |
| **script** | `--doc my-script.md --kind script` | a line or paragraph of the user's own narration | the user's `[ref: …]` on the line, if any |
| **research** | `--topic "…"`: the chalk-research agent writes `research.md`, the user approves it | one paragraph, one claim | its `[ref: url | retrieved date | "quote"]` |

A **reference** is written at the end of a paragraph: `[ref: <url or title> | retrieved YYYY-MM-DD | "the
sentence it rests on"]`, any part optional, several allowed. Ingest takes it off the text (a URL is evidence,
never something said or shown) and keeps it on the block as `ref`. The source check reads it first; deliver lists
the references of every cited block in `plan.md` and, with a URL, in the description's sources.

**A script source** is ingested first, so its lines get block ids, then rewritten into the two-layer form
(step 3) citing those ids. Grounding is then easy (the script is the source) and the weight moves to the source
check, which is right: a script has had no editor, and that is where the mistakes are. Say in `plan.md` that the
source was the user's script.

## Gate

- `chapter.json` exists and blocks are in reading order
- `quality` is classified; anything not `clean` gets a human skim before step 2
- You can state the chapter's thesis in one sentence
- A script or research source: every block that states a fact you will use has a `ref`, or the source check will
  have to find its evidence
