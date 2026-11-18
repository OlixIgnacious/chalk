# Step 3, for video: examples

Read this alongside [core/step-3-script.md](../../../core/references/step-3-script.md). The rule it applies is in
[core/fidelity.md](../../../core/references/fidelity.md) § Examples: the chapter's own example first, then one whose numbers
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

## Come back to the same example

A person teaching returns to one example instead of introducing a new one each time. If the chapter gives
two or three (the document-analysis app, the Acme billing assistant), use them as the thread and call back:
"remember the document app from a minute ago?" A callback is connective narration. Use only what the chapter
says about the example; a new detail about it (what its users ask, how big it is) would be an invented fact.
Cite the block that gave the example, plus the block the callback lands on.

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
display layer as notation ("0.67"). The lexicon pairs them; see [core/step-3-script.md](../../../core/references/step-3-script.md).

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

## A trace of the code

The `trace` stage shows the source's code running on the running example: the line that executes, and the
variables as they change. Those steps come from running the code, never from typing them.

`segments/NN/examples/trace_<function>.py`:

1. contains the source's function **verbatim** (copy the code block; do not tidy it);
2. runs it on the running example under `sys.settrace`, recording `{"line": <1-based line in the block>,
   "locals": {...}}` at each `line` and `return` event of that function. JSON has no sets, so write a set
   local as `{"set": sorted(v)}`: the frame library then shows it as Python prints it (`set()` when empty,
   never `{}`, which is an empty dict);
3. **asserts** the result against the source's walkthrough table when there is one (e.g. the set before
   each check), so a trace that disagrees with the source fails loudly;
4. prints `{"result": ..., "steps": [...]}` as JSON. The frame builder reads it; `computed-by:` names it.

```markdown
## Scene 1 — trace it
visual: code + trace (tier 1)
stage: trace
code: c036
example: chapter
computed-by: examples/trace_contains_duplicate.py
duration: ~30s
```

Narrate the steps that teach (the first add, the moment the check hits), not every line event.

**Every branch, every clause.** Leaving out line events is fine. Leaving out a *choice* is not.
- If a part says what one branch of an `if/elif/else` does, it says what every branch does. If the sum is
  too small, the left pointer moves; say what happens when it is too big as well, even if the example
  never goes there.
- In a walk where each step chooses, every step you name says its choice. Write "nine is bigger than
  eight, so the second pointer moves", not "nine meets eight".
- A narrated condition with `or` or `and` says each side. For `if not result or result[-1] != v`, the
  empty-list case is a reason too.

If a branch is left out on purpose (it is the practice problem, or the source never explains it), add
`skips: <block> — <why>` to the scene. The eval (T10) fails a part that says one branch and drops its
sibling, or reads an `or` without saying "or". It runs in the text gates, before anything is voiced.

## Gaps

If an idea cannot be illustrated without inventing a fact, leave the scene out, write `gap:` in the
outline with the reason, and show it at the review stop.
