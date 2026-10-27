// criteria.mjs — what a good chalk lesson needs on top of the shared criteria (evals/shared.mjs): one
// objective and one fair checkpoint per segment, concepts in prerequisite order, and a page that plays.
// A lesson is openly tied to its chapter and has checkpoints by design, so the YouTube pack's "never name
// the source" and "no quizzes" do not apply here.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { stripMarkers } from "../../../evals/lib/load.mjs";
import { pass, fail, skip } from "../../../evals/lib/kit.mjs";

const segOf = (ctx, id) => ctx.segments.find((s) => s.id === id);
const cited = (seg) => new Set((seg?.script?.scenes ?? []).flatMap((sc) => sc.entries.flatMap((e) => e.source)));

const lesson = [
  {
    id: "L1",
    group: "lesson",
    title: "Every segment has one objective and a well-formed checkpoint that cites the source",
    weight: 3,
    run(ctx) {
      if (!ctx.lesson) return skip("no lesson.json");
      const ev = [];
      for (const s of ctx.lesson.segments ?? []) {
        const at = `lesson.json segment ${s.id}`;
        const obj = (s.objective ?? "").trim();
        if (!obj) ev.push(`${at}: no objective`);
        else if (/;/.test(obj) || obj.split(/(?<=[.!?])\s+/).filter(Boolean).length > 1) ev.push(`${at}: the objective is more than one idea — "${obj}"`);
        const c = s.checkpoint;
        if (!c) {
          ev.push(`${at}: no checkpoint`);
          continue;
        }
        if (!c.prompt?.trim()) ev.push(`${at}: the checkpoint has no prompt`);
        if (!Array.isArray(c.options) || c.options.length < 2) ev.push(`${at}: the checkpoint needs at least two options`);
        else if (!Number.isInteger(c.answer) || c.answer < 0 || c.answer >= c.options.length) ev.push(`${at}: the answer index ${c.answer} is not one of the ${c.options.length} options`);
        if (!c.explanation?.trim()) ev.push(`${at}: the checkpoint has no explanation`);
        const src = c.source ?? [];
        if (!src.length) ev.push(`${at}: the checkpoint cites no source`);
        for (const id of src) if (ctx.blocks.size && !ctx.blocks.has(id)) ev.push(`${at}: the checkpoint cites ${id}, which is not in chapter.json`);
      }
      return ev.length ? fail(ev) : pass([`${ctx.lesson.segments?.length ?? 0} segment(s)`]);
    },
  },
  {
    id: "L2",
    group: "lesson",
    title: "Each checkpoint is answerable from its own segment: the blocks its answer rests on are taught there",
    weight: 2,
    run(ctx) {
      if (!ctx.lesson) return skip("no lesson.json");
      const ev = [];
      let n = 0;
      for (const s of ctx.lesson.segments ?? []) {
        const seg = segOf(ctx, s.id);
        if (!seg?.script || !s.checkpoint?.source?.length) continue;
        n++;
        const taught = cited(seg);
        const missing = s.checkpoint.source.filter((id) => !taught.has(id));
        if (missing.length) ev.push(`segment ${s.id}: the checkpoint rests on ${missing.join(", ")}, which segments/${s.id}/script.md never cites — "${s.checkpoint.prompt.slice(0, 60)}"`);
      }
      if (!n) return skip("no checkpoint with a scripted segment");
      return ev.length ? fail(ev) : pass([`${n} checkpoint(s) taught in their own segment`]);
    },
  },
  {
    id: "L3",
    group: "lesson",
    title: "Concepts come in prerequisite order: no glossary term is spoken before the segment that defines it",
    weight: 2,
    run(ctx) {
      const terms = (ctx.lesson?.glossary ?? []).filter((g) => g.term && g.source?.length);
      if (!terms.length) return skip("no glossary terms with sources");
      const order = (ctx.lesson.segments ?? []).map((s) => s.id);
      const ev = [];
      for (const g of terms) {
        const defining = order.find((id) => g.source.some((b) => cited(segOf(ctx, id)).has(b)));
        if (!defining) continue;
        const re = new RegExp(`\\b${g.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        for (const id of order.slice(0, order.indexOf(defining))) {
          const said = (segOf(ctx, id)?.script?.scenes ?? []).flatMap((sc) => sc.entries).find((e) => re.test(stripMarkers(e.spoken || e.display)));
          if (said) ev.push(`segments/${id}/script.md:${said.line}: says "${g.term}" before segment ${defining} defines it`);
        }
      }
      return ev.length ? fail(ev) : pass([`${terms.length} term(s) in order`]);
    },
  },
  {
    id: "L4",
    group: "lesson",
    title: "The lesson page exists and every segment it plays is on disk",
    weight: 2,
    run(ctx) {
      if (!ctx.lesson) return skip("no lesson.json");
      if (!ctx.lessonPage) return skip("no lesson.html yet (step 5)");
      const page = readFileSync(ctx.lessonPage, "utf8");
      const ev = [];
      for (const s of ctx.lesson.segments ?? []) {
        if (s.mp4 && !existsSync(join(ctx.dir, s.mp4))) ev.push(`segment ${s.id}: ${s.mp4} is not there`);
        if (s.mp4 && !page.includes(s.mp4)) ev.push(`segment ${s.id}: lesson.html never references ${s.mp4} — rebuild the page`);
      }
      return ev.length ? fail(ev) : pass([`${ctx.lesson.segments.length} segment(s) play`]);
    },
  },
];

export const CRITERIA = lesson;
export const GROUPS = ["lesson"];
