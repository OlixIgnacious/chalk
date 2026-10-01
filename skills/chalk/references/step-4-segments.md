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
node <skill-dir>/scripts/build-tokens.mjs \
  <output-dir>/segments/NN/script.md <output-dir>/lexicon.json work/script-tokens.json
node <skill-dir>/scripts/align-captions.mjs \
  --tokens work/script-tokens.json --words work/transcript.json --out work/captions.json
```

Resolve every `MISMATCH` the aligner prints. A spoken interval with no caption is a red gate, not a
style choice. Two causes account for nearly all of them, and both are the lexicon's job:

- **The transcript renormalises speech back into notation.** You say "one over one point seven
  three"; it returns `1 over 1.73`. So the lexicon's `heard` field — not `spoken` — is what the
  aligner matches, and `build-tokens.mjs` pairs each display token with it.
- **A bare letter is glued to the word after it** — `Yand`, `Xare`, `Xplus`. Never respell a bare
  `x` or `y`: TTS already says them correctly and respelling only makes the glue worse. The aligner
  absorbs the glue (CREDITS.md, local fix 3), but the lexicon should not create it.

**The VTT does not come from the VO.** `transcribe --to vtt` emits cues in narration time, and a
segment's video is longer than its narration, so the cues drift by the accumulated hold. Build it
from the caption groups, which are already in video time and already carry the display layer:

```bash
node <skill-dir>/scripts/emit-vtt.mjs <project>/caption_groups.json <output-dir>/segments/NN/segment.vtt
```

**The audio is the clock.** Regenerating VO invalidates every downstream timing — treat it as a hard
reset, never a tweak.

## Engine quirks

`faceless-explainer` is tuned for promos. Four of its defaults are wrong for a lesson, and each one
shipped a real defect before it was caught.

**`sync-durations` deletes every hold.** It sets frame duration equal to voice duration. That is
right for a promo and wrong wherever on-screen text still has to be read — it put a 43-word frame at
10.16s against a 12.9s readability floor. Run it (it is the mechanical step that replaces estimates
with real durations), then restore the frame lengths you intended and say why.

**`fetch-sfx` can silently drop every voice.** It rebuilds `audio_meta.json` from the neutral
sidecar `audio_engine_meta.json`. If you hand-built only the PL-shape `audio_meta.json` — which you
will, if you are reusing a VO instead of generating one — the sidecar is empty and the rebuild wipes
the voices. Write **both** files.

**A frame id may not start with a digit.** The worker packet's `<frame_id>-` prefix convention
yields `#01-hero`, and `querySelector("#01-…")` throws, breaking every selector in the frame. Prefix
with a letter (`f01-`). Three workers hit this independently; it is upstream, not yours.

**`canvas` serves two surfaces that want opposite contrast.** `assemble-index` paints the video
ground from frame.md's `canvas` role, and `captions.mjs` uses the same role for its caption pill
*text*. Pin `canvas` dark and captions go ink-on-ink at 1:1 — invisible. Leave it light and every
crossfade shows a cream wash, because during a dissolve both frame grounds are partly transparent.
Keep the preset's light canvas and correct the assembled index afterwards:

```bash
node <skill-dir>/scripts/fix-index.mjs <project>/index.html
```

It also repoints the CDN GSAP in `index.html` and `compositions/captions.html` at a locally staged
`assets/gsap.min.js`. That is not cosmetic: without GSAP, `gsap.timeline` is undefined and every
frame's script throws, so the whole video renders static. **Run it after every `assemble-index`** —
both files are regenerated each time. It is idempotent.

Stage every face the composition names, too. `frame.md` can specify a font that is not present
(IBM Plex Mono, in `broadside`); naming a font with no file falls back silently on the render box.

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
- **No composition reaches the network.** `grep -rE "https?://" index.html compositions/` returns
  nothing but SVG `xmlns` identifiers
- **Every frame's duration equals its narration**, except the last in the segment. A silence scan
  (`ffmpeg -af silencedetect=n=-45dB:d=1.0`) finds one gap per segment, not one per frame
