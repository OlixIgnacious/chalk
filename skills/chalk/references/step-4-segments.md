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

## Hand off to faceless-explainer

```bash
npx hyperframes init "<output-dir>/segments/NN/video" \
  --non-interactive --example=blank --skill=faceless-explainer
```

Then write `BRIEF.md` into that project. **Read `../hyperframes/references/brief-format.md` and
`brief-contract.md` first — do not guess the schema.** Because a `BRIEF.md` exists on disk,
`faceless-explainer` skips its intent interview and runs autonomously.

Carry into the brief:

- the segment's learning objective
- the two-layer script, verbatim
- the registry visual and tier for every scene
- paths to any pre-rendered Manim clips
- format and target duration
- **the series design preset** — the same one in every segment's brief

Put the chapter text in `capture/extracted/visible-text.txt`, which that skill expects as its source
of information.

`faceless-explainer` then owns audio, storyboard enrichment, frame construction, `hyperframes check`
and render. Let it. Prefer its conventions over anything in chalk.

## Captions, engine quirks and inspection

These are shared with every skill built on chalk-core, so they live in
[core/captions-and-engine.md](core/captions-and-engine.md). **Read it before step 4 runs**: it covers
getting word timings from the VO, mapping them onto the display layer (`MISMATCH` is a red gate),
building the VTT from caption groups rather than the VO, the four `faceless-explainer` defaults that
are wrong for explanatory video, and `check` / `snapshot` instead of re-rendering.

What is specific to a lesson: every segment ends with a hold of about 1.8s on its payoff frame, the
one place a hold is allowed, and the segment's VTT is embedded in the lesson page as cues.

## TODO

- [ ] A worked `BRIEF.md` for a chalk segment
- [ ] Resume logic — detect and skip completed segments

## Gate

- Every segment has an MP4 and a VTT
- `npx hyperframes check` returns zero errors for each
- Sampled stills show no overflow, collision or low contrast
- **No composition reaches the network.** `grep -rE "https?://" index.html compositions/` returns
  nothing but SVG `xmlns` identifiers
- **Every frame's duration equals its narration**, except the last in the segment. A silence scan
  (`ffmpeg -af silencedetect=n=-45dB:d=1.0`) finds one gap per segment, not one per frame
