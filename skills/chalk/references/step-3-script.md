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

## Lexicon

Maintain `<output-dir>/lexicon.json` — the pronunciation of every term the chapter uses that TTS
will get wrong. An unknown term **halts** this step until a pronunciation is set. A lesson that
mispronounces its own subject undermines everything else in it.

## Readability floor

Any line the learner must read holds about 0.3s per word, counted from when the whole line is
settled — not from when it starts animating in.

```bash
node <skill-dir>/scripts/check-readability.mjs <output-dir>/segments/*/script.md
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
