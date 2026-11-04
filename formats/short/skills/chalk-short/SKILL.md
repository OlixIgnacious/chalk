---
name: chalk-short
description: Turn one idea from a chapter into a vertical 1080x1920 video for YouTube Shorts and Instagram Reels — 30 to 60 seconds, captions burned in, every line grounded in the source, pointing to the full walkthrough. Use when someone says "/chalk-short", "make a Short", "make a Reel", or wants a vertical clip of a video's idea.
---

# /chalk-short

`/chalk-short` makes one Short from a chapter chalk has already ingested: one idea, said in 30–60 seconds,
in portrait. It is a chalk format like `youtube` and `lesson`: the same grounding, voice, aligner, frames
and render, with its own manifest (`short.json`), deliver, eval pack (S1–S6) and pipeline.

The channel's rules still hold: the source is the truth, code is verbatim, numbers come from running code,
nothing names the book. Read the workspace `CLAUDE.md` and `channel.json` first.

## What a Short is

- **One idea.** Not a cut of a chapter: the hook and payoff of the pattern, one bug, or the interview answer.
  At most three scenes. If it needs "and", it is two Shorts.
- **The payoff first.** The first sentence is the question or the surprise ("Does any number show up twice?
  Brute force checks every pair."). The voice starts at once and the picture is up within 2 seconds.
- **30–60 seconds.** Shorts and Reels allow 3 minutes; past a minute, viewers leave. Eval S2 fails outside
  15–60 s.
- **Muted-first.** Most people watch with the sound off: the captions are burned in and large, and the
  picture carries the idea without the voice.
- **Ends on the way to more.** The last line, cited `[pipeline]`, points to the full walkthrough
  ("The full walkthrough is on the channel."). `short.json` names that video for the description.

## Where it lives

`shorts-output/<slug>/` in the workspace (one dir per Short), holding:

```
short.json            the manifest (below)
chapter.json          ingested from the same doc as the full video (chalk pipeline … --doc docs/<chapter>.md)
lexicon.json          copied from the full video's dir
segments/00/script.md the two-layer script, one part
frames/s00.py         the frame spec, portrait
```

```json
{
  "title": "Seen it before? Contains Duplicate in one pass",
  "thesis": "Brute force checks every pair; a set checks each value once.",
  "part_id": "seen-set",
  "audience": "people preparing for coding interviews who know basic Python",
  "source": "docs/chapter01-a-seen-set.md",
  "full_video": { "title": "DSA Patterns #1: The Seen-Set — Contains Duplicate (LeetCode 217)", "url": "https://youtu.be/…" },
  "notebook": { "publish_as": "01-seen-set/contains-duplicate.ipynb" },
  "hashtags": ["#Shorts", "#LeetCode", "#Python", "#CodingInterview"],
  "segments": [{ "id": "00", "title": "Seen it before?" }]
}
```

`title` is the Short's title (100 characters at most). `part_id` is the series part from `channel.json`.

**A news Short** is outside any series: leave out `part_id`, `full_video` and `notebook`, give a `label` for the
top of the screen (e.g. "TECH NEWS · OCT 28, 2026") and the `sources` it reports from
(`[{ "name": "MacRumors", "url": "…" }]`). Its source doc is a dated summary of that reporting, each fact
attributed (Apple says…, MacRumors reports…), with no claim the reporting does not make. The last line points
to the sources ("Sources are in the description."), and deliver lists them in the description.

## The script

`segments/00/script.md` uses the same two-layer form as a video part (`references/core/step-3-script.md`):
`## Scene N — <name>`, `visual:` with a tier, `example:` / `computed-by:` on worked examples, and every
spoken line with its `display:` twin and `source:` ids. Keep sentences short: about 2.3 words a second.
No pause markers: a Short has no room to breathe out loud.

## The frames

`frames/s00.py` uses `framelib` exactly as a video part does; `short.json` switches it to portrait. The
screen is 1080 wide:

- content between x=150 and x=930, and between y=320 and y=1300: use the height, don't stack everything at the
  top (the series label sits at 230; the burned-in captions at 1350-1550; below ~1536 and along the right edge
  the platform draws its own title and buttons — eval S4 fails anything drawn under y=1320);
- leave air at the sides: big words fit the 780 px column, never kiss the edges;
- type large: headlines 72–96 px, the idea in 56 px or more, code at 32 px or more;
- code: show the lines that teach with `only=[…]` (the body of a function fits; its commented signature does
  not) — the lines stay verbatim and keep their own numbers;
- arrays and steps stack vertically; one thing changes at a time.

## Running it

```bash
chalk pipeline shorts-output/<slug> --doc docs/<chapter>.md   # ingest, then stops for short.json + the script
chalk pipeline shorts-output/<slug>                             # text gates; stops for grounding and your review
chalk pipeline approve shorts-output/<slug> --scripts
chalk pipeline shorts-output/<slug>                             # voice, align; stops for frames/s00.py; frames, render, deliver, eval
```

Deliver writes `short.mp4` (1080x1920, captions burned in), `captions.srt`, `description.txt` (title, thesis,
the full video's link, the notebook's Colab link, hashtags) and `plan.md`. The same file uploads to YouTube
(Shorts are detected from the vertical shape and length) and to Instagram as a Reel.
