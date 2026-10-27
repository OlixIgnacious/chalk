// criteria.mjs — what a good YouTube tutorial needs on top of the shared criteria (evals/shared.mjs):
// orientation without the source, the teaching arc, real bonus solutions and YouTube's chapter rules.

import { join } from "node:path";
import { existsSync } from "node:fs";
import { frameText, isBonus } from "../../../evals/lib/load.mjs";
import { pass, fail, skip, scenesOf, mainSegments, at } from "../../../evals/lib/kit.mjs";

/** The teaching arc every main problem walks, in order. `stage:` on a scene names one of these. */
export const ARC = ["spot", "problem", "think", "plan", "write", "trace", "why-fast", "bug", "other-ways", "interview"];
/** What must be taught before what. `spot` (the name) may follow the problem and the brute force. */
const BEFORE = [
  ["problem", "think"], ["problem", "spot"], ["think", "plan"], ["plan", "write"], ["write", "trace"],
  ["trace", "bug"], ["trace", "why-fast"], ["write", "other-ways"], ["trace", "interview"],
];
export const DEFAULT_BANNED = ["chapter", "chapters", "book", "section", "the author"];

// ── orientation ───────────────────────────────────────────────────────────────────────────────────

const bannedRe = (ctx) => {
  const terms = [...DEFAULT_BANNED, ...(ctx.channel?.banned_terms ?? [])];
  return new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
};

const orientation = [
  {
    id: "O1",
    group: "orientation",
    title: "Nothing a viewer sees or hears names the source (chapter, book, section…)",
    weight: 3,
    run(ctx) {
      const re = bannedRe(ctx);
      const hits = [];
      for (const { seg, sc } of scenesOf(ctx)) {
        for (const e of sc.entries) {
          for (const layer of ["spoken", "display"]) {
            const m = e[layer]?.match(re);
            if (m) hits.push(`${at(seg, e.line)} ${layer}: "${m[0]}" in "${e[layer].slice(0, 70)}"`);
          }
        }
        const os = sc.onScreen?.match(re);
        if (os) hits.push(`${at(seg, sc.line)} on-screen: "${os[0]}"`);
      }
      for (const [name, text] of Object.entries({ "captions.srt": ctx.files.captions, "description.txt": ctx.files.description, "chapters.txt": ctx.files.chapters })) {
        if (!text) continue;
        text.split("\n").forEach((l, i) => {
          const m = l.match(re);
          if (m) hits.push(`${name}:${i + 1}: "${m[0]}" in "${l.slice(0, 70)}"`);
        });
      }
      for (const seg of ctx.segments) {
        for (const f of seg.frames) {
          const m = frameText(f.html).match(re);
          if (m) hits.push(`${f.file.split("/segments/")[1] ?? f.file}: frame text "${m[0]}"`);
        }
      }
      if (ctx.video?.title && re.test(ctx.video.title)) hits.push(`video.json title: "${ctx.video.title}"`);
      return hits.length ? fail(hits) : pass();
    },
  },
  {
    id: "O2",
    group: "orientation",
    title: "Title names the series and the part number",
    weight: 1,
    run(ctx) {
      if (!ctx.video?.title) return skip("no video.json title");
      const series = ctx.channel?.series?.name;
      if (!series) return fail(["channel.json has no series.name, so the video cannot say where it sits"]);
      const ok = ctx.video.title.includes(series) && /#\d+/.test(ctx.video.title);
      return ok ? pass([ctx.video.title]) : fail([`video.json title "${ctx.video.title}" lacks "${series} #n"`]);
    },
  },
  {
    id: "O3",
    group: "orientation",
    title: "The hook keeps series and plan talk short (at most two lines), after the example",
    weight: 2,
    run(ctx) {
      const hook = ctx.segments[0];
      if (!hook?.script) return skip("no hook script");
      const META = /\b(series|this video|the plan|roadmap|patterns?\b.*\b(first|part)|part \d|first of)\b/i;
      const lines = hook.script.scenes.flatMap((s) => s.entries).filter((e) => META.test(e.display));
      const roadmap = hook.script.scenes.find((s) => s.visualName === "roadmap");
      const ev = lines.map((e) => `${at(hook, e.line)}: "${e.display.slice(0, 50)}"`);
      if (roadmap && roadmap.entries.length > 2) return fail([`the roadmap scene narrates ${roadmap.entries.length} lines; show it, don't read it`, ...ev]);
      return lines.length <= 2 ? pass(ev.length ? ev : ["no series or plan lines"]) : fail([`${lines.length} lines about the series or the plan`, ...ev]);
    },
  },
  {
    id: "O4",
    group: "orientation",
    title: "Every part declares its stage (drives the stage card and the progress strip; the hook has no card)",
    weight: 2,
    run(ctx) {
      const missing = ctx.segments.filter((s) => s.script && !s.script.scenes.some((sc) => sc.stage)).map((s) => `segments/${s.id}/script.md: no "stage:"`);
      const frameless = ctx.segments
        .filter((s, i) => i > 0 && s.frames.length && !s.frames.some((f) => /data-role="stage-card"/.test(f.html)))  // the hook opens on its example
        .map((s) => `segments/${s.id}: frames carry no data-role="stage-card"`);
      const all = [...missing, ...frameless];
      return all.length ? fail(all) : pass();
    },
  },
  {
    id: "O5",
    group: "orientation",
    title: "The outro names the next part of the series",
    weight: 1,
    run(ctx) {
      const last = ctx.segments.at(-1);
      if (!last?.script) return skip("no outro script");
      const parts = ctx.channel?.series?.parts ?? [];
      const me = parts.findIndex((p) => p.id && ctx.video?.part_id === p.id);
      const next = me >= 0 ? parts[me + 1] : null;
      if (!next) return parts.length ? fail(["video.json has no part_id matching channel.json series.parts"]) : skip("no series parts in channel.json");
      const said = last.script.scenes.flatMap((s) => s.entries).some((e) => e.display.toLowerCase().includes(next.title.toLowerCase()));
      return said ? pass([`next: ${next.title}`]) : fail([`segments/${last.id}/script.md never names the next part "${next.title}"`]);
    },
  },
  {
    id: "O6",
    group: "orientation",
    title: "The hook opens on the running example: real values in its first scene, before any series or roadmap talk",
    weight: 2,
    run(ctx) {
      const hook = ctx.segments[0]?.script?.scenes?.[0];
      if (!hook) return skip("no hook script");
      const text = [hook.onScreen ?? "", ...hook.entries.slice(0, 2).map((e) => e.display)].join(" ");
      const example = /\[(?:\s*-?\d+\s*,)+\s*-?\d+\s*\]|(?<![\d,]\s?)-?\d+(?:, -?\d+){2,}/.test(text);
      return example ? pass([`segments/${ctx.segments[0].id} scene 1 shows the example`])
        : fail([`segments/${ctx.segments[0].id}/script.md scene 1 has no example values in its on-screen line or first two lines`]);
    },
  },
];

// ── teaching ──────────────────────────────────────────────────────────────────────────────────────

const codeLines = (text) => text.split("\n").map((l, i) => ({ n: i + 1, l })).filter((x) => x.l.trim());

const teaching = [
  {
    id: "T1",
    group: "teaching",
    title: `Main parts walk the full arc (${ARC.join(", ")}) in teaching order: problem → think → plan → write → trace, with spot after the problem and bug / why-fast / other-ways / interview after the trace`,
    weight: 3,
    run(ctx) {
      const seen = mainSegments(ctx).flatMap((s) => (s.script?.scenes ?? []).filter((sc) => sc.stage).map((sc) => sc.stage.toLowerCase()));
      if (!ctx.segments.some((s) => s.script)) return skip("no scripts");
      const missing = ARC.filter((st) => !seen.includes(st));
      const first = (st) => seen.indexOf(st);
      const ev = [];
      if (missing.length) ev.push(`missing stages: ${missing.join(", ")}`);
      else {
        for (const [a, b] of BEFORE) if (first(a) > first(b)) ev.push(`"${a}" must come before "${b}"`);
      }
      return ev.length ? fail([...ev, seen.join(" → ")]) : pass([seen.join(" → ")]);
    },
  },
  {
    id: "T2",
    group: "teaching",
    title: "Code is built line by line: every code-build scene covers every line of its block",
    weight: 3,
    run(ctx) {
      const builds = scenesOf(ctx).filter(({ sc }) => sc.visualName === "code build");
      const codeShown = scenesOf(ctx).filter(({ sc }) => sc.visualName === "code block");
      if (!builds.length) return fail([`no "visual: code build" scene${codeShown.length ? `; ${codeShown.length} code-block scene(s) show code whole` : ""}`]);
      const ev = [];
      for (const { seg, sc } of builds) {
        const block = ctx.blocks.get(sc.code ?? "");
        if (!block) {
          ev.push(`${at(seg, sc.line)}: code build names no known "code:" block (${sc.code ?? "none"})`);
          continue;
        }
        const covered = new Set(sc.entries.flatMap((e) => e.lines));
        const gaps = codeLines(block.text).filter((x) => !covered.has(x.n)).map((x) => x.n);
        if (gaps.length) ev.push(`${at(seg, sc.line)}: ${block.id} lines ${gaps.join(", ")} are never narrated`);
      }
      return ev.length ? fail(ev) : pass([`${builds.length} code-build scene(s)`]);
    },
  },
  {
    id: "T3",
    group: "teaching",
    title: "Each built function is traced, from a trace the code produced",
    weight: 2,
    run(ctx, env) {
      const builds = scenesOf(ctx).filter(({ sc }) => sc.visualName === "code build" && sc.code);
      const traces = scenesOf(ctx).filter(({ sc }) => sc.visualName === "code + trace");
      if (!builds.length) return fail(["nothing is built, so nothing is traced"]);
      const ev = [];
      for (const { seg, sc } of builds) {
        const t = traces.find((x) => x.sc.code === sc.code);
        if (!t) {
          ev.push(`${at(seg, sc.line)}: ${sc.code} is built but never traced (no "visual: code + trace" with code: ${sc.code})`);
          continue;
        }
        const by = t.sc.computedBy ? join(t.seg.dir, t.sc.computedBy) : null;
        if (!by || !existsSync(by)) {
          ev.push(`${at(t.seg, t.sc.line)}: trace scene has no computed-by script on disk`);
          continue;
        }
        const r = env.python(by, t.seg.dir);
        if (r === null) ev.push(`${at(t.seg, t.sc.line)}: python unavailable, trace not run`);
        else if (r.status !== 0) ev.push(`${at(t.seg, t.sc.line)}: ${t.sc.computedBy} failed: ${r.stderr.trim().split("\n").at(-1)}`);
      }
      return ev.length ? fail(ev) : pass([`${traces.length} trace scene(s) ran`]);
    },
  },
  {
    id: "T4",
    group: "teaching",
    title: "The plan comes before the code",
    weight: 1,
    run(ctx) {
      const order = scenesOf(ctx).map(({ sc }) => sc.visualName);
      const plan = order.indexOf("plan card");
      const build = order.indexOf("code build");
      if (build < 0) return skip("no code build");
      return plan >= 0 && plan < build ? pass() : fail(['no "visual: plan card" scene before the first code build']);
    },
  },
  {
    id: "T5",
    group: "teaching",
    title: "Code is taught, not paraphrased: most built lines are explained with a reason (because, so, only, no need, …)",
    weight: 2,
    run(ctx) {
      const REASON = /\b(because|so|since|only|which means|that means|no need|otherwise|instead|right away|now any|so that|why)\b/i;
      const builds = scenesOf(ctx).filter(({ sc }) => sc.visualName === "code build");
      if (!builds.length) return skip("no code build");
      const ev = [];
      let lines = 0, reasoned = 0;
      for (const { seg, sc } of builds) {
        const byLine = new Map();
        for (const e of sc.entries) for (const n of e.lines ?? []) byLine.set(n, (byLine.get(n) ?? "") + " " + e.display);
        for (const [n, text] of byLine) {
          lines++;
          if (REASON.test(text)) reasoned++;
          else ev.push(`${at(seg, sc.line)}: line ${n} of ${sc.code} is narrated without a reason — "${text.trim().slice(0, 60)}"`);
        }
      }
      const share = lines ? reasoned / lines : 1;
      return share >= 0.6 ? pass([`${reasoned}/${lines} built lines give a reason`])
        : fail([`only ${reasoned}/${lines} built lines give a reason`, ...ev.slice(0, 8)]);
    },
  },
];

// ── bonus ─────────────────────────────────────────────────────────────────────────────────────────

const bonus = [
  {
    id: "B1",
    group: "bonus",
    title: "Every bonus part teaches a real solution: code built line by line and traced",
    weight: 2,
    run(ctx) {
      const parts = ctx.segments.filter((s) => isBonus(ctx, s) && s.script);
      if (!parts.length) return skip("no bonus parts");
      const ev = [];
      for (const s of parts) {
        const scenes = s.script.scenes;
        const build = scenes.find((sc) => sc.visualName === "code build" && ctx.blocks.get(sc.code ?? "")?.kind === "code");
        const trace = scenes.find((sc) => sc.visualName === "code + trace");
        if (!build) ev.push(`segments/${s.id} "${s.script.title}": no code build of a source code block — explanation without a solution`);
        else if (!trace) ev.push(`segments/${s.id} "${s.script.title}": ${build.code} built but not traced`);
      }
      return ev.length ? fail(ev) : pass([`${parts.length} bonus part(s)`]);
    },
  },
];

// ── render (YouTube) ──

const youtubeRender = [
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

export const CRITERIA = [...orientation, ...teaching, ...bonus, ...youtubeRender];
export const GROUPS = ["orientation", "teaching", "bonus", "render"];
