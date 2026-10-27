# Step 2: Outline

Write `<output-dir>/outline.md`. This is where the video is decided; the rest just executes it.

## What to write

1. **Concept inventory** — each concept with the block ids that define it.
2. **Prerequisite order** — what must be understood before what. Usually not page order.
3. **The hook** — one 20–40s opening segment. For a coding topic it puts the **running example on screen
   within its first 5 seconds**, with real values, and asks the main problem's question about it ("does any
   number show up twice?"). A big number (a limit, a cost) comes only after that small case, and is tied to it
   on screen. It then says what the viewer will be able to **do** after the video, in terms of the problem
   ("write it, trace it, and give the interview answer"), not just a pattern's name. It cites the block ids of
   the thesis. It is **not** the thesis sentence read verbatim, a logo sting, a "welcome back", or a promise
   the chapter does not keep.
4. **Parts** (each one YouTube chapter) — as many as the material needs, one idea each. A main part runs about
   40–75s; one that needs longer is two ideas, so split it (the eval flags a main part over 75s; bonus parts
   may run longer, since they walk a whole arc). There is no word budget: do not cut an explanation to fit a number, and split a
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

## Scope: one problem, taught properly

A video teaches **one main problem**. Its length is spent on depth, not on more topics: about one new idea
per 30–45s of narration, and every step gives its reason (*because*, *so*, *which means*) rather than only
its conclusion. A video that covers ten topics in ten minutes states a new fact every five seconds and
teaches none of them, even when each line is accurate and short.

- Count the concepts in the outline. More than about one per 40s of target length is too many: cut, or move
  to another video.
- Related problems the source also solves (a harder follow-up, the same idea in pandas or SQL) become **their
  own videos** in the series by default, not bonus parts squeezed in at the end. Use a bonus part only when
  the user asks for one, and then give it the whole arc at the same pace.
- Background that only supports an answer (how a hash table works, memory sizes) gets the time the interview
  answer needs, not a full lesson.
- A number used early (in the hook) is **called back** in the part that explains it ("that's the five
  billion from the start"), never repeated as if new.
- A name (a pattern, a term of art) is said only **after** the viewer has seen what it names. A count ("five
  patterns") is said only if the items are shown.

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

## Orientation: the viewer never saw the book

Nothing a viewer sees or hears names the source — no "chapter", "section", "the book", author or file
name, in narration, on screen, in the title or the description. Say "here's an example", not "the
chapter's example". The outline plans the orientation instead:

- **Series and part.** From `channel.json`: the video's title is `<series name> #<n>: <part title> — <the
  main problem>`, and `video.json` carries `part_id` (the part's `id`). The hook says, in a sentence, what
  the viewer will be able to do after it and that it is part n of the series — by topic, never by book chapter.
  This comes **after** the example and the question, and takes at most two sentences (~6 s).
- **Roadmap (optional).** If the hook has a `visual: roadmap` scene, it uses the same stage list as the
  progress strip and is never narrated stage by stage. The progress strip already orients the viewer.
- **Stages.** Every scene declares `stage:` (the arc names below, plus `hook`, `recap`). The stage card
  that opens each part and the progress strip are built from them.
- **Next.** The last part names the next part of the series by its title, and leaves ~20s for YouTube's
  end screen.

## The teaching arc (coding topics)

A viewer should leave able to write the solution from a blank file. So every **main problem** walks these
stages, each a short part (40–75s) with one idea. `stage:` on a scene names one. The order that matters:
`problem` before `think`, `think` before `plan`, `plan` before `write`, `write` before `trace`, and `bug`,
`why-fast`, `other-ways`, `interview` after `trace`. `spot` (naming the pattern) may come right after `think`,
once the viewer has seen the idea work — usually the better place, since a rule with nothing to apply it to
teaches nothing:

| `stage:` | The part gives the viewer | Usually grounded in |
|---|---|---|
| `spot` | the pattern's name and the question that tells you it applies, after the idea has been shown on the running example | the mental-model / "when to use" block |
| `problem` | statement, examples, limits, what to ask before coding | the problem blocks |
| `think` | brute force on the running example, *why* it is slow (where its count comes from), then the insight and why this container and not another | brute force + idea blocks |
| `plan` | the idea as 3–4 plain-word steps, before any code (`visual: plan card`) | the idea block |
| `write` | the code built line by line (`visual: code build`, `code:`, `lines:` per entry). Each line gets **what it does and why it is there** (an early return, why a line sits outside the loop), not a paraphrase of its syntax | the code block + idea block |
| `trace` | the code run on the same example, line lit, variables updating (`visual: code + trace`, `computed-by:` a trace script) | the walkthrough table |
| `why-fast` | the complexity worked out from the code, and why the key operation is cheap | complexity blocks |
| `bug` | the mistake people make, run on an input where it fails, step by step to the moment it goes wrong | traps / pitfalls blocks |
| `other-ways` | alternatives and when each wins | alternatives / comparison table |
| `interview` | the short spoken answer and the follow-ups | interview / follow-up blocks |

Use **one running example** through the main parts (the source's walkthrough input). A new input per part
makes the viewer re-orient every minute.

**Bonus problems** (only when asked for; see Scope) come after the main arc, titled `Bonus: …`, and walk the same stages from `problem` to
`trace` (`why-fast` if the source gives it). A bonus topic is allowed only when the source has its full
solution as code. A topic the source poses but never solves in code — or only names a technique for — is
**cut** and listed under Gaps for the author. Never teach it with a hand-waved explanation, and never write
the solution from memory.

**No quizzes, fill-in-the-blank or exercise segments.** Engagement comes from the explanation: an
occasional spoken "what do you think happens next?" with a `{beat}`, then the answer. Point to the notebook
once, at the end.

The chapter's own code is shown verbatim; a derived example's script is shown the same way and is the same
file that ships as a notebook cell. Exercise blocks become the notebook's try-it cells, not video parts.

## Gate

- No line or part title names the source (book, chapter, section, author, file); the title follows the series
- A coding topic's main problem has every arc stage, in the order above; each bonus part has source code, or is cut
- One main problem; about one new concept per 40s of target length or fewer; no bonus parts unless asked for
- The hook shows the running example within 5s, and the pattern is named only after it has been shown
- Exactly one hook and one outro
- At least three chapters (YouTube's minimum), each with source block ids and an example slot
- Durations sum to the target
- Chapters satisfy YouTube's rules (at least three, each at least 10s)
- Exactly one design preset is named
