# The essay pack

For focus, motivational and reflective pieces, long or short. An essay says **one thing**, gives the viewer
room to feel it, and comes back at the end to where it began. Its claims are few, but its quotations, names
and dates are exactly where motivational writing goes wrong, so they are checked like any other source
(the source check, G7 and G8) and always said with whose words they are.

Criteria: Y1–Y5 ([eval/criteria.mjs](../eval/criteria.mjs)). Waived: E2 (an essay has no running example).

## Laws

**One thesis.** The manifest's `thesis` is one sentence of at most 25 words, cited by `thesis_source`. Every
part serves it; a part that argues something else is another essay.

**An opening image, a turn, an ending that echoes.** Open on something the viewer can see (a desk at dawn,
a hand on a door), turn on the idea, and end by coming back to that image, changed. The last scene shares a
word with the first (Y4).

**Few words, room around them.** Sentences average 14 words or fewer, none over 24 (Y3). Use `{pause}` and
`{beat}` generously: the holds are part of the piece. One line of type at a time.

**Every quotation is attributed, and checked.** Say whose words they are in the same line: "Franklin wrote: …",
"… — Marcus Aurelius" (Y2). A quotation reaches the screen only when `facts.md` marks its block supported:
the primary text, or two independent sources that agree on the words and the person (G8). A misattributed
quote is the commonest fabrication in this genre; if it cannot be supported, drop it or drop the name
("as the saying goes"), at the scripts gate.

**No code.** An essay that needs code on screen is a coding lesson (Y5).

**Naming the source is fine.** Unlike a coding lesson, an essay may name the book, the speech or the letter
it quotes; that is the attribution.

**Music.** A focus piece's music is mixed after the render, in the focus-music project's own step, for now.
The narration is still the clock. A beat grid from the track (`audio_meta.json`) is a later item.
