# chalk-youtube

Turn a book chapter into **one chaptered YouTube video**, 1080p, with everything you need to upload it —
captions, chapter timestamps, a description, a thumbnail — plus worked examples to compare against and,
for coding chapters, a hands-on Jupyter notebook. Every claim is traceable to the source text.

The YouTube sibling of [chalk](../chalk) (interactive lessons). Both are built on
[chalk-core](../chalk-core).

## What you get

```
youtube-output/<chapter>/
  video.mp4          the stitched video, 1920x1080
  captions.srt       upload as subtitles
  chapters.txt       paste into the description (0:00 first)
  description.txt    title, thesis, chapters, source, a note on illustrative examples
  thumbnail.png      1280x720, a settled frame of the hook
  notebook.ipynb     coding chapters only (--notebook)
  plan.md            the audit trail: every line with its source, every derived example
```

## How it works

1. **Ingest** — the chapter becomes paragraph-addressed blocks (chalk-core). Code is kept verbatim.
2. **Outline** — a hook, 4–8 chapters of one idea each, an outro, and an example for every chapter.
3. **Script** — narration and on-screen text, each line citing its source. Stops for your review.
4. **Segments** — one Hyperframes project per chapter, pinned to 1920x1080.
5. **Deliver** — gates, then the stitched video and the kit.

**Examples never invent facts.** An example is the chapter's own, or a derived one whose numbers are
computed by a script that ships in the notebook and is labelled "Example, not from the chapter", or an
honest gap shown to you for review.

## Use

```bash
/chalk-youtube path/to/chapter.md
/chalk-youtube book.epub --chapter 4 --segments 6 --notebook
```

Then, once the segments are built and `video.json` is written:

```bash
node skills/chalk-youtube/scripts/deliver.mjs youtube-output/<chapter> --notebook
```

## Setup

```bash
git clone https://github.com/OlixIgnacious/chalk-core.git ../chalk-core     # the shared core, as a sibling
git clone https://github.com/OlixIgnacious/chalk-youtube.git && cd chalk-youtube
npm install                              # links chalk-core
npx hyperframes doctor                   # environment gate
npx hyperframes skills                   # installs faceless-explainer + the hyperframes domain skills
```

Node ≥ 22, FFmpeg, Chrome, `whisper-cpp`. Kokoro TTS needs its own interpreter; see chalk-core's
[CLAUDE.md](../chalk-core/CLAUDE.md#local-setup).

## Test

```bash
npm test
```

Read [CLAUDE.md](CLAUDE.md) before changing anything under `skills/chalk-youtube/`. Licensed Apache-2.0;
see [CREDITS.md](CREDITS.md).
