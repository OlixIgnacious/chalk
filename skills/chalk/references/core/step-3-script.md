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

- spoken: "Two lists can share a mean and still behave very differently."
  display: "Example, not from the chapter: two lists, one mean."
  source: [p004]
```

`example: chapter` needs no `computed-by`. See [fidelity.md](fidelity.md) § Examples.

## Lexicon

Maintain `<output-dir>/lexicon.json` — the pronunciation of every term the chapter uses that TTS
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
- [ ] Guidance on narration that complements the visual rather than reading it aloud

## Gate

- Every line carries `source:` ids
- Every scene names a registry visual and a tier
- `lexicon.json` has no unknown terms
- `check-readability.mjs` passes

**Then stop and show the user the syllabus and the scripts.** This is the only cheap place to fix
the teaching.
