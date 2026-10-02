# Step 4: Build the segments

One Hyperframes project per segment, so a failure loses one segment rather than the video. Re-runs
skip segments that already have an MP4 and a VTT.

The mechanics are shared and live in [core/captions-and-engine.md](core/captions-and-engine.md): word
timings from the VO, mapping them onto the display layer, building the VTT, the four
`faceless-explainer` defaults that are wrong here, and `check` / `snapshot` before re-rendering. **Read
it first.** What follows is only what differs for a YouTube video.

## Order of operations

1. Tier 2 Manim clips first, if any scene earns one: `npx chalk-core manim-render segments/NN/scenes/*.py
   --fps 30 --resolution 1920x1080`. See [core/manim.md](core/manim.md). If the toolchain is missing,
   fall back to Tier 1 and say so.
2. `npx hyperframes init "<output-dir>/segments/NN/video" --non-interactive --example=blank --skill=faceless-explainer`
3. Write `BRIEF.md` into that project (below).
4. Put the chapter text in `capture/extracted/visible-text.txt`.
5. Let `faceless-explainer` own audio, storyboard, frames, `check` and render.
6. Emit the VTT: `npx chalk-core emit-vtt <project>/caption_groups.json <output-dir>/segments/NN/segment.vtt`.

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
- **A derived example stays tagged on screen** for its whole scene.
- **Text lands readable at 1080p on a phone.** Check stills at that size.

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
