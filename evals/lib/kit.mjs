// kit.mjs — what every criteria pack builds on: verdicts and the ways a criterion walks an output dir.

import { isBonus } from "./load.mjs";

export const pass = (evidence = []) => ({ status: "pass", evidence });
export const fail = (evidence) => ({ status: "fail", evidence });
export const skip = (why) => ({ status: "skip", evidence: [why] });

export const scenesOf = (ctx) => ctx.segments.flatMap((s) => (s.script?.scenes ?? []).map((sc) => ({ seg: s, sc })));
export const mainSegments = (ctx) => ctx.segments.filter((s) => !isBonus(ctx, s));
export const at = (seg, line) => `segments/${seg.id}/script.md:${line}`;

/** The running example: the value list that the most main parts show, in its first order ("[1, 2, 3, 1]"). */
export function runningExample(ctx) {
  const seen = new Map();
  for (const s of mainSegments(ctx)) for (const sc of s.script?.scenes ?? []) {
    const text = [sc.onScreen ?? "", ...sc.entries.map((e) => e.display)].join(" ");
    for (const m of text.matchAll(/\[(?:\s*-?\d+\s*,)+\s*-?\d+\s*\]/g)) {
      const k = m[0].replace(/\s+/g, "");
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k).add(s.id);
    }
  }
  const best = [...seen].sort((a, b) => b[1].size - a[1].size)[0];
  return best ? best[0].slice(1, -1).split(",").map(Number) : null;
}

/** The built frame for a scene (frames are named fNN-…, one per scene), or null before step 4. */
export const frameOf = (seg, sc) => seg.frames.find((f) => f.file.split("/").pop().startsWith(`f${String(sc.n).padStart(2, "0")}-`)) ?? null;
