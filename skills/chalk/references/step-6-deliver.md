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

## TODO

- [ ] Settled-frame picker
- [ ] Concat without re-encoding where the segments share parameters

## Gate

- `lesson.html`, `lesson.mp4` and `lesson-plan.md` exist
- Every poster is a settled frame, not a mid-transition one
- The citation table covers every on-screen claim
