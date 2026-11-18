# chalk-long

Turn a checked source into **one chaptered long video**, 1080p, with everything you need to publish it —
captions, chapter timestamps, a description, a thumbnail — plus worked examples to compare against and,
for coding topics, a hands-on Jupyter notebook. Every claim is traceable to the source text. The genre
(a coding lesson, an essay, news, a skit) is a pack: see [packs/](../../packs/). Formerly `chalk-youtube`;
`/chalk-youtube` still works.

The long sibling of `/chalk-short` and `/chalk` (interactive lessons). All are built on
[chalk-core](../../core).

## What you get

```
long-output/<chapter>/
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
2. **Outline** — a hook, as many chapters as the material needs (one idea each), an outro, and an example for every chapter.
3. **Script** — narration and on-screen text, each line citing its source. Stops for your review.
4. **Segments** — one Hyperframes project per chapter, pinned to 1920x1080.
5. **Deliver** — gates, then the stitched video and the kit.

**Examples never invent facts.** An example is the chapter's own, or a derived one whose numbers are
computed by a script that ships in the notebook and is recorded in `plan.md` as not from the chapter, or
an honest gap shown to you for review. The video itself carries no label.

## Use

```bash
/chalk-long path/to/chapter.md
/chalk-long book.epub --chapter 4 --segments 6 --notebook
```

Then, once the segments are built and `video.json` is written:

```bash
node skills/chalk-long/scripts/deliver.mjs long-output/<chapter> --notebook
```

## Setup

This shape lives in the chalk monorepo; install from its root (see the [root README](../../README.md#install)):

```bash
git clone https://github.com/OlixIgnacious/chalk.git && cd chalk
npm install                              # links the workspaces, chalk-core among them
npx chalk doctor                         # environment gate
npx hyperframes skills                   # installs faceless-explainer + the hyperframes domain skills
```

Node ≥ 22, FFmpeg, Chrome, `whisper-cpp`. Kokoro TTS needs its own interpreter; see chalk-core's
[CLAUDE.md](../chalk-core/CLAUDE.md#local-setup).

## CCAR-P build helpers

`tools/ccarp/` holds the book-specific scripts, visual specs and lexicons used to build the CCAR-P chapter 2–4 videos. See its [README](tools/ccarp/README.md).

## Test

```bash
npm test
```

Read [CLAUDE.md](CLAUDE.md) before changing anything under `skills/chalk-long/`. Licensed Apache-2.0;
see [CREDITS.md](CREDITS.md).
