# Step 4: Build the segments

One Hyperframes project per segment, so a failure loses one segment rather than the video. Re-runs
skip segments that already have an MP4 and a VTT.

The mechanics are shared and live in [core/captions-and-engine.md](core/captions-and-engine.md): word
timings from the VO, mapping them onto the display layer, building the VTT, the four
`faceless-explainer` defaults that are wrong here, and `check` / `snapshot` before re-rendering. **Read
it first.** What follows is only what differs for a YouTube video.

## Order of operations

One segment at a time; the whole sequence below takes about a minute of machine time per segment. The
reasons for each fix are in [core/captions-and-engine.md](core/captions-and-engine.md).

1. **Tier 2 first**, if any scene earns one: `npx chalk-core manim-render segments/NN/scenes/*.py
   --fps 30 --resolution 1920x1080`. See [core/manim.md](core/manim.md). Fall back to Tier 1 if the
   toolchain is missing, and say so.
2. `npx hyperframes init "<output-dir>/segments/NN/video" --non-interactive --example=blank --skill=faceless-explainer`
3. Write `BRIEF.md`, put the chapter text in `capture/extracted/visible-text.txt`, write a `tokens.json`
   with empty colours and fonts, then `node <faceless-explainer>/scripts/build-frame.mjs --preset <name> --hyperframes .`
4. **Stage what `init` and `build-frame` do not:** the preset's fonts into `assets/fonts/` and the pinned
   `gsap.min.js` into `assets/`.
5. **A script scene is a frame.** Generate `SCRIPT.md` and `STORYBOARD.md` from `script.md`, copying the
   spoken layer verbatim rather than retyping it. Name frames `f01-…`. Write one `## Line N (Frame N)` per
   scene, with all of that scene's spoken entries joined.
6. **Audio:** `audio.mjs` (voice), then `audio.mjs sync-durations`, then **restore the last frame's ~1.8s
   hold**, which `sync-durations` deletes.
7. **Captions from the display layer:** build one absolute word stream from `audio_meta.json`, then
   `build-tokens` → `align-captions` → `apply-display`. Resolve every `MISMATCH` — they are almost always a
   display line that is not the same words as its spoken line, or a transcript mishearing for the lexicon.
8. **Write the frames**, each reveal on a word's start time from `audio_meta.json`, nothing below 83% of
   the height. A derived example carries no label on screen.
9. `captions.mjs build` → `assemble-index` → `npx chalk-core fix-index index.html --color <the preset's
   canvas>` → `transitions inject` and `verify` → `npx hyperframes lint` and `check` → `snapshot`.
10. `npx hyperframes render --skill=faceless-explainer --quality high --output renders/video.mp4`, then
    `npx chalk-core emit-vtt caption_groups.json segment.vtt`, and copy the render to `segments/NN/segment.mp4`.

**Look at the stills before rendering, and read the code frame's pixels.** A transcription slip in shown
code is the same failure as a mis-read equation. Compare the rendered code to the chapter's block, not to
your memory of it.

## The brief

Read the upstream `brief-format.md` and `brief-contract.md` first; do not guess the schema. Carry in:

- the segment's idea and its source block ids
- the two-layer script, verbatim, including each scene's `example:` and `computed-by:`
- the registry visual and tier for every scene
- paths to any pre-rendered Manim clips
- **`format: landscape`, 1920x1080, 30fps** — pinned, because delivery refuses anything else
- the series design preset — the same one in every segment's brief

## What differs from a lesson

- **Segments are chapters.** A viewer scrubs by them, so each should make sense entered cold: the first
  line says what this chapter is about, in a few words.
- **Hold the payoff only at the end of a segment**, about 1.8s, where the take has genuinely ended. A hold
  inside a segment cuts the continuous VO. Frame duration equals narration everywhere else.
- **Short on-screen copy, not the script.** The caption track already shows the spoken words; a frame
  carries a hero word or a label, never a narrated sentence.
- **Text lands readable at 1080p on a phone.** Check stills at that size.

## Light presets

A cream preset keeps its own ground: pass its canvas to `fix-index --color`. The house look elsewhere in
this repo is dark, so choosing a light preset is a deliberate departure — say so in the outline.

## Layout the deliver step expects

```
<output-dir>/
  chapter.json
  video.json                      the manifest (see step-5-deliver.md)
  segments/NN/script.md
  segments/NN/segment.mp4
  segments/NN/segment.vtt
  segments/NN/examples/*.py       derived-example scripts
```

## Gate

- Every segment has an MP4 and a VTT
- `npx hyperframes check` returns zero errors for each
- Sampled stills show no overflow, collision or low contrast
- No composition reaches the network
- Every segment is 1920x1080
- Every frame's duration equals its narration, except the last in the segment
