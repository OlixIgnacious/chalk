# Step 5: Deliver

```bash
node <skill-dir>/scripts/deliver.mjs <output-dir> [--notebook] [--keep-work] [--dry-run]
```

## The manifest

Write `<output-dir>/video.json` before running it:

```json
{
  "title": "Averages Without Hiding the Spread",
  "thesis": "A mean is one number standing in for a whole list, and that is its danger.",
  "source": "ch3.md",
  "segments": [
    { "id": "01", "title": "The hook",           "mp4": "segments/01/segment.mp4", "vtt": "segments/01/segment.vtt" },
    { "id": "02", "title": "What variance adds", "mp4": "segments/02/segment.mp4", "vtt": "segments/02/segment.vtt" }
  ]
}
```

`title` and `thesis` go into the description, so they must be the chapter's own: the thesis is the
sentence you stated at the end of step 1. A segment `title` is what a viewer sees in the progress bar.

## What it does, in order

1. **Grounding gate.** Runs `chalk-core check-readability` over every script. A line with no source, a
   derived example with no `computed-by` or no on-screen tag, fails here. Nothing is written.
2. **Size and chapter gates.** Every segment must be 1920x1080. The chapters must start at 0:00, number
   at least three, and each run at least ten seconds. Nothing is written.
3. **Captions.** Each segment's VTT is shifted by where the segment starts and merged into one SRT. Cues
   that do not advance or that overlap are refused.
4. **Thumbnail.** A settled frame of the hook (the longest still span, found with `freezedetect`),
   scaled to 1280x720.
5. **Stitch.** Concatenated without re-encoding when every segment agrees on codec, size, frame rate and
   audio; re-encoded otherwise.
6. **The kit.** `chapters.txt`, `description.txt`, `plan.md`, and with `--notebook`, `notebook.ipynb`.

`--dry-run` stops after the gates and prints the chapters. Use it to see where each chapter lands before
the slow part.

## The files

| File | What it is |
|---|---|
| `video.mp4` | the stitched video, 1920x1080 |
| `captions.srt` | upload as the video's subtitles |
| `chapters.txt` | paste into the description; `0:00` first, as YouTube requires |
| `description.txt` | title, thesis, chapters, source, and a note when examples are illustrative |
| `thumbnail.png` | 1280x720 — a starting point; a designed thumbnail will usually do better |
| `plan.md` | the audit trail: each chapter's examples, and every line with its source |
| `notebook.ipynb` | only with `--notebook` |

The description is built from `video.json` and the chapters only, so it cannot say anything the script
did not.

## The notebook

One section per chapter: its timestamp and citations, the chapter's own Python **verbatim** (with its
block id in a comment), the script behind each derived example, and a try-it cell for each exercise the
chapter cites. Exercises no chapter cites go under "More to try".

- Python only. A code block in another language, or with no language tag, is listed rather than turned
  into a cell — this tool does not run code nobody has read.
- No outputs are stored. A result is produced when someone runs the cell, so no number in the notebook
  can drift from the code that makes it.
- Every code cell is parsed with Python before the notebook is written; invalid code stops delivery.
- A derived example whose script is missing stops delivery: its numbers would have no origin.

Tell the user it exists and where. If the video's code uses a library, say which one to install — the
notebook does not install anything.

## Gate

- `video.mp4`, `captions.srt`, `chapters.txt`, `description.txt`, `thumbnail.png` and `plan.md` exist
- `plan.md` cites every line, and lists every derived example
- Chapters satisfy YouTube's rules
- With `--notebook`: `notebook.ipynb` exists and its code cells run top to bottom

## TODO

- [ ] Publish step (title, tags, upload) — deliberately not done here; uploading is the user's call
- [ ] Extract the settled-frame helper into chalk-core, where chalk's own poster step could share it
