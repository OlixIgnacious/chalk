# Step 3, for video: examples

Read this alongside [core/step-3-script.md](core/step-3-script.md). The rule it applies is in
[core/fidelity.md](core/fidelity.md) § Examples: the chapter's own example first, then one whose numbers
are computed, then an honest gap.

## A chapter's own example

```markdown
## Scene 3 — the worked case
visual: worked example (tier 1)
example: chapter
duration: ~25s

- spoken: "Take the list four, five, six."
  display: "Take the list 4, 5, 6."
  source: [p012]
```

Cite the block ids that print it. Nothing on screen goes beyond what they say.

## A derived example

The chapter says something true but prints no case to look at. Build a small one, and make the code the
only source of its numbers.

1. Write `segments/NN/examples/<name>.py`. Keep it short, deterministic (no unseeded randomness) and
   standard-library where possible. It `print`s every number the scene will show.
2. **Run it.** Copy the numbers from its output into the script. Never type one from memory.
3. Declare it in the script. The declaration is the record; the video itself says nothing about it:

```markdown
## Scene 4 — two lists, one mean
visual: worked example (tier 1)
example: derived
computed-by: examples/spread.py
duration: ~25s

- spoken: "Take the list four, five, six, and the list one, five, nine."
  display: "Take the list 4, 5, 6, and the list 1, 5, 9."
  source: [p004]
```

`computed-by` is relative to the segment directory. `source:` cites the chapter's **claim** the example
illustrates, not the example itself.

**The video carries no label.** No narration, caption or on-screen tag says the example is not from the
chapter. What keeps it honest is the record: `example: derived` and `computed-by:` in the script, and
`plan.md`, which lists every derived example as "not from the chapter" with the script that computed it.
That phrase belongs in the logs and nowhere a viewer reads or hears. `check-readability` fails a derived
example that names no `computed-by` script.

The numbers are narrated too, so they are in the spoken layer as words ("point six seven") and in the
display layer as notation ("0.67"). The lexicon pairs them; see [core/step-3-script.md](core/step-3-script.md).

A derived example may illustrate a claim; it may not introduce one. If the example would suggest
something the chapter does not say, change the example or make the chapter a `gap`.

## A comparison

Two cases side by side use the `split panel` visual. Each side is a chapter example or a derived one,
and a derived side is declared like any derived example. Both sides use the same axes, so the difference is the only thing
that moves.

```markdown
## Scene 5 — same mean, different spread
visual: split panel (tier 1)
example: derived
computed-by: examples/spread.py
duration: ~25s

- spoken: "Same mean on both sides. Only the spread differs."
  display: "Same mean on both sides. Only the spread differs."
  source: [p004]
```

Any scene that declares `example:` is held to the rule, whatever its visual.

## Code on screen

The chapter's own code is shown with the `code block` visual, verbatim — never retyped or "tidied".
Show its output only if you ran it. A derived example's script is shown the same way and is the same
file that ships as a notebook cell, so what the viewer saw is what they can run.

## Gaps

If an idea cannot be illustrated without inventing a fact, leave the scene out, write `gap:` in the
outline with the reason, and show it at the review stop.
