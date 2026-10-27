// kit.mjs — what every criteria pack builds on: verdicts and the ways a criterion walks an output dir.

import { isBonus } from "./load.mjs";

export const pass = (evidence = []) => ({ status: "pass", evidence });
export const fail = (evidence) => ({ status: "fail", evidence });
export const skip = (why) => ({ status: "skip", evidence: [why] });

export const scenesOf = (ctx) => ctx.segments.flatMap((s) => (s.script?.scenes ?? []).map((sc) => ({ seg: s, sc })));
export const mainSegments = (ctx) => ctx.segments.filter((s) => !isBonus(ctx, s));
export const at = (seg, line) => `segments/${seg.id}/script.md:${line}`;
