# Step 1: Ingest

Turn whatever the user handed over into `chapter.json` — paragraph-addressed blocks with stable ids.
Those ids are the grounding currency for every later step, so they must be stable across re-runs.

```bash
node <skill-dir>/scripts/ingest.mjs <input> --out <output-dir>/chapter.json
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
    { "id": "x002", "kind": "exercise", "text": "..." }
  ]
}
```

`kind` is one of `para`, `heading`, `quote`, `list`, `figure`, `equation`, `exercise`, `footnote`.

## TODO

- [ ] Markdown and plain text (easiest; build and test here first)
- [ ] EPUB — a zip of XHTML; read the `nav`/`ncx` for chapter splits
- [ ] PDF — shell out to `pdftotext -layout`; detect and handle multi-column
- [ ] Scanned PDF — detect a missing text layer, OCR with `tesseract`, mark `quality: "ocr"`
- [ ] Equations — detect, crop to an image, set `confidence`; never guess the notation
- [ ] Figures — extract and reference from the block
- [ ] Strip running heads and page numbers; keep footnotes as their own blocks

See [edge-cases.md](edge-cases.md) for the handling each of these needs.

## Gate

- `chapter.json` exists and blocks are in reading order
- `quality` is classified; anything not `clean` gets a human skim before step 2
- You can state the chapter's thesis in one sentence
