# Step 4: Build the segments

One Hyperframes project per segment, so a failure loses one segment rather than the chapter. Re-runs
skip segments that already have an MP4 and a VTT.

## Order of operations

Tier 2 clips first — they are the slow, failure-prone path, and there is no point rendering a
segment around a Manim scene that won't build.

```bash
node <skill-dir>/scripts/manim-render.mjs <output-dir>/segments/NN/scenes/*.py
```

See [manim.md](manim.md). If the toolchain is missing, fall back to Tier 1 and say so — do not fail
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

## Captions

`hyperframes tts` does **not** emit word timings. Get them by transcribing the generated VO, then
map them back onto the display layer:

```bash
npx hyperframes transcribe <vo.wav>                       # → word-level JSON
node <skill-dir>/scripts/align-captions.mjs \
  --tokens script-tokens.json --words vo-words.json --out captions.json
npx hyperframes transcribe <vo.wav> --to vtt              # → segment.vtt
```

Resolve every `MISMATCH` the aligner prints. A spoken interval with no caption is a red gate, not a
style choice.

**The audio is the clock.** Regenerating VO invalidates every downstream timing — treat it as a hard
reset, never a tweak.

## Inspect before rendering again

Re-rendering to look at a frame is the most common waste in this pipeline.

```bash
npx hyperframes check <project>                    # zero errors required
npx hyperframes snapshot <project> --at 2,15,45    # stills, including mid-transition
```

Check mid-transition frames too: a crossfade between two busy layouts reads as a muddy double
exposure. Stagger it, or dip through the background.

## TODO

- [ ] A worked `BRIEF.md` for a chalk segment
- [ ] Resume logic — detect and skip completed segments

## Gate

- Every segment has an MP4 and a VTT
- `npx hyperframes check` returns zero errors for each
- Sampled stills show no overflow, collision or low contrast
