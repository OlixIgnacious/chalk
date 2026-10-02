# Edge cases (lessons)

The shared cases — ingestion, fidelity, audio and timing, render and infrastructure — live in
[core/edge-cases.md](core/edge-cases.md). Consult both whenever the input isn't a clean, English,
expository, text-layer chapter.

Each row is a decision, not a warning.

## Player

| Case | Handling |
|---|---|
| **Autoplay blocked** | Audio cannot autoplay. Open on a click-to-start poster |
| **Tier 2 scenes aren't interactive** | Manim output is flat video. Don't build affordances that promise interaction it can't deliver |
| **Accessibility** | Captions on by default, keyboard navigation, visible focus, honour `prefers-reduced-motion` in the page chrome |
| **`localStorage` unavailable** | Wrap every read and write in try/catch. The page must work with no persistence |
| **Sharing** | `file://` works locally and relative paths keep the folder portable. Publishing is a separate, offered step |

## Adding a row

When something new breaks, add the row with the decision that resolved it. A row that is about the
lesson player belongs here; anything every skill would hit belongs in chalk-core.
