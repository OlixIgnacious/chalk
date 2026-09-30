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

## TODO

- [ ] `assets/player/player.html`, `player.css`, `player.js`
- [ ] Checkpoint card interaction and the gating logic
- [ ] Glossary popover
- [ ] Decide whether wrong answers re-play the relevant span

## Gate

- `lesson.html` opens from `file://` and plays every segment in order
- Every checkpoint gates advancement and cites a source
- Usable at phone width and by keyboard
- Still works with `localStorage` disabled
