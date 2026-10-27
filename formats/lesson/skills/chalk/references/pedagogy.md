# Pedagogy

How to turn a chapter into a sequence of lessons. Read this before writing the syllabus.

## Pick the mode first

| Mode | For | Organising structure |
|---|---|---|
| **Expository** | Textbooks, science, economics, technical and reference writing | Concept → prerequisite → objective |
| **Narrative** | Fiction, history, biography, reportage | Arc → tension → turn → theme |

Getting this wrong is the most common way to produce lifeless output. A prerequisite graph over a
history chapter yields a list of dates nobody remembers; a narrative arc over a statistics chapter
skips the thing the reader actually needed.

Mixed chapters exist — a history of science chapter may be narrative with two expository segments
inside it. Choose per segment when the chapter genuinely mixes.

## Expository mode

**Concepts.** Extract every idea the chapter expects the reader to leave with. Each gets the block
ids that define it. If a "concept" has no defining block, it is not in the chapter.

**Prerequisite order.** Ask, of each concept: what must the learner already understand for this to
make sense? Order by that, not by page order. Chapters frequently introduce a term, use it for two
pages, and only define it properly later — good prose, bad teaching order.

**Objectives.** One per segment, phrased as what the learner can do: "explain why…", "predict
what happens when…", "distinguish X from Y". Not "understand X", which is unfalsifiable and
therefore untestable — and the checkpoint has to test it.

**One idea per segment.** If the objective needs "and", it is two segments.

## Narrative mode

**Arc.** What changes between the start and the end of the chapter? That is the spine.

**Tension.** What is at stake, uncertain or in conflict. Without it a summary is a list of events.

**Turn.** The moment the situation changes. Usually the hook for one whole segment.

**Theme.** What the chapter is *about*, as distinct from what happens in it.

Objectives still apply, but they are interpretive: "explain why the retreat mattered", "describe
what the letter reveals about her position". Checkpoints test comprehension of significance, not
recall of dates.

## Segmenting

- 3–6 segments of 60–120s, plus a 45–60s recap
- Each opens on the question it answers, not on a title card
- Each ends having actually answered it
- The recap is not a list of the segments — it is the one thing that holds them together

Length guides: under ~400 words of source is one segment; over ~10k words is more than 8 segments,
which is a course rather than a lesson, so split it into multiple lessons and say so.

## Checkpoints

**Prefer the chapter's own exercises.** A `kind: "exercise"` block is already grounded and already
pitched at the right level. Inventing a question when the author supplied one is wasted effort and
added risk.

An invented checkpoint must:

- be answerable from that segment alone, with no outside knowledge
- have exactly one defensible answer
- cite the block ids its answer rests on
- test the objective, not a detail that happened to be on screen

Distractors should be plausible — a wrong option nobody would pick tests nothing. The best
distractor is the misconception the chapter itself is trying to correct.

## Pitching the level

Infer the audience from the text's own level unless `--audience` says otherwise. Then hold it
consistently: a chapter pitched at undergraduates should not have one segment explaining
first-principles arithmetic and another assuming measure theory.

When the chapter assumes knowledge the audience won't have, say so on screen rather than silently
teaching the prerequisite — that is a different lesson.

## TODO

- [ ] Worked expository syllabus from `fixtures/gutenberg-chapter.md`
- [ ] Worked narrative syllabus
- [ ] Notes on what makes a recap segment land
