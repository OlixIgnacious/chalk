# Visual Registry

The routing table for "show the mechanism". Every scene picks a row. If nothing here fits, the
problem is usually that the scene is trying to carry two ideas.

**Never bullet-list the prose.** A list of the same words the narrator is saying teaches nothing
that audio alone wouldn't. That is the failure this tool exists to prevent.

## Tier routing

| Tier | What it is | When |
|---|---|---|
| **1** | HTML/SVG + KaTeX, native Hyperframes | The default. Everything below marked tier 1 |
| **2** | Manim, rendered offline and composited as `<video>` | Only the four rows marked tier 2 |
| **3** | The book's own figure, extracted | When the source diagram is already the clearest thing available |

**The Tier 1 / Tier 2 line for equations:** if the equation only needs to be *displayed and
annotated*, that is Tier 1 with KaTeX. If it needs to visibly *become* another equation, that is
Manim.

A Tier 2 scene is flat video — not interactive, not restylable without re-rendering, and it drags in
a LaTeX toolchain. It is earned by a scene, never chosen by default. See [manim.md](manim.md).

## The registry

| Explaining… | Visual | Tier | Anatomy | Choreography |
|---|---|---|---|---|
| A definition | definition card | 1 | term in display type, definition beneath, hairline rule | term lands first; each clause of the definition underlines on its spoken word |
| A process | staged flow | 1 | 3–5 nodes, directional connectors | nodes appear in order; a connector draws only after its source node has settled |
| A comparison | split panel | 1 | two columns, shared axis or label row | both sides build, then the differing property highlights on both at once |
| A part–whole structure | decomposition | 1 | whole shape, then labelled parts | whole splits outward into parts; parts re-assemble on the recap line |
| A causal chain | linked arrows | 1 | boxes joined left to right | each link draws on its clause; the final effect gets a held beat |
| A quantity or trend | plot / number line | 1 | axis, gridline, one series | axis first, then the value travels along it; the label lands settled, never mid-motion |
| A hierarchy or taxonomy | tree | 1 | root, tiers, thin connectors | root, then tiers cascade with ≤0.15s stagger |
| A cycle | loop diagram | 1 | 3–5 nodes on a ring | one full traversal, then the loop closes and pulses once |
| A sequence in time | timeline | 1 | horizontal axis, ticks, event labels | axis sweeps out; each event lands on its spoken mention |
| A key passage | annotated quote | 1 | short verbatim quote, generous margin | quote settles, then the operative phrase highlights |
| An analogy | side-by-side | 1 | familiar thing left, target right | familiar first, target second; matching parts tinted alike |
| A stated formula | KaTeX card | 1 | centred equation, annotation gutter | terms fade in; each is annotated as it is named |
| A count or magnitude | stat hit | 1 | one large tabular-nums figure | counts up on its spoken word, then holds |
| A concept shown in use | worked example | 1 | one concrete case laid out in steps, inputs left, result right | each step lands on its spoken clause; the result is the held frame. A derived case is declared `example: derived` in the script and logged as not from the chapter; the video carries no label. See [fidelity.md](fidelity.md) § Examples |
| A concrete physical set-up | labelled figure | 1 | line-drawn figure, hairline leader lines to short labels | the figure draws in the order the prose introduces its parts; each label lands as its part is named, and the part under discussion takes the accent |
| Code | code block | 1 | editor or terminal chrome | types in, then the relevant span highlights. Native Hyperframes — no new work |
| **A derivation or rearrangement** | **equation transform** | **2** | before and after the same equation | terms **migrate** to their new positions; nothing teleports, nothing cross-fades |
| **A geometric argument** | **construction** | **2** | the figure, built | draw in proof order; the claim being proved is the last stroke |
| **A limit, convergence or field** | **parametric sweep** | **2** | the object plus a visible parameter | the parameter drives continuously; hold at the limit |
| **A distribution under a parameter** | **morphing density** | **2** | curve, axis, shaded region | the curve deforms; the area or moment is annotated live |

## Choosing well

**One visual per scene.** If a scene needs two, it is two scenes.

**The motion should be the argument.** A demand curve that slopes down teaches more if it is *drawn*
downward as the narrator says "as price rises, quantity falls" than if it fades in complete. Ask
what the idea *does*, and make the visual do that.

**Prefer the book's own figure** when it is already the clearest available thing (Tier 3). Redrawing
a good diagram badly is a net loss. Attribute it.

**Hold the payoff.** The frame that carries the point stays on screen after the narration lands.
Cutting on the last word steals the moment the viewer needs to absorb it.

**Reading time governs.** Any text the viewer must read holds ~0.3s per word from when it is
settled. Non-text accents can move faster.

## Adding a row

When a scene needs something not listed, add the row — anatomy and choreography — the first time it
is built, so the next chapter reuses it instead of re-deriving it. That is how this file stays the
most valuable thing in the repo.

## TODO

- [ ] A reference still per row, once the first chapter is built
- [ ] Per-row notes on which Hyperframes blueprint implements it
