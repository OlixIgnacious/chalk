# Credits

## HyperFrames

chalk is built on [HyperFrames](https://github.com/heygen-com/hyperframes) by HeyGen, licensed
Apache-2.0. It provides the rendering engine and the `faceless-explainer`, `hyperframes-core`,
`hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli` and
`hyperframes-audio` skills that chalk delegates to. Those are installed as dependencies
(`npx hyperframes skills`), not vendored.

### Vendored file

`align-captions.mjs`, vendored from `heygen-com/hyperframes`, moved to
[chalk-core](../chalk-core) when it was split out of this repo. Its provenance, licence and the four
local fixes are recorded in that repo's `CREDITS.md`.

## Prior art

The two-layer script (`spoken` / `display`), the "audio is the clock" rule, the per-project
pronunciation lexicon and the visualization-registry pattern come from the `changelog-video` skill
in the HyperFrames repo.

## Fixtures

The public-domain Project Gutenberg fixtures moved to chalk-core with the tests that use them; see its
`CREDITS.md`.
