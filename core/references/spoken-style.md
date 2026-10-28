# Writing for the ear

The narration is a person talking to one viewer, not a chapter read aloud. A faithful summary spoken in
one even voice passes every gate here and still sounds like a robot: the first CCAR-P video averaged 13.7
words a sentence, a third of its sentences were comma lists, three of 110 were questions, and it spoke to
"you" in 6% of them. This is how to write the `spoken` layer so it sounds like a teacher.

Grounding does not loosen. See [fidelity.md](fidelity.md): every line still cites a block, nothing is
invented, hedges stay. What changes is how the chapter's own content is said.

## The rules

**Sentences you can say in one breath, varied.** Most are short; some are longer where an idea needs room.
One idea per sentence. Mix a long one with a short one; a run of sentences the same length, long or short,
is the sound of a machine. A fragment is fine: "Not always." "Start small." But clipped sentences all the way
through sound breathless, so let an explanation run to a full sentence when it has something to say.

**Talk to the viewer.** Use "you", "your" and contractions (you're, it's, don't, let's). Ask a question the
next sentence answers, then leave a beat before the answer: "So which model do you pick? {beat} It depends
on what's failing." A question is the cheapest way to make a listener lean in.

**Never read a list or a table.** The screen carries the full list; the voice carries the *reason*. Name
two or three items, say why each matters, and move on. "There are a few more levers, but these three do
most of the work." For a table, give the takeaway in a sentence, not the cells. `check-spoken` fails a
sentence that reads out five or more items.

**Say where we are and why this comes next.** Signpost aloud: "That's the menu. Now, how do you choose?"
"Keep that in mind, because it comes back in the next part." A listener cannot see a section heading.

**Come back to the same example.** Pick the chapter's own examples and return to them ("remember the
document app from a minute ago?"). Use only what the chapter says about them. A callback is connective
narration; a new detail about the example would be an invented fact.

**Say it in plain words.** Restating the chapter's point more simply is allowed and often the best line:
"In other words: don't buy a bigger model to fix a prompt problem." Keep every hedge the chapter keeps.

**Open on the viewer's problem, close with the point in plain words.** The hook is a question or a
situation the viewer recognises, not the chapter's thesis sentence verbatim. The outro says what to take
away and what to try, not a restatement in the chapter's wording.

**Give it room.** There is **no word budget** and no cap on length or chapter count: a YouTube video is as long
as the explanation needs. A viewer who feels rushed is a viewer who is lost, so when a step matters, say it,
say why, and show it in an example before moving on. Never cut an explanation to hit a number. Pace comes from
pauses, not from drawn-out words; about 2.4 words a second is a comfortable rate.

**Say what is about to happen, every time the topic changes.** A scene change is a change of topic, and without a
signpost the new scene lands the instant the last one ends. Open every scene with a line that tells the viewer
where they are going: "Let's look at it through an example." "Now, the other way round." "Before we move on, one
more thing." "So which do you pick?" A question counts. `check-spoken` warns on a scene that opens without one,
and the narrator's `--lead` leaves a breath of silence before the scene begins.

## Pauses

Put `{beat}` (about half a second) after a question and before its answer. Put `{pause}` (about a second)
between ideas, where a speaker would breathe and the viewer needs a moment. Put `{think}` (about two and a
half seconds) after a question the viewer is meant to answer for themselves, such as a self-check. Do not
put one inside a clause.

**Answer with the reason, not a label.** After the beat, the answer is a sentence a teacher would say, not
the word on the slide. "And the price? {beat} Memory." sounds like someone reading a card aloud; "And the
price? {beat} It's memory. The set has to store every value it has seen." sounds like someone explaining.
`check-spoken` warns on a bare one- or two-word answer (yes and no are fine when the reason follows).

**Pace is per scene.** A scene over about 2.8 words a second feels rushed even when the part averages less;
the eval's E4 checks every take. The fix is a `{pause}` between ideas, not fewer reasons.
Sentence ends already get a natural, slightly varied gap; markers replace that gap, they do not add to it.

The markers live only in `SCRIPT.md` and the `spoken:` lines of `script.md`. They are stripped before
anything is transcribed, aligned or read for length, and the `display:` layer never contains them, so the
two layers still carry the same words. The silence is baked into the take, so a frame's duration still
equals its narration. See [captions-and-engine.md](captions-and-engine.md) for the narrator that renders them.

## What the gates make of this

Every conversational line still needs a `source:`. A bridge line ("Now, how do you choose?") cites the
block it leads into; a recap cites the blocks it recaps. There is no exemption, which is deliberate: if a
line has no block to point at, it is probably carrying a claim.

`npx chalk-core check-spoken segments/*/script.md` measures the result. It fails on a sentence over 40
words (too long for one breath) or one that reads out a list, and warns on a sentence over 28, an average over
16, a stretch of narration with no question, a script that never says "you", and a scene that opens without a
signpost. The limits are generous on purpose. Run it with `check-readability` before the review stop.

## Before and after

> **Reads like a document:** Batch processing gives roughly half price for asynchronous work where no user
> is waiting, like nightly classification, bulk extraction, and offline eval runs.

> **Sounds like a person:** Is anyone waiting on the answer? {beat} If not, use batch processing. It costs
> roughly half as much. Think of the jobs that run overnight, like nightly classification.

The second says the same thing in four sentences instead of one, with a question, a reason, and the
chapter's own example named but not recited.
