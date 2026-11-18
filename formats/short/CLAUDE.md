# chalk-short — working rules

`/chalk-short` makes one idea from a checked source into a vertical 1080×1920 video, 15–60 s, captions burned in.
It is the short **shape**: one part, portrait, its own manifest (`short.json`), deliver and criteria (S1–S7). The
genre (a coding idea, an essay's line, a news item, a skit) is a pack under `packs/`, named by `short.json` or
`channel.json` `pack`; a Short with none follows the shape's rules alone.

Read the root `CLAUDE.md` first. What is specific to this shape:

- **One idea, at most three scenes** (S1), **15–60 s** with any end hold counted (S2), **the voice within 0.8 s and
  a picture within 2 s** (S3), **the first line a hook** (S7: 12 words at most, over by 3 s, no weak opener).
- **The safe box is measured, not guessed**: `frames/safe.json` holds every platform's clear bands (from
  HyperFrames' TikTok, Reels and Shorts safe areas) and their intersection, which framelib and S4 both read.
  Change the numbers there, once.
- **It points somewhere** (S6): a `[pipeline]` line to the full video or the sources, or, for a recut, the pointer
  drawn in the last frame's hold.
- **Deliver masters loudness like every shape** (`core/scripts/loudness.mjs`, −14 LUFS, −1 dBTP) and writes the
  neutral `kit.json`; a platform's rules are `publish/`'s, never this shape's.
- **A recut** (`chalk recut <long-out> NN`) keeps the long part's narration unchanged: the takes are copied and
  adopted, never voiced again. `chalk shorts-plan` says which parts fit and which need a new script.

## Testing

`test/smoke.mjs` (`npm test` in this workspace): deliver, the portrait captions, S4 against the safe box, S7.
The genre packs' fixtures run in `test/evals.mjs` at the repo root.
