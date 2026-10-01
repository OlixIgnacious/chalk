# Step 5: Interactive lesson page

The video is half the deliverable. The other half is a page the learner works through, which is
where the checkpoints live.

## `lesson.json`

The manifest the player reads. Write it first; the page is built from it.

```json
{
  "title": "Supply and Demand",
  "source": "principles.epub#ch04",
  "segments": [
    {
      "id": "01",
      "title": "Why prices move",
      "objective": "Explain why a price is not set by the seller alone.",
      "mp4": "segments/01/segment.mp4",
      "poster": "segments/01/poster.jpg",
      "captions": "segments/01/segment.vtt",
      "duration": 95,
      "checkpoint": {
        "prompt": "A bakery raises its bread price and sells fewer loaves. What does that illustrate?",
        "options": ["Supply", "Demand responding to price", "Inflation"],
        "answer": 1,
        "explanation": "Quantity demanded falls as price rises — the chapter's first example.",
        "source": ["p041", "p042"]
      }
    }
  ],
  "glossary": [
    { "term": "equilibrium", "definition": "...", "source": ["p019"] }
  ]
}
```

```bash
node <skill-dir>/scripts/build-lesson-page.mjs <output-dir>/lesson.json
```

The script inlines `assets/player/{player.html,player.css,player.js}` and embeds the manifest as a
JSON script tag, so `lesson.html` is a single file with relative media paths. `lesson.json` on disk
is left exactly as the pipeline wrote it.

## What the page does

- Segment rail with progress, and continuous play from one segment into the next
- **A checkpoint card at each boundary** that holds until answered, then reveals the explanation
  with its source citation
- Captions toggle (on by default), replay-this-segment, playback speed
- Glossary terms clickable for a definition and its citation
- Progress in `localStorage`

## Constraints

Static page, no build step, relative paths so the folder stays portable.

- **Audio cannot autoplay.** Open on a click-to-start poster.
- **Wrap every `localStorage` read and write in try/catch.** The page must work with no persistence
  at all — private windows and blocked site data are normal.
- Captions on by default; keyboard navigable with visible focus states; honour
  `prefers-reduced-motion` in the page chrome.
- Works at phone width with no horizontal scroll.
- A Tier 2 scene is flat video inside the segment. It cannot be made interactive — don't build
  affordances that imply otherwise.

## Decisions already made

Changing these is a decision, not a tidy-up.

**Captions are embedded as cues, not linked with `<track>`.** A browser treats every `file://`
document as its own origin and blocks the text track, so a linked VTT shows nothing in the one place
this page is meant to open. `build-lesson-page.mjs` parses each segment's VTT at build time and the
player draws its own caption rail. A missing VTT is a warning, not a failure.

**`play()` is called synchronously inside the click handler.** Not after an `await`, not in a
`setTimeout`, not in a `.then()`. Chrome has *sticky* user activation — once the page has been
clicked at all, a deferred `play()` still succeeds — so Chrome will not tell you this is broken.
Safari has no such forgiveness: it requires the call in the gesture's own task and refuses it
otherwise, which presents as a player that loads the video and then does nothing. `npm run
test:player` asserts the stricter Safari rule in a second browser with the autoplay policy left
**on**, because the rest of the suite disables it and clicks via `element.click()`, and neither of
those grants activation.

**A wrong answer does not force a replay.** It reveals the correct option and the explanation with
its citation, and offers Continue. Replaying is one button away in the controls, and is the
learner's call — locking someone out of a lesson they are already struggling with teaches nothing.

**The next segment unlocks at the reveal, not at Continue.** The gate is the answer. Leaving the
rail showing "locked" while a Continue button sits beside it just looks broken.

**A re-watched segment whose checkpoint is already answered does not gate again**, so a finished
lesson plays straight through.

**The glossary is an inline expanding list, not a popover.** A popover buys nothing here and costs
positioning and focus management.

## TODO

- [ ] Decide whether a wrong answer should offer to re-play the span the answer came from, rather
      than the whole segment — this needs scene-level source spans, which step 3 does not emit yet

## Gate

- `lesson.html` opens from `file://` and plays every segment in order
- Every checkpoint gates advancement and cites a source
- Usable at phone width and by keyboard
- Still works with `localStorage` disabled

`npm run test:player` drives all four of these in a real browser and is the check to run before
shipping any player change. It skips when Chrome is absent rather than failing.

It runs **two** browsers. The first relaxes the autoplay policy, because its tests click via
`element.click()` and a synthetic click grants no user activation. The second leaves the policy on
and clicks with a dispatched input event — that one exists because the relaxation made the most
important question unaskable: *does the video actually start when a person presses the button?* A
regression moving `play()` out of the gesture handler used to pass every test and fail every real
user.
