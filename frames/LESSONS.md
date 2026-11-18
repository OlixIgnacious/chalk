# On-screen defects seen in real builds

One entry per defect class: the symptom, how it showed in a still, the cause, the fix, and where the same look
is right. **No agent writes this file.** The frames reviewer reports a defect in `frames-review.md`; the
resolver turns a defect class into a `## Pipeline` item in `resolution.md`; `pipeline-debt` then holds the next
build's frames until the item is landed here (with the commit) or deferred. The chalk-frames agent reads this
after `COMPONENTS.md`.

## A table cell that runs out of its row

- **Symptom.** A wrapped cell's second line drawn over the next row; a one-line cell running into the next
  column.
- **In a still.** Two lines of text on top of each other in a trace table, the lower row unreadable.
- **Cause.** `row_h` sized for one line while a cell wrapped; a long value in a narrow column.
- **Fix.** `F.table` now measures wrapped cells and fails the build when a cell needs more lines than `row_h`
  holds, and a one-line cell that would cross its column fails unless the column is in `wrap=`. Give the row
  room, widen the column, or shorten the cell.
- **Where it is right.** A table whose cells are all short values never needs `wrap=`.

## A reveal cued under the stage card

- **Symptom.** The first part of a scene's frame appears all at once as the stage card lifts, instead of on
  its words.
- **In a still.** The entry still at the first cue shows the card; the settled still shows everything.
- **Cause.** Reveals cued on words spoken while the stage card covers the frame.
- **Fix.** `write()` clamps reveals under the card to start as it lifts, and cues.json records the clamped
  time. Cue the frame's first reveal on a phrase after the card's hold, or accept the clamp.
- **Where it is right.** The hook has no stage card: it opens on its example.

## A result placed where a Short's platform draws its buttons

- **Symptom.** In a Short, a result or an attribution sits low or right, under the platform's caption, title
  or buttons.
- **In a still.** Text below y≈1248, above y≈288, right of x≈888 (or of x≈780 below y=840) on a 1080×1920
  frame; HyperFrames' check warns `outside_safe_zone` for TikTok, Reels or Shorts.
- **Cause.** A layout drawn for landscape and stacked without moving it into the safe box.
- **Fix.** Keep content in the Short's safe box (`frames/safe.json` `content`, which S4 checks); stack what sat
  side by side; shorten a line rather than shrink its type.
- **Where it is right.** The burned-in captions sit at 1350 by design; they are the only thing that low.
