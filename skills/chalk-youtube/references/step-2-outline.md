# Step 2: Outline

Write `<output-dir>/outline.md`. This is where the video is decided; the rest just executes it.

## What to write

1. **Concept inventory** — each concept with the block ids that define it.
2. **Prerequisite order** — what must be understood before what. Usually not page order.
3. **The hook** — one 20–40s opening segment. It opens on the viewer's problem as a question or a situation
   they recognise ("which model do you pick?"), then leads to the question the chapter answers, and shows the
   title once. It cites the block ids of the thesis. It is **not** the thesis sentence read verbatim, a logo
   sting, a "welcome back", or a promise the chapter does not keep.
4. **Chapters** — as many as the material needs, one idea each, as long as the idea needs. There is no cap on
   the number or length of chapters and no word budget: do not cut an explanation to fit a number, and split a
   chapter that runs long into two ideas. Each is a
   YouTube chapter, so its title is what a viewer reads in the progress bar: say the idea, not
   "Part 2".
5. **Per chapter** — the concepts covered, the source block ids, and the **example slot** below.
6. **The outro** — a 30–60s close that says the chapter's point in plain words and what to try next, not a
   restatement in the chapter's wording. It never claims more than the chapter does.
7. **Design preset** — chosen once, for the whole video. House look: dark, high-contrast, low-chroma,
   one accent, generous negative space, line-drawn diagrams.
8. **Gaps** — anything the chapter asserts without explaining. Name it; do not invent the explanation.

Estimate length at about **2.4 spoken words per second**, plus the pauses (`{beat}`, `{pause}`, `{think}`) the
script will carry. The earlier estimate of 2.85 ran 20% short: real narration of a list-heavy chapter came out
near 2.2. A thin script yields a thin video, not a slower one, because frames are the narration's length.

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
- At least three chapters (YouTube's minimum), each with source block ids and an example slot
- Durations sum to the target
- Chapters satisfy YouTube's rules (at least three, each at least 10s)
- Exactly one design preset is named
