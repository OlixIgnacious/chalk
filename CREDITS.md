# Credits

## HyperFrames

chalk is built on [HyperFrames](https://github.com/heygen-com/hyperframes) by HeyGen, licensed
Apache-2.0. It provides the rendering engine and the `faceless-explainer`, `hyperframes-core`,
`hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli` and
`hyperframes-audio` skills that chalk delegates to. Those are installed as dependencies
(`npx hyperframes skills`), not vendored.

### Vendored file

`skills/chalk/scripts/align-captions.mjs` is vendored from
`heygen-com/hyperframes` at `.claude/skills/changelog-video/scripts/align-captions.mjs`.

It lives in that repo's **repo-native** skills tree, which its README states is not
marketplace-distributed, so it cannot be installed as a dependency.

- Upstream: https://github.com/heygen-com/hyperframes/blob/main/.claude/skills/changelog-video/scripts/align-captions.mjs
- Licence: Apache-2.0
- Vendored: 2026-09-30
- Local changes: two crash/correctness guards, 2026-09-30 — see below

Keep the file's header comment intact. If it is modified, record what changed and why here.

**Local changes (2026-09-30).** Both are marked `LOCAL FIX` in the file. Neither changes the
alignment algorithm or the output shape, and both should go upstream.

1. The line-end pass read `outLines[i + 1].w[0][1]` without checking that the next line had any
   words, so a line with an empty `tokens[]` threw a `TypeError` with no message. It now scans
   forward to the next line that has a word, falling back to the tail past the last spoken word.
2. The same pass read `stream.at(-1).end` unguarded. A transcript whose final word carries no `end`
   made the arithmetic `NaN`, which `JSON.stringify` wrote out as `null` — so the caption rail
   silently had no end time. It now falls back to that word's `start`, then to 0.

## Prior art

The two-layer script (`spoken` / `display`), the "audio is the clock" rule, the per-project
pronunciation lexicon and the visualization-registry pattern come from the `changelog-video` skill
in the HyperFrames repo.

## Fixtures

`fixtures/` contains public-domain text from [Project Gutenberg](https://www.gutenberg.org/).
