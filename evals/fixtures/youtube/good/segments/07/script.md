# 07 — Bonus: the total at every position

## Scene 1 — bonus problem
visual: definition card (tier 1)
duration: ~12s
stage: problem

- spoken: "Now a bonus. {beat} You return the total at every position."
  display: "Now a bonus. You return the total at every position."
  source: [p009]

## Scene 2 — write it
visual: code build (tier 1)
duration: ~28s
stage: write
code: c002

- spoken: "Name the function, so we can call it on any list."
  display: "Name the function, so we can call it on any list."
  source: [c002]
  lines: [1]

- spoken: "Make an empty list for the answers, because we return one per position."
  display: "Make an empty list for the answers, because we return one per position."
  source: [c002]
  lines: [2]

- spoken: "Start the total at zero, since nothing is added yet."
  display: "Start the total at zero, since nothing is added yet."
  source: [c002]
  lines: [3]

- spoken: "Walk the list, so every position gets its total."
  display: "Walk the list, so every position gets its total."
  source: [c002]
  lines: [4]

- spoken: "Add the value, so the total includes it."
  display: "Add the value, so the total includes it."
  source: [c002]
  lines: [5]

- spoken: "Save the total so far, because that's the answer for this position."
  display: "Save the total so far, because that's the answer for this position."
  source: [c002]
  lines: [6]

- spoken: "Return the list, since every position now has its total."
  display: "Return the list, since every position now has its total."
  source: [c002]
  lines: [7]

## Scene 3 — trace it
visual: code + trace (tier 1)
duration: ~16s
stage: trace
code: c002
example: chapter
computed-by: examples/trace_prefix.py

- spoken: "Let's trace it on [2, 5, 1]. You get [2, 7, 8]."
  display: "Let's trace it on [2, 5, 1]. You get [2, 7, 8]."
  source: [p010]

