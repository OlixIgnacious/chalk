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

## Safe areas

`frames/safe.json`'s per-platform clear bands are HyperFrames' (`core/dist/safeAreas.js`, Apache-2.0), scaled to
1080×1920.

## Fonts

Barlow, Inter, IBM Plex Mono, Caveat, VT323 and Press Start 2P, all SIL Open Font License 1.1, staged from
Fontsource by `chalk assets`; none is vendored.

