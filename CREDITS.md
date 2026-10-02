# Credits

## HyperFrames

chalk-core, and the chalk skills on top of it, are built on [HyperFrames](https://github.com/heygen-com/hyperframes) by HeyGen, licensed
Apache-2.0. It provides the rendering engine and the `faceless-explainer`, `hyperframes-core`,
`hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli` and
`hyperframes-audio` skills that chalk delegates to. Those are installed as dependencies
(`npx hyperframes skills`), not vendored.

### Vendored file

`scripts/align-captions.mjs` is vendored (moved here from the chalk repo when core was split out) from
`heygen-com/hyperframes` at `.claude/skills/changelog-video/scripts/align-captions.mjs`.

It lives in that repo's **repo-native** skills tree, which its README states is not
marketplace-distributed, so it cannot be installed as a dependency.

- Upstream: https://github.com/heygen-com/hyperframes/blob/main/.claude/skills/changelog-video/scripts/align-captions.mjs
- Licence: Apache-2.0
- Vendored: 2026-09-30
- Local changes: two crash/correctness guards + two alignment fixes, 2026-09-30 — see below

Keep the file's header comment intact. If it is modified, record what changed and why here.

**Local changes (2026-09-30).** All four are marked `LOCAL FIX` in the file, and all four should
go upstream. The first two change neither the alignment algorithm nor the output shape; the last two
change matching behaviour, and are described in full below.

1. The line-end pass read `outLines[i + 1].w[0][1]` without checking that the next line had any
   words, so a line with an empty `tokens[]` threw a `TypeError` with no message. It now scans
   forward to the next line that has a word, falling back to the tail past the last spoken word.
2. The same pass read `stream.at(-1).end` unguarded. A transcript whose final word carries no `end`
   made the arithmetic `NaN`, which `JSON.stringify` wrote out as `null` — so the caption rail
   silently had no end time. It now falls back to that word's `start`, then to 0.
3. **The stream cursor now carries a character offset, so one spoken word can serve several display
   tokens.** `hyperframes transcribe` renders a standalone single letter as `X`/`Y` and glues it to
   the word after it — `Yand`, `Xare`, `Xplus`, `Ydepends`, `Xsquared`. Previously the first display
   token matched that whole glued word by prefix and consumed it, so every token after it in the
   line desynchronised and reported `MISMATCH`. The cursor is now `(word index, character offset)`:
   a token takes only the characters it needs, and the remainder stays available to the next token.
   Tokens sharing one spoken word share its start time, which is correct — the word was said once,
   at one time.

   This matters more for chalk than it did upstream. A changelog script rarely contains a bare `x`;
   a maths chapter is almost entirely single-letter variables, so the glued case is the common one
   rather than an edge case. Pinned by `align-captions: one glued spoken word can cover several
   display tokens` in `test/smoke.mjs` in this repo.

4. **A number word and its digit now normalise alike.** The same transcript returns `one` in one
   sentence and `1` in the next, so `norm()` maps zero–twelve (and `nought`) to their digit,
   whole-token only — it must not rewrite the digits inside `1.73`. Pinned by `align-captions: a
   number word and its digit are the same word`.

## Prior art

The two-layer script (`spoken` / `display`), the "audio is the clock" rule, the per-project
pronunciation lexicon and the visualization-registry pattern come from the `changelog-video` skill
in the HyperFrames repo.

## Fixtures

`fixtures/` contains public-domain text from [Project Gutenberg](https://www.gutenberg.org/):
Faraday's *The Chemical History of a Candle* (1861) and Thompson's *Calculus Made Easy* (1910).

The binary fixtures are built from those same two texts, so nothing under copyright is committed:

- `gutenberg-two-chapters.epub` — a minimal EPUB 3 (nav, two spine items, one footnote aside)
- `gutenberg-chapters.pdf` — printed from HTML via headless Chrome, with running heads and page
  numbers, so the furniture-stripping and equation-detection paths have something real to chew on
- `gutenberg-scanned.pdf` — the same text rendered to an image and printed, so it has no text layer
  at all and exercises the OCR path
