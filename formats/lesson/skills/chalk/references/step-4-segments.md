# Step 4: Build the segments

One Hyperframes project per segment, so a failure loses one segment rather than the chapter. Re-runs
skip segments that already have an MP4 and a VTT.

## Order of operations

Tier 2 clips first — they are the slow, failure-prone path, and there is no point rendering a
segment around a Manim scene that won't build.

```bash
npx chalk-core manim-render <output-dir>/segments/NN/scenes/*.py
```

See [core/manim.md](core/manim.md). If the toolchain is missing, fall back to Tier 1 and say so — do not fail
the run halfway through.

## Build each segment with the frame library

The runner does this for you (`npx chalk pipeline <output-dir>`); the commands it runs, from the output
dir, are:

```bash
npx chalk assets              # once per machine: fonts and GSAP
npx chalk voice NN            # setup, narrate with channel.json's voice, align captions to the script
npx chalk frames NN           # <output-dir>/frames/sNN.py → frames, captions, assemble, check
npx chalk render NN           # render, copy segment.mp4, emit segment.vtt
npx chalk stills NN           # contact sheet → work/stills/NN.png
```

The one thing written by hand (or by the `chalk-frames` agent, one per segment, in parallel) is the frame
spec `frames/sNN.py`: one function per scene, drawn only with the library's components (`cells`, `setbox`,
`node`, `arrow`, `table`, `code_build`, `code_trace`, `plan_card`, …), every reveal cued on a spoken word.
See the repo's `frames/README.md`. The lesson's chrome — its title, a strip of its segments, a card as each
segment opens — comes from `lesson.json`, so a spec draws only its scene. The voice comes from the
workspace's `channel.json`; there is no silent default.

This replaces handing each frame to `faceless-explainer`'s per-frame workers: the same spec rebuilds the
same frames, a fix to a component reaches every lesson and video, and the eval can read what was drawn.

## Captions, engine quirks and inspection

These are shared with every skill built on chalk-core, so they live in
[core/captions-and-engine.md](core/captions-and-engine.md). **Read it before step 4 runs**: it covers
getting word timings from the VO, mapping them onto the display layer (`MISMATCH` is a red gate),
building the VTT from caption groups rather than the VO, the four `faceless-explainer` defaults that
are wrong for explanatory video, and `check` / `snapshot` instead of re-rendering.

What is specific to a lesson: every segment ends with a hold of about 1.8s on its payoff frame, the
one place a hold is allowed, and the segment's VTT is embedded in the lesson page as cues.

## Gate

- Every segment has an MP4 and a VTT
- `npx hyperframes check` returns zero errors for each
- Sampled stills show no overflow, collision or low contrast
- **No composition reaches the network.** `grep -rE "https?://" index.html compositions/` returns
  nothing but SVG `xmlns` identifiers
- **Every frame's duration equals its narration**, except the last in the segment. A silence scan
  (`ffmpeg -af silencedetect=n=-45dB:d=1.0`) finds one gap per segment, not one per frame
