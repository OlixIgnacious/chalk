# Captions, engine quirks and inspection

The mechanics shared by every skill built on chalk-core that renders through Hyperframes'
`faceless-explainer`: turning narration into aligned captions, the engine defaults that are wrong
for explanatory video, and how to check a frame without re-rendering. What to put in the brief, and
how segments are delivered, belongs to the skill using this.

## Captions

`hyperframes tts` does **not** emit word timings, but the audio step (`faceless-explainer`'s
`audio.mjs`) transcribes each take and writes word timings per frame into `audio_meta.json`. Those
words are the *transcript* — with its mishearings — so map them back onto the display layer, and write
the result back where the caption builder reads it:

```bash
# one absolute word stream for the segment: each frame's words shifted by where the frame starts
npx chalk-core build-tokens \
  <output-dir>/segments/NN/script.md <output-dir>/lexicon.json work/script-tokens.json
npx chalk-core align-captions \
  --tokens work/script-tokens.json --words work/words.json --out work/captions.json
npx chalk-core apply-display \
  --script <output-dir>/segments/NN/script.md --captions work/captions.json \
  --audio-meta <project>/audio_meta.json
```

`apply-display` is the step nothing else does: `captions.mjs` reads `audio_meta.json` voices[].words, so
without it the captions show the raw transcript ("Amine"), not the script. It keeps the transcript as
`audio_meta.transcript.json` and starts from it every run — re-run `align-captions` against *that*, not
the rewritten file. Run `captions.mjs` only after it.

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
npx chalk-core emit-vtt <project>/caption_groups.json <output-dir>/segments/NN/segment.vtt
```

**The audio is the clock.** Regenerating VO invalidates every downstream timing — treat it as a hard
reset, never a tweak.

## Engine quirks

`faceless-explainer` is tuned for promos. Four of its defaults are wrong for explanatory video, and each one
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
npx chalk-core fix-index <project>/index.html
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

## Setting up a segment project

Four things a fresh project does not give you, each of which cost a run:

- **Stage the fonts.** `build-frame` says it stages the preset's fonts into `assets/fonts/`, and does not.
  Copy the preset's `fonts/*.woff2` there and give every frame an `@font-face` for each face it names,
  or the render falls back silently.
- **Stage GSAP.** `fix-index` repoints the CDN reference at `assets/gsap.min.js` but does not create
  it. Put the same pinned version there (`npm pack gsap@<version>` and take `dist/gsap.min.js`).
- **Name frames with a letter first** (`f01-title`, not `01-title`): the id becomes a selector, and
  `querySelector("#01-…")` throws.
- **A light preset needs `fix-index --color`.** `fix-index` repaints the ground dark by default, which
  suits a dark preset. For a cream preset, pass its own canvas (`--color "#FAF9F5"`), or the ground shows
  dark through every crossfade.

Order for one segment: audio → `sync-durations` (then restore the last frame's hold) → align and
`apply-display` → frames → `captions.mjs` → `assemble-index` → `fix-index` → `transitions inject` and
`verify` → `check` → `render`. `assemble-index` and `captions.mjs` regenerate the index and the caption
rail, so run `fix-index` after every assemble.

`check` reports `clip_media_fit` on the last frame when its voice is shorter than the frame: that is the
intended end hold, not a fault. A skill's `deliver` step may clean `work/`, so keep anything you need to
re-align somewhere else, or re-derive it from `audio_meta.transcript.json`.
