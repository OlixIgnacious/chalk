# Step 3: Script

Per segment, write `<output-dir>/segments/NN/script.md`.

Read [visual-registry.md](visual-registry.md) for the visual routing and [fidelity.md](fidelity.md)
for the grounding rules.

## Two-layer script

Every line has two forms, the pattern proven by the `changelog-video` skill:

- **`spoken`** — what Kokoro says. Awkward terms respelled phonetically, equations written out in
  words.
- **`display`** — correct spelling and notation, for captions and on-screen text.

They must carry the same words in the same order, or caption alignment cannot map between them.

**`display` is not a place for on-screen copy.** It differs from `spoken` only in notation: digits for
number words, case, punctuation, and the lexicon's terms. A condensed or paraphrased display line —
"Your turn" for "Now try it yourself" — is not a display form of it, and `align-captions` will print a
`MISMATCH` for every word it cannot match. Short on-screen copy (a hero word, a label) lives in the
frame itself, not in the script's display layer.

**Write `spoken` for the ear, not the page.** The spoken layer is a person talking to one viewer: short
sentences, "you", questions, plain-words restatement, and pauses. [spoken-style.md](spoken-style.md) has the
rules, and `npx chalk-core check-spoken` measures them. Pause markers `{beat}` and `{pause}` may appear in
the `spoken:` line (never in `display:`); they are stripped before words are matched, so the two layers still
carry the same words.

**A frame is a scene.** The audio step reads one narration block per storyboard frame, so each script
scene becomes one frame and one voice take. Split a scene that carries two ideas; the one-visual-per-scene
rule and the frame-per-scene mapping both want it.

## Shape

```markdown
## Scene 3 — the demand curve
visual: plot (tier 1)
duration: ~14s

- spoken: "As the price goes up, people buy less of it."
  display: "As the price goes up, people buy less of it."
  source: [p041, p042]

- spoken: "Economists draw that as a line sloping down and to the right."
  display: "Economists draw that as a line sloping down and to the right."
  source: [p043]
```

A scene that shows a worked example declares where it came from:

```markdown
## Scene 4 — two lists, one mean
visual: worked example (tier 1)
example: derived
computed-by: examples/spread.py
duration: ~20s

- spoken: "Take the list four, five, six, and the list one, five, nine."
  display: "Take the list 4, 5, 6, and the list 1, 5, 9."
  source: [p004]
```

The declaration is the record: it feeds the plan and the logs, and the video carries no label.
`example: chapter` needs no `computed-by`. See [fidelity.md](fidelity.md) § Examples.

## Teaching code

A scene that teaches how to write code uses `visual: code build`, names its block, and says which lines
each entry narrates:

```markdown
## Scene 2 — write it
visual: code build (tier 1)
code: c036
duration: ~30s

- spoken: "First, an empty set. This is what you remember."
  display: "First, an empty set. This is what you remember."
  source: [c036, p026]
  lines: [2]
```

`check-readability --chapter chapter.json` fails a code build that leaves a line of its block un-narrated.
Explain what each line does and why, from the code and the source's own explanation — see
[fidelity.md](fidelity.md) § Explaining code.

## Lexicon

Maintain `<output-dir>/lexicon.json` — a file of the shape `{ "terms": [ … ] }` (a bare array is refused),
holding the pronunciation of every term the chapter uses that TTS
will get wrong. An unknown term **halts** this step until a pronunciation is set. A script that
mispronounces its own subject undermines everything else in it.

Each term carries **three** fields, because three different things want three different forms:

```json
{ "display": "dy/dx", "spoken": "dee-wy by dee-eks", "heard": "dy by dx", "source": ["p035"] }
```

- `display` — what goes on screen. Real notation, always.
- `spoken` — what TTS must say. Builds the VO text.
- `heard` — what `hyperframes transcribe` returns for that audio, and what `align-captions` is
  matched against. Omit it when it equals `spoken`.

Add a term for a **mishearing** too, not only for notation: the transcript returned "Amine" for the
spoken "a mean", so `{ "display": "A mean", "spoken": "a mean", "heard": "Amine" }` is what lets the
aligner pair them. Read the transcript before trusting the lexicon; `heard` is a guess until you have.

`spoken` and `heard` differ for exactly the terms that needed respelling, because the transcript
renormalises speech back into notation: you say "one over one point seven three" and it returns
`1 over 1.73`. Conflating the two is what makes alignment fail.

**Never respell a bare letter.** TTS already reads a plain `x` as "eks"; respelling buys no
pronunciation, and the transcript renders a standalone letter glued to the word after it (`Xare`,
`Ydepends`, `Xplus`), which is far harder to align. Respell only what is genuinely mispronounced —
`dy` comes back as "die" without help.

## Readability floor

Any line the viewer must read holds about 0.3s per word, counted from when the whole line is
settled — not from when it starts animating in.

```bash
npx chalk-core check-readability <output-dir>/segments/*/script.md
```

## TODO

- [ ] Worked script for a Tier 1 segment
- [ ] Worked script for a segment with a Tier 2 scene
- [x] Guidance on narration that complements the visual rather than reading it aloud — see [spoken-style.md](spoken-style.md): the screen carries the list, the voice carries the reason

## Gate

- Every line carries `source:` ids
- Every scene names a registry visual and a tier
- `lexicon.json` has no unknown terms
- `check-readability.mjs` passes

**Then stop and show the user the syllabus and the scripts.** This is the only cheap place to fix
the teaching.
