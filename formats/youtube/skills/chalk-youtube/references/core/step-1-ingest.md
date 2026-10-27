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

## Gate

- `chapter.json` exists and blocks are in reading order
- `quality` is classified; anything not `clean` gets a human skim before step 2
- You can state the chapter's thesis in one sentence
