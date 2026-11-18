// criteria.mjs — the essay pack: focus, motivational and reflective pieces. One thesis, an opening image that the
// ending comes back to, few words with room around them, and every quotation said with whose it is. Whether a
// quotation is real is the source check's (G7, G8); here, only that the viewer is told who said it.

import { pass, fail, skip, scenesOf, at } from "../../../evals/lib/kit.mjs";
import { linesOf, shownOf, quotedSpans, contentWords, sentences, manifest } from "../../lib.mjs";

export const ABOUT = "focus, motivational and reflective pieces: one thesis, an ending that echoes the opening, quotations attributed";
export const SHAPES = ["long", "short"];
/** Shared criteria that are a lesson's rules, not an essay's: reported as skipped with this reason. */
export const WAIVES = { E2: "an essay has no running example (the essay pack)" };

/** An attribution next to a quotation: "— Name", "Name said", "as Name put it", "in the words of Name". */
const ATTRIBUTED = /[—–-]\s*[A-Z][\w.'-]+|\b(?:said|says|wrote|writes|asked|told|put it|in the words of|according to)\b/i;

const essay = [
  {
    id: "Y1",
    group: "essay",
    title: "One thesis, said in one sentence of at most 25 words",
    weight: 2,
    run(ctx) {
      const t = manifest(ctx).thesis;
      if (!t) return fail(["the manifest has no thesis: an essay says one thing, and its thesis names it"]);
      const n = t.split(/\s+/).filter(Boolean).length;
      const s = sentences(t).length;
      return n > 25 || s > 1 ? fail([`thesis is ${n} words in ${s} sentence(s): "${t.slice(0, 120)}"`]) : pass([`"${t}"`]);
    },
  },
  {
    id: "Y2",
    group: "essay",
    title: "Every quotation the viewer sees or hears says whose words they are, in the same line",
    weight: 3,
    run(ctx) {
      const shown = [...shownOf(ctx), ...linesOf(ctx).map((l) => ({ at: l.at, text: l.spoken }))];
      if (!shown.length) return skip("no scripts");
      const bad = [];
      for (const { at: where, text } of shown) {
        for (const q of quotedSpans(text)) {
          const rest = text.replace(q, " ");
          if (!ATTRIBUTED.test(rest)) bad.push(`${where}: "${q}" is not attributed in its line`);
        }
      }
      return bad.length ? fail([...new Set(bad)]) : pass();
    },
  },
  {
    id: "Y3",
    group: "essay",
    title: "Few words, room around them: sentences average 14 words or fewer, none over 24",
    weight: 2,
    run(ctx) {
      const all = linesOf(ctx).flatMap((l) => sentences(l.spoken).map((s) => ({ at: l.at, s, n: s.split(/\s+/).length })));
      if (!all.length) return skip("no narration");
      const avg = all.reduce((a, x) => a + x.n, 0) / all.length;
      const long = all.filter((x) => x.n > 24).map((x) => `${x.at}: ${x.n} words — "${x.s.slice(0, 80)}"`);
      const ev = [...(avg > 14 ? [`average ${avg.toFixed(1)} words a sentence`] : []), ...long];
      return ev.length ? fail(ev) : pass([`average ${avg.toFixed(1)} words a sentence`]);
    },
  },
  {
    id: "Y4",
    group: "essay",
    title: "The ending echoes the opening: the last scene comes back to a word of the first",
    weight: 1,
    run(ctx) {
      const scenes = scenesOf(ctx);
      if (scenes.length < 2) return skip("fewer than two scenes");
      const text = ({ sc }) => [sc.onScreen ?? "", ...sc.entries.map((e) => e.display ?? "")].join(" ");
      const first = contentWords(text(scenes[0]));
      const last = scenes.at(-1);
      const shared = [...contentWords(text(last))].filter((w) => first.has(w));
      return shared.length ? pass([`both say: ${shared.slice(0, 5).join(", ")}`])
        : fail([`${at(last.seg, last.sc.line)}: the last scene shares no word with the first; the ending does not come back to the opening`]);
    },
  },
  {
    id: "Y5",
    group: "essay",
    title: "No code on screen: an essay that needs code is a coding lesson",
    weight: 1,
    run(ctx) {
      const bad = scenesOf(ctx).filter(({ sc }) => sc.code || /\bcode\b/.test(sc.visualName ?? "")).map(({ seg, sc }) => `${at(seg, sc.line)}: ${sc.visual}`);
      return bad.length ? fail(bad) : pass();
    },
  },
];

export const CRITERIA = essay;
export const GROUPS = ["essay"];
