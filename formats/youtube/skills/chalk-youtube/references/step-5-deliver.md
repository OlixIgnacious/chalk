# Step 5: Deliver

```bash
node <skill-dir>/scripts/deliver.mjs <output-dir> [--notebook] [--keep-work] [--dry-run]
```

## The manifest

Write `<output-dir>/video.json` before running it:

```json
{
  "title": "Stats Patterns #2: Averages — Without Hiding the Spread",
  "thesis": "A mean is one number standing in for a whole list, and that is its danger.",
  "thesis_source": ["p004", "p011"],
  "source": "ch3.md",
  "part_id": "averages",
  "series": { "name": "Stats Patterns", "part": 2, "of": 5, "next": "Variance" },
  "notebook": { "read_only": { "c007": "it raises a TypeError on purpose" }, "setup": { "c009": "segments/11/examples/setup_table.py" } },
  "segments": [
    { "id": "01", "title": "The hook",           "mp4": "segments/01/segment.mp4", "vtt": "segments/01/segment.vtt" },
    { "id": "02", "title": "What variance adds", "mp4": "segments/02/segment.mp4", "vtt": "segments/02/segment.vtt" }
  ]
}
```

Optional: `"thumbnail": { "segment": "01", "at": 2.0 }` names the frame (seconds into that segment) for
`thumbnail.png`. Use it. The automatic pick is the longest still span, which can land mid-animation, and
every frame carries the burned-in caption pill, so choose a moment when the card is settled and the
caption is short. A thumbnail naming a missing segment, or a time outside it, stops delivery.

`title` and `thesis` go into the description, so they must be the chapter's own: the thesis is the
sentence you stated at the end of step 1. `thesis_source` cites the blocks it comes from, the way a
narrated line does. The eval fails a thesis without it (G6), and the grounding agent checks the thesis
against those blocks. A thesis can credit the wrong thing even when it reads well. dsa-05's said "two
index variables can replace extra memory", but the source credits the sorted order. The video fixed its
recap, and the description kept the old line, because nothing checked it. A segment `title` is what a viewer sees in the progress bar.
Neither names the source: `source` goes to `plan.md` only. `part_id` and `series` come from
`channel.json`; the description says "Part n of m in the <series> series. Next: …". `notebook.read_only`
lists blocks to show but not run (a block that does not compile alone is detected and shown that way
anyway); `notebook.setup` runs a segment file before a block that needs it.

## What it does, in order

1. **Grounding gate.** Runs `chalk-core check-readability` over every script. A line with no source, a
   derived example with no `computed-by`, fails here. Nothing is written.
2. **Size and chapter gates.** Every segment must be 1920x1080. The chapters must start at 0:00, number
   at least three, and each run at least ten seconds. Nothing is written.
3. **Captions.** Each segment's VTT is shifted by where the segment starts and merged into one SRT. Cues
   that do not advance or that overlap are refused.
4. **Thumbnail.** The frame the manifest names, or by default the longest still span of the hook (found
   with `freezedetect`), scaled to 1280x720.
5. **Stitch.** Concatenated without re-encoding when every segment agrees on codec, size, frame rate and
   audio; re-encoded otherwise.
6. **The kit.** `chapters.txt`, `description.txt`, `plan.md`, and with `--notebook`, `notebook.ipynb`.

Delivery removes `work/` unless you pass `--keep-work`, so anything you may need to re-align (word
streams, tokens) should live elsewhere or be re-derived from `audio_meta.transcript.json`.

`--dry-run` stops after the gates and prints the chapters. Use it to see where each chapter lands before
the slow part.

## The files

| File | What it is |
|---|---|
| `video.mp4` | the stitched video, 1920x1080 |
| `captions.srt` | upload as the video's subtitles |
| `chapters.txt` | paste into the description; `0:00` first, as YouTube requires |
| `description.txt` | title, thesis, chapters and source |
| `thumbnail.png` | 1280x720 — a frame of the video, caption pill included. A starting point; a designed thumbnail will usually do better |
| `plan.md` | the audit trail: each chapter's examples — derived ones marked as not from the chapter, with the script that computed them — and every line with its source |
| `notebook.ipynb` | only with `--notebook` |

The description is built from `video.json` and the chapters only, so it cannot say anything the script
did not.

## The notebook

It stands alone: someone who never saw the video opens it, reads the problem, and runs each solution from
the brute force up. It follows its own outline in `video.json`, not the video's parts:

```json
"notebook": {
  "title": "Valid Anagram (LeetCode 242)",
  "sections": [
    { "title": "The problem", "text": ["p024", "p025"] },
    { "title": "Solution 1: brute force", "text": ["p036"], "code": "c037", "after": ["p038"],
      "run": ["is_anagram_brute(\"rat\", \"car\")", "f(\"é\", \"e\")  # raises IndexError"] },
    { "title": "Similar problems to try", "text": ["p057", "p058"] }
  ]
}
```

Every word of explanation and every line of code is a source block, verbatim; only the section titles and
the example calls are written for it. Each `run` call is a cell of its own, so its result shows and the learner
edits the input in one place; `# raises X` catches X and prints it, so "Run all" finishes. `trim` cuts named
words from a block, and only a pointer to a part of the source the notebook leaves out (`"p050": [": see
Follow-ups"]`): a "see X" with no section X stops the build until it is added or trimmed. Delivery runs every cell
in order and stores the outputs, so the notebook reads with its results; a cell that fails stops delivery. No tracer, no asserts, no ids, no timestamps,
nothing about the video: a block that points elsewhere ("the next section", "the video") stops the build, and
eval N2 checks the rest. The chalk-notebook-reviewer agent then reads it cold, seeing only the notebook.

- Python only. A code block in another language, or with no language tag, is listed rather than turned
  into a cell — this tool does not run code nobody has read.
- Outputs are stored by running the cells at delivery, so every result shown is what the code printed.
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
