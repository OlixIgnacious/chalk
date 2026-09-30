# Step 2: Syllabus

Write `<output-dir>/syllabus.md`. This is where the teaching is decided; the rest of the pipeline
just executes it.

Read [pedagogy.md](pedagogy.md) first and pick the mode — expository or narrative.

## What to write

1. **Concept inventory** — each concept with the block ids that define it
2. **Prerequisite ordering** — what must be understood before what. Usually *not* page order
3. **Segment split** — 3–6 segments of 60–120s, one idea each, plus a 45–60s recap
4. **Per segment** — a learning objective ("after this, the learner can…"), the concepts covered,
   the source block ids, and a checkpoint answerable from that segment alone
5. **Design preset** — chosen once, here, for the whole series
6. **Gaps** — anything the chapter asserts without explaining. Name it; do not invent the
   explanation

## Checkpoints

**Prefer the chapter's own exercises** (`kind: "exercise"` blocks) over invented questions. They are
already grounded and already pitched at the right level.

An invented checkpoint must be answerable from the segment alone, must have exactly one defensible
answer, and must cite the block ids its answer rests on.

## The design preset

One preset for the series. Picking per segment is how a course ends up looking like six unrelated
videos.

The house look: dark, high-contrast, low-chroma, one accent, generous negative space, line-drawn
diagrams. Browse `../hyperframes-creative/frame-presets/` and pick the closest. **Not** chalk
texture or a skeuomorphic blackboard — the reference is 3Blue1Brown's restraint, not a classroom
prop.

## TODO

- [ ] Worked example of a good syllabus
- [ ] Worked example of a bad one, and why

## Gate

- Every segment has an objective, source block ids and a checkpoint
- Durations sum to the target
- Every concept traces to at least one block id
- Exactly one design preset is named
