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

## A reveal mask that clips a slanted or glowing glyph

- **Symptom.** The last letter of a line drawn in a hand face (Caveat) is cut off: "add each value onc", "total 8"
  missing the tail of the 8.
- **In a still.** The settled still at the end of a draw-on, typed or beam reveal; seen in the chalkboard, marker
  and ink theme demos.
- **Cause.** Those reveals wipe a `clipPath: inset(…)` open to the element's box, and a slanted glyph (or a glow)
  draws past the box, so the finished mask still clips it.
- **Fix.** framelib lifts the mask (`clipPath: "none"`) the moment the reveal ends. A new reveal style must do the
  same.
- **Where it is right.** An upright face inside its box (Inter, Barlow) is not clipped either way.

## A display face much wider or smaller than its size says

- **Symptom.** In `pixel` the headline wrapped onto the values below it; in the Caveat themes every line looked a
  size too small.
- **In a still.** The theme demos (`chalk themes --demo`), against the same spec in broadside.
- **Cause.** A spec's sizes are written for Barlow and Inter; Press Start 2P is far wider and Caveat's x-height far
  smaller.
- **Fix.** `theme.json` `display_scale` (pixel 0.62, the Caveat themes 1.25) scales display text and value cells,
  so a spec reads the same in every theme. A new theme with an unusual face sets one, checked by its demo.
