# Credits

## HyperFrames

chalk-youtube is built on [HyperFrames](https://github.com/heygen-com/hyperframes) by HeyGen, licensed
Apache-2.0. It provides the rendering engine and the `faceless-explainer`, `hyperframes-core`,
`hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli` and
`hyperframes-audio` skills this one delegates to. They are installed as dependencies
(`npx hyperframes skills`), not vendored.

## chalk-core

The shared pipeline — ingest, the grounding gate, caption alignment, Manim — and the references in
`skills/chalk-youtube/references/core/` come from [chalk-core](../chalk-core). Its `CREDITS.md` records
the vendored `align-captions.mjs` and the fixtures.

## Fixtures

`fixtures/own-code-chapter.md` is original text written for these tests. No book is committed.
