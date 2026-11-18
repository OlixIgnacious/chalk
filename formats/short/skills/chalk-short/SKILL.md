---
name: chalk-short
description: Turn one idea from a checked source into a vertical 1080x1920 video for Shorts, Reels and TikTok — 30 to 60 seconds, captions burned in, every line grounded in the source. Any genre the channel makes: a coding idea, a motivational line, a news item, a skit. Use when someone says "/chalk-short", "make a Short", "make a Reel", or wants a vertical clip of a video's idea.
---

# /chalk-short

`/chalk-short` makes one Short from a chapter chalk has already ingested: one idea, said in 30–60 seconds,
in portrait. It is a chalk shape like `long` and `lesson`: the same grounding, source check, voice, aligner,
frames and render, with its own manifest (`short.json`), deliver, criteria (S1–S6) and pipeline.

The channel's rules still hold: the source is the truth and has been fact-checked, code is verbatim, numbers
come from running code, nothing names the book. Read the workspace `CLAUDE.md` and `channel.json` first.

**The genre is a pack.** `short.json` `pack` (or `channel.json` `pack`, e.g. `{ "short": "news" }`) names it:
`essay` (a motivational or focus line), `news` (a dated, attributed news item), `skit` (two voices on the
stage), or none for a coding Short, which follows this file alone. `npx chalk pack <out>` prints it and the
directory of its references: read that pack's `rules.md` before writing `short.json`, and its
`step-3-script.md` before the script. The eval scores the pack's criteria with S1–S6.

## What a Short is

- **One idea.** Not a cut of a chapter: the hook and payoff of the pattern, one bug, or the interview answer.
  At most three scenes. If it needs "and", it is two Shorts.
- **The hook is the first line** (eval S7): at most 12 words, its first sentence over by 3 s, and never a
  weak opener ("so", "today", "in this video", "have you ever", "this is", a greeting). Give each Short of a
  week a different opening shape: a question, a number from the example, a claim, a contradiction.
- **The payoff first.** The first sentence is the question or the surprise ("Does any number show up twice?
  Brute force checks every pair."). The voice starts at once and the picture is up within 2 seconds.
- **30–60 seconds.** Shorts and Reels allow 3 minutes; past a minute, viewers leave. Eval S2 fails outside
  15–60 s.
- **Muted-first.** Most people watch with the sound off: the captions are burned in and large, and the
  picture carries the idea without the voice.
- **Ends on the way to more.** The last line, cited `[pipeline]`, points to the full walkthrough
  ("The full walkthrough is on the channel."). `short.json` names that video for the description.

## From a long video

Start from `npx chalk shorts-plan <long-out>`: every part of 15–57 s whose first line already passes the hook
check can be recut with its narration unchanged (`npx chalk recut <long-out> NN`, which writes `short.json` with
`recut` and adopts the narration). The rest are listed with what to rewrite from; write those as new Shorts here,
each with a different opening shape, so a week of them does not read as one template.

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

- content in the box every platform leaves clear (`frames/safe.json`, from HyperFrames' TikTok, Reels and Shorts
  safe areas): **y 288–1248; x 120–888 above y=840, x 120–780 below it**, where TikTok's buttons run down the
  right. Use the height, don't stack everything at the top. The series label sits at 230 and the burned-in
  captions at 1350–1550, outside the box by design. Eval S4 fails anything drawn outside it, on any edge;
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
