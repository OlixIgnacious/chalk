// criteria.mjs — the skit pack: two or more characters, one voice each, trading lines on a stage. The comedy's
// facts are still facts: every line cites its block (G1) and the source is checked (G7) like any other build.
// Here, what makes it a skit: who speaks, that each has a voice, and that they take turns.

import { pass, fail, skip } from "../../../evals/lib/kit.mjs";
import { linesOf, manifest } from "../../lib.mjs";

export const ABOUT = "skits: two or more voices, each cast, taking turns; the comedy's facts are still facts";
export const SHAPES = ["long", "short"];
export const WAIVES = { E2: "a skit has no running example (the skit pack)" };
/** The most lines one character says in a row before the other gets a word in. */
export const MAX_RUN = 4;
/** How long a skit holds the wide two-shot before its first close-up: the viewer sees who is there, and where. */
export const OPEN_SEC = 1.5;

/** The camera's shot changes in a frame spec, in time order: { name, t, line }. Only calls with a literal time
 * can be placed; one timed by a cue is left out. The stage opens on "two" until the first change. */
export function shotsOf(py) {
  const out = [];
  py.split("\n").forEach((src, i) => {
    for (const m of src.matchAll(/\.shot\(\s*["']([^"']+)["']\s*,\s*(\d+(?:\.\d+)?)\s*[,)]/g))
      out.push({ name: m[1], t: Number(m[2]), line: i + 1 });
  });
  return out.sort((a, b) => a.t - b.t);
}

const cast = (ctx) => manifest(ctx).cast ?? ctx.channel?.cast ?? {};

const skit = [
  {
    id: "K1",
    group: "skit",
    title: "Every line names its speaker, and there are two or more",
    weight: 3,
    run(ctx) {
      const lines = linesOf(ctx).filter((l) => !l.entry.source?.includes("pipeline"));
      if (!lines.length) return skip("no scripts");
      const none = lines.filter((l) => !l.entry.speaker).map((l) => `${l.at}: no speaker: "${l.display.slice(0, 60)}"`);
      const who = [...new Set(lines.map((l) => l.entry.speaker).filter(Boolean))];
      const ev = [...none, ...(who.length < 2 ? [`${who.length} speaker(s) (${who.join(", ") || "none"}): a skit needs two or more`] : [])];
      return ev.length ? fail(ev) : pass([who.join(", ")]);
    },
  },
  {
    id: "K2",
    group: "skit",
    title: "Every speaker is cast: the manifest's (or channel.json's) cast gives each a voice",
    weight: 2,
    run(ctx) {
      const who = [...new Set(linesOf(ctx).map((l) => l.entry.speaker).filter(Boolean))];
      if (!who.length) return skip("no speakers");
      const c = cast(ctx);
      const bad = who.filter((w) => !c[w]?.voice).map((w) => `${w} has no voice in the cast: "cast": { "${w}": { "voice": "…" } }`);
      return bad.length ? fail(bad) : pass(who.map((w) => `${w}: ${c[w].voice}`));
    },
  },
  {
    id: "K3",
    group: "skit",
    title: `They take turns: no one says more than ${MAX_RUN} lines in a row`,
    weight: 1,
    run(ctx) {
      const lines = linesOf(ctx).filter((l) => l.entry.speaker);
      if (lines.length < 2) return skip("fewer than two spoken lines");
      const bad = [];
      let run = 1;
      for (let i = 1; i < lines.length; i++) {
        run = lines[i].entry.speaker === lines[i - 1].entry.speaker ? run + 1 : 1;
        if (run === MAX_RUN + 1) bad.push(`${lines[i].at}: ${lines[i].entry.speaker} has said ${run} lines in a row`);
      }
      return bad.length ? fail(bad) : pass();
    },
  },
  {
    id: "K4",
    group: "skit",
    title: `It opens wide: the two-shot holds the first ${OPEN_SEC} s, so the viewer sees who is there and where`,
    weight: 2,
    run(ctx) {
      const specs = ctx.segments.filter((s) => s.frameSpec);
      if (!specs.length) return skip("no frame spec yet (frames/sNN.py)");
      const bad = [];
      for (const s of specs) {
        const first = shotsOf(s.frameSpec)[0];
        if (first && first.t < OPEN_SEC && first.name.split(":")[0] !== "two")
          bad.push(`frames/s${s.id}.py:${first.line}: the first shot is "${first.name}" at ${first.t}s; hold "two" until ${OPEN_SEC}s`);
      }
      return bad.length ? fail(bad) : pass(specs.map((s) => `s${s.id}: opens on two`));
    },
  },
];

export const CRITERIA = skit;
export const GROUPS = ["skit"];
