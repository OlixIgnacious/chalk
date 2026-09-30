# Step 6: Deliver

## Posters

Per segment, pick the strongest **settled** frame — text fully in, not mid-transition — and bake it
as frame 0 of the MP4 so every platform's idle thumbnail shows it.

Replace frame 0 rather than prepending one, so duration and audio sync are unchanged.

A poster taken from an arbitrary timestamp is how a good lesson ends up with a thumbnail of
half-faded text.

## Concatenate

`lesson.mp4` — every segment in order, for people who just want to watch it through. Checkpoints do
not appear here; they only exist in the page.

## `lesson-plan.md`

The written companion, and the audit trail for the grounding claim:

- The syllabus: segments, objectives, concepts
- A **source-citation table** — every claim made on screen, with the block ids it came from
- Gaps flagged in step 2: what the chapter asserts without explaining
- Anything ambiguous, outdated or contested that was surfaced rather than resolved

This is what makes "every claim is traceable" checkable rather than a marketing line.

## Final output

```
chalk-output/<chapter-slug>/
  lesson.html
  lesson.mp4
  lesson.json
  lesson-plan.md
  chapter.json
  syllabus.md
  segments/NN/{segment.mp4,segment.vtt,poster.jpg,script.md}
```

Clean `work/` on success.

## Tell the user

Where the files are, the teaching angle in one line, and an offer to re-roll a single segment or
adjust the level. Re-rolling one segment is cheap; re-rendering the chapter is not.

## Running it

```bash
node <skill-dir>/scripts/deliver.mjs <output-dir> [--no-bake] [--keep-work] [--dry-run]
```

The settled-frame picker uses ffmpeg's `freezedetect`: a settled caption or diagram is by definition
frozen, so it takes the frame from inside the longest still span, skipping the opening 15% where a
scene is usually still animating in.

**Baking normalises timestamps first (`setpts=PTS-STARTPTS`) and encodes with
`-fps_mode passthrough`.** Both are load-bearing. A segment that came out of a concat starts at a
non-zero pts; against that offset `-r` duplicates a frame at the head and `enable` gates the wrong
one, so the poster gets *prepended* and every frame of the lesson shifts one later. The script
compares frame counts before and after and keeps the original if the count moved — a duration check
alone does not catch this, because one extra frame barely moves the duration.

An unsourced line makes the step exit 1: `lesson-plan.md` is the audit trail, so it cannot be
written over a script that does not carry its citations.

## TODO

- [x] Settled-frame picker
- [x] Concat without re-encoding where the segments share parameters
- [ ] `flagged.md` is read if present but nothing writes it yet — step 2 should

## Gate

- `lesson.html`, `lesson.mp4` and `lesson-plan.md` exist
- Every poster is a settled frame, not a mid-transition one
- The citation table covers every on-screen claim
