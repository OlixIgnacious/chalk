# Step 2: Outline

Write `<output-dir>/outline.md`. This is where the video is decided; the rest just executes it.

## What to write

1. **Concept inventory** — each concept with the block ids that define it.
2. **Prerequisite order** — what must be understood before what. Usually not page order.
3. **The hook** — one 20–40s opening segment. It states the question the chapter answers, in the
   chapter's own terms, and shows the title once. It cites the block ids of the thesis. It is **not**
   a logo sting, a "welcome back", or a promise the chapter does not keep.
4. **Chapters** — 4–8 segments of 60–150s, one idea each, about 8–15 minutes in all. Each is a
   YouTube chapter, so its title is what a viewer reads in the progress bar: say the idea, not
   "Part 2".
5. **Per chapter** — the concepts covered, the source block ids, and the **example slot** below.
6. **The outro** — a 30–60s close that restates the chapter's point in the chapter's words and says
   what to try next. It never claims more than the chapter does.
7. **Design preset** — chosen once, for the whole video. House look: dark, high-contrast, low-chroma,
   one accent, generous negative space, line-drawn diagrams.
8. **Gaps** — anything the chapter asserts without explaining. Name it; do not invent the explanation.

Estimate length at about **2.85 spoken words per second**. A thin script yields a thin video, not a
slower one, because frames are the narration's length.

Chapters are also what YouTube shows, and YouTube has rules: the first starts at 0:00, there are at
least three, and each runs at least ten seconds. The hook counts as a chapter.

## The example slot

Every chapter says how it will be made concrete, one of:

| Slot | Meaning | Needs |
|---|---|---|
| `chapter` | the chapter prints an example that fits | its block ids |
| `derived` | the chapter makes a claim but prints no good example, so one is built | the claim's block ids, and the script that will compute it |
| `gap` | the claim cannot be illustrated without inventing a fact | a sentence saying why |

Prefer `chapter`. Use `derived` only to illustrate a claim the chapter already makes. A `gap` is
shown to the user at the step-3 stop; it is not filled in quietly.

Where a comparison would teach more than one case — before and after, right and wrong, small and large
sample — name both cases in the slot. Each is held to the same rule.

## Coding chapters

If `has_code` is true, say in the outline which chapters carry code, and plan a **code block** scene for
the chapter's own code (shown verbatim) and, where useful, a derived example whose script is also a
notebook cell. Exercise blocks become the notebook's try-it cells, so note which chapter cites each.

## Gate

- Exactly one hook and one outro
- 4–8 chapters, each with source block ids and an example slot
- Durations sum to the target
- Chapters satisfy YouTube's rules (at least three, each at least 10s)
- Exactly one design preset is named
