// lib.mjs — what the genre packs share: the lines a viewer hears and sees, and the words in them.

import { stripMarkers } from "../evals/lib/load.mjs";
import { scenesOf, at } from "../evals/lib/kit.mjs";
import { quotedSpans } from "../core/scripts/facts.mjs";

export { quotedSpans };

/** Every narrated line, in order: { at, seg, sc, entry, display, spoken }. */
export const linesOf = (ctx) =>
  scenesOf(ctx).flatMap(({ seg, sc }) =>
    sc.entries.map((e) => ({ at: at(seg, e.line), seg, sc, entry: e, display: e.display ?? "", spoken: stripMarkers(e.spoken ?? "") })));

/** Everything a viewer reads: each line's display layer and each scene's on-screen text. */
export const shownOf = (ctx) => [
  ...linesOf(ctx).map((l) => ({ at: l.at, text: l.display })),
  ...scenesOf(ctx).filter(({ sc }) => sc.onScreen).map(({ seg, sc }) => ({ at: at(seg, sc.line), text: sc.onScreen })),
];

const STOP = new Set(("the a an and or but if then so of to in on at by for with from as is are was were be been it its this that " +
  "these those you your we our they their he she his her i me my not no yes do does did have has had what when where who why how " +
  "just only very more most some any all can could will would should into out up down over than there here one two").split(" "));

/** The content words of a text: four letters or more, not a function word. */
export const contentWords = (t) => new Set((t.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((w) => !STOP.has(w)));

/** The sentences of a text, pause markers out. */
export const sentences = (t) => stripMarkers(t).split(/(?<=[.!?])\s+/).filter((s) => /\w/.test(s));

/** The manifest's own fields: short.json for a Short, else video.json (lesson.json for a lesson). */
export const manifest = (ctx) => (ctx.format === "lesson" ? ctx.lesson : ctx.video) ?? {};
