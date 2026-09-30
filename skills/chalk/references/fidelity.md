# Fidelity

The rules that make "every claim is traceable to the source" true rather than aspirational.

A teaching tool that invents is worse than useless — the learner has no way to tell which parts to
trust, so none of it can be trusted.

## Grounding

**Every narration line and every piece of on-screen text maps to block ids in `chapter.json`.** The
`source:` field on each script line is not decoration; it is the audit trail, and it ends up in
`lesson-plan.md` where a reader can check it.

Prohibited:

- Invented numbers, dates, statistics, study results
- Invented examples presented as the chapter's
- Invented named entities — people, places, works, institutions
- Citations the chapter does not make

Allowed, and not a claim:

- Illustrative scaffolding — axis labels, generic placeholders, "Item A / Item B"
- Ordinary connective narration ("next", "but notice that")
- Restating the chapter's own point in clearer words

The line: **scaffolding must never read as a sourced fact.** An unlabelled curve illustrating shape
is fine. A curve with invented numbers on the axis is a fabrication.

## Math integrity

**Never render an equation the extractor could not read cleanly.**

PDF extraction mangles notation routinely — ligatures, lost superscripts, mis-ordered subscripts.
A model reconstructing "what it probably said" is how a stats lesson ships a wrong formula with
total confidence. That is the worst failure this tool can produce, because it is invisible to the
learner and plausible to a skim.

When `chapter.json` marks an equation `confidence: "low"` or has no `latex`:

1. Show the cropped source image (Tier 3), or
2. Ask the user for the LaTeX, or
3. Drop the scene and say why

Never option 4, which is guessing.

## Quoting

Books are copyrighted. chalk paraphrases.

- At most a short verbatim quote per segment, for the `annotated quote` visual
- Explain in our own words; do not reproduce the chapter's prose at length
- Fixtures for development are public domain — see `fixtures/`

A user feeding in their own book is their call. The tool should not make bulk reproduction the easy
path.

## Representing the chapter faithfully

**Keep its hedges.** If the chapter says "some economists argue", the lesson says so too. Upgrading
a hedged claim into a flat assertion is a distortion even when every word is sourced.

**Do not silently correct the book.** If a claim is outdated or contested, flag it to the user and
note it in `lesson-plan.md`. Do not present a correction as the chapter's view, and do not quietly
teach something the chapter did not say.

**Surface ambiguity, don't resolve it.** Where the chapter is genuinely unclear, say so in
`script.md` and raise it at the step-3 gate. Guessing produces confident, wrong teaching.

**Name the gaps.** Where the chapter asserts something without explaining it, that is a gap in the
source. Record it in the syllabus. Do not invent the missing explanation — but it is fine for the
lesson to say the chapter takes it as given.

## Sensitive domains

For medical, legal and financial content, carry the chapter's own framing and caveats, and let the
citation line do the work. Do not turn a hedged textbook statement into advice.

## The checkable version

At the step-3 gate, spot-check: pick three claims at random, open their block ids, and confirm the
source actually says that. If it doesn't, the grounding is decorative and the whole pipeline needs
re-running with tighter prompts.
