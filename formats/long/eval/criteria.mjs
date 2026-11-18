// criteria.mjs — what the long shape needs whatever its genre: a thesis that cites its blocks (it goes into the
// public description) and chapter markers a player can parse. The genre's rules are the pack's
// (packs/<pack>/eval/criteria.mjs); what every shape shares is evals/shared.mjs.

import { pass, fail, skip } from "../../../evals/lib/kit.mjs";

// ── render ──

const longRender = [
  {
    id: "R2",
    group: "render",
    title: "YouTube chapter rules: first at 0:00, at least three, each at least 10 s",
    weight: 2,
    run(ctx, env) {
      if (!ctx.files.chapters) return skip("no chapters.txt");
      const rows = ctx.files.chapters.trim().split("\n").map((l) => l.match(/^(\d+(?::\d+)+)\s+(.+)$/)).filter(Boolean);
      const secs = rows.map((m) => m[1].split(":").reduce((a, b) => a * 60 + Number(b), 0));
      const total = ctx.files.video ? env.duration(ctx.files.video) : null;
      const ev = [];
      if (secs[0] !== 0) ev.push("first chapter is not at 0:00");
      if (rows.length < 3) ev.push(`${rows.length} chapter(s); YouTube needs 3`);
      secs.forEach((s, i) => {
        const end = secs[i + 1] ?? total;
        if (end != null && end - s < 10) ev.push(`"${rows[i][2]}" is ${(end - s).toFixed(1)}s`);
      });
      return ev.length ? fail(ev) : pass([`${rows.length} chapters`]);
    },
  },
];

const longGrounding = [
  {
    id: "G6",
    group: "grounding",
    title: "The thesis cites its blocks like a narrated line: video.json thesis_source names the blocks it says (it goes into the public description)",
    weight: 1,
    run(ctx) {
      const thesis = ctx.video?.thesis;
      if (!thesis) return skip("no thesis in video.json yet");
      const src = ctx.video.thesis_source;
      if (!Array.isArray(src) || !src.length) {
        return fail([`video.json thesis has no thesis_source: cite the blocks each of its claims comes from, so the grounding agent can check it — "${thesis.slice(0, 80)}"`]);
      }
      const unknown = src.filter((id) => !ctx.blocks.has(id));
      if (unknown.length) return fail([`video.json thesis_source names blocks the chapter does not have: ${unknown.join(", ")}`]);
      return pass([`thesis cites ${src.join(", ")}`]);
    },
  },
];

export const CRITERIA = [...longGrounding, ...longRender];
export const GROUPS = ["render"];
