// criteria.mjs — the coding-lesson pack: what a good coding tutorial needs on top of the shared criteria
// (evals/shared.mjs) and its shape's (formats/<shape>/eval/criteria.mjs): orientation without the source, the
// teaching arc (problem → think → plan → write → trace), code built line by line, real bonus solutions.
// A pack is a genre's rules, chosen by the channel (channel.json "pack") or the manifest, independent of the shape.

import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { frameText, isBonus } from "../../../evals/lib/load.mjs";
import { pass, fail, skip, scenesOf, mainSegments, at, runningExample, frameOf } from "../../../evals/lib/kit.mjs";

const REASON = /\b(because|so|since|only|which means|that means|no need|otherwise|instead|right away|now any|so that|why)\b/i;
/** Stages whose blocks a problem part must not lean on: the viewer has not been taught them yet. */
const LATER = ["why-fast", "other-ways", "interview"];
/** Stages that teach a block before the payoff stages do. */
const TEACHES = ["think", "insight", "plan", "write", "trace", "spot", "bug"];

/** The teaching arc every main problem walks, in order. `stage:` on a scene names one of these. */
export const ARC = ["spot", "problem", "think", "insight", "plan", "write", "trace", "why-fast", "bug", "other-ways", "interview"];
/** What must be taught before what. `spot` (the name) may follow the problem and the brute force. */
const BEFORE = [
  ["problem", "think"], ["problem", "spot"], ["think", "insight"], ["insight", "plan"], ["plan", "write"], ["write", "trace"],
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
      if (me < 0) return parts.length ? fail(["video.json has no part_id matching channel.json series.parts"]) : skip("no series parts in channel.json");
      // the series' last part has no next part to name; its outro closes the series instead
      if (me === parts.length - 1) return pass([`${parts[me].title} is the last part of the series`]);
      const next = parts[me + 1];
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
      // a list of numbers, or a quoted string literal for a problem on strings ("anagram")
      const example = /\[(?:\s*-?\d+\s*,)+\s*-?\d+\s*\]|(?<![\d,]\s?)-?\d+(?:, -?\d+){2,}|"[^"\s]{2,}"/.test(text);
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
      // A function read line by line in a "code show" (another way, the brute force) is taught like a build, so
      // that scene must be driven by a run of it: its own computed-by script, defining the function, whose output
      // the frame draws. An example somewhere else that defines it is not enough: the 26-slot version had one
      // while its slots sat at zero the whole time. Short blocks (under 5 lines) and code-depth: glance are exempt.
      // Whether the frame really changes the values is for the reviewer: a built page does not say.
      for (const { seg, sc } of scenesOf(ctx).filter(({ sc }) => sc.visualName === "code show" && sc.code && !/glance/i.test(sc.codeDepth ?? ""))) {
        const code = ctx.blocks.get(sc.code)?.text ?? "";
        if (code.split("\n").filter((l) => l.trim()).length < 5 || sc.entries.filter((e) => e.lines.length).length < 4) continue;
        if (builds.some((b) => b.sc.code === sc.code)) continue;
        const def = code.split("\n").find((l) => /^\s*def\s/.test(l))?.trim().split("(")[0];
        if (traces.some((x) => x.sc.code === sc.code)) continue;
        const own = sc.computedBy ? join(seg.dir, sc.computedBy) : null;
        if (!own || !existsSync(own)) {
          ev.push(`${at(seg, sc.line)}: ${sc.code} is read line by line but the scene runs nothing: give it a computed-by script that runs ${def ?? "it"}`);
          continue;
        }
        if (def && !readFileSync(own, "utf8").includes(def + "(")) ev.push(`${at(seg, sc.line)}: ${sc.computedBy} does not define ${def}`);
        else {
          const r = env.python(own, seg.dir);
          if (r && r.status !== 0) ev.push(`${at(seg, sc.line)}: ${sc.computedBy} failed: ${r.stderr.trim().split("\n").at(-1)}`);
        }
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
  {
    id: "T6",
    group: "teaching",
    title: "Code shown anywhere is taught, not paraphrased: about one narrated line per two lines of code, with a reason (a block already built, or code-depth: glance on 2 lines or fewer, is exempt)",
    weight: 2,
    run(ctx) {
      const built = new Set(scenesOf(ctx).filter(({ sc }) => sc.visualName === "code build").map(({ sc }) => sc.code));
      const shown = scenesOf(ctx).filter(({ sc }) => sc.code && !["code build", "code + trace"].includes(sc.visualName));
      if (!shown.length) return skip("no code shown outside a build or a trace");
      const ev = [];
      for (const { seg, sc } of shown) {
        const block = ctx.blocks.get(sc.code);
        if (!block) continue;
        const n = codeLines(block.text).length;
        if (built.has(sc.code)) continue; // shown again after it was built: a bug swap, a recap
        if (/glance/i.test(sc.codeDepth ?? "")) {
          if (n > 2) ev.push(`${at(seg, sc.line)}: ${sc.code} (${n} lines) is a glance but was never built — teach it, or show at most 2 lines`);
          continue;
        }
        const about = sc.entries.filter((e) => e.source.includes(sc.code) || e.lines.length);
        const need = Math.ceil(n / 2);
        if (about.length < need) ev.push(`${at(seg, sc.line)}: ${sc.code} shows ${n} lines but ${about.length} narrated line(s) are about it (need ${need}) — teach it like a build, or mark code-depth: glance`);
        else if (!about.some((e) => REASON.test(e.display))) ev.push(`${at(seg, sc.line)}: ${sc.code} is narrated without a single reason`);
      }
      return ev.length ? fail(ev) : pass([`${shown.length} code scene(s) outside builds are taught`]);
    },
  },
  {
    id: "T7",
    group: "teaching",
    title: "The problem part does not lean on answers the viewer has not met: no block cited there is taught only in why-fast, other-ways or interview",
    weight: 2,
    run(ctx) {
      const all = scenesOf(ctx).filter(({ seg }) => !isBonus(ctx, seg));
      const problem = all.filter(({ sc }) => sc.stage === "problem");
      if (!problem.length) return skip("no problem stage");
      const stagesOf = new Map();
      for (const { sc } of all) for (const e of sc.entries) for (const id of e.source) {
        if (!stagesOf.has(id)) stagesOf.set(id, new Set());
        stagesOf.get(id).add(sc.stage);
      }
      const ev = [];
      for (const { seg, sc } of problem) for (const e of sc.entries) for (const id of e.source) {
        const st = [...(stagesOf.get(id) ?? [])];
        const later = st.filter((s) => LATER.includes(s));
        if (later.length && !st.some((s) => TEACHES.includes(s))) {
          ev.push(`${at(seg, e.line)}: cites ${id}, which is taught only in ${later.join(", ")} — "${e.display.slice(0, 60)}"`);
        }
      }
      return ev.length ? fail(ev) : pass([`${problem.length} problem scene(s)`]);
    },
  },
  {
    id: "T8",
    group: "teaching",
    title: "The outline gives each part one idea: no Teaches cell lists three or more things",
    weight: 2,
    run(ctx) {
      if (!ctx.outline) return skip("no outline.md");
      if (!ctx.outline.length) return fail(["outline.md has no parts table with a Teaches column"]);
      const ev = [];
      for (const r of ctx.outline) {
        if (["hook", "recap"].includes(r.stage)) continue;
        const plain = r.teaches.replace(/\[[^\]]*\]|\([^)]*\)|`[^`]*`/g, "x").replace(/\*/g, "");
        // ";" and "and" join ideas ("x and not y" is one contrast); commas only count when they make a
        // list ("a, b, c"), not a qualifier
        const clauses = plain.split(/;|\band\b(?! not\b)/).filter((c) => c.trim().replace(/,$/, "")).reduce((n, piece) => {
          const items = piece.split(",").filter((c) => c.trim());
          return n + (items.length >= 3 ? items.length : 1);
        }, 0);
        if (clauses >= 3) ev.push(`outline.md:${r.line} part ${r.n} "${r.title}" teaches ${clauses} things: "${r.teaches}"`);
      }
      return ev.length ? fail(ev) : pass([`${ctx.outline.length} part(s), one idea each`]);
    },
  },
  {
    id: "T9",
    group: "teaching",
    title: "The insight is shown on the running example, not told in text cards: its frames draw the example's values",
    weight: 2,
    run(ctx) {
      const insight = scenesOf(ctx).filter(({ seg, sc }) => sc.stage === "insight" && !isBonus(ctx, seg));
      if (!insight.length) return skip("no insight stage (T1 reports it)");
      const example = runningExample(ctx);
      const ev = [], ok = [];
      for (const { seg, sc } of insight) {
        if (!/^(chapter|derived)/i.test(sc.example ?? "")) {
          ev.push(`${at(seg, sc.line)}: insight scene "${sc.title}" names no example`);
          continue;
        }
        const frame = frameOf(seg, sc);
        if (!frame || !example) {
          ok.push(`${at(seg, sc.line)}: ${sc.example}${frame ? "" : " (frames not built yet: the tag is all there is to check)"}`);
          continue;
        }
        // drawn means each value is its own element (a cell, a chip), not the list written inside a sentence
        const drawn = [...frame.html.matchAll(/>\s*(-?\d+|[^<>\s]{1,2})\s*</g)].map((m) => m[1]);
        const missing = [...new Set(example)].filter((v) => drawn.filter((d) => d === v).length < example.filter((e) => e === v).length);
        if (missing.length) ev.push(`${frame.file.split("/segments/")[1]}: the insight frame never draws [${example.join(", ")}] as values (missing ${missing.join(", ")}) — it tells the idea instead of showing it`);
        else ok.push(`${frame.file.split("/segments/")[1]}: draws [${example.join(", ")}]`);
      }
      return ev.length ? fail(ev) : pass(ok);
    },
  },
  {
    id: "T10",
    group: "teaching",
    title: "Every branch of narrated code is said: a part that walks one branch of an if/elif/else walks them all, and a narrated `if a or b` says the \"or\" (a scene's `skips: <block> — why` excuses one)",
    weight: 2,
    run(ctx) {
      const ev = [], ok = [];
      for (const seg of ctx.segments) {
        const scenes = (seg.script?.scenes ?? []).filter((sc) => !UNTAUGHT.includes(sc.stage));
        const skips = (seg.script?.scenes ?? []).map((sc) => sc.skips ?? "").join(" ");
        const spoken = scenes.flatMap((sc) => sc.entries.map((e) => e.spoken)).join(" ").toLowerCase();
        // per code block: the lines this part narrates (from `lines:`), and whether it is cited at all
        const blocks = new Map();
        for (const sc of scenes) for (const e of sc.entries) {
          const id = e.source.find((s) => ctx.blocks.get(s)?.kind === "code");
          if (!id) continue;
          if (!blocks.has(id)) blocks.set(id, { lines: new Set(), entries: [] });
          for (const n of e.lines) blocks.get(id).lines.add(n);
          blocks.get(id).entries.push(e);
        }
        for (const [id, use] of blocks) {
          if (new RegExp(`\\b${id}\\b`).test(skips)) { ok.push(`segments/${seg.id}: ${id} skipped on purpose`); continue; }
          const code = ctx.blocks.get(id).text.split("\n");
          for (const chain of branchChains(code)) {
            const said = chain.map((b) => (use.lines.size ? b.lines.some((n) => use.lines.has(n)) : commentSaid(b, chain, spoken)));
            if (said.every((s) => s === null)) continue;
            if (!said.some(Boolean) || said.every((s) => s !== false)) continue;
            const missed = chain.filter((b, i) => said[i] === false);
            for (const b of missed) {
              ev.push(`segments/${seg.id}: ${id} line ${b.lines[0]} \`${code[b.lines[0] - 1].trim().slice(0, 70)}\` is never said, though its sibling branch is — say what happens there, or add skips: ${id} — <why>`);
            }
          }
          // a compound condition read out without its "or"/"and" drops one of its reasons (dsa-04's `not result`)
          for (const n of use.lines) {
            const m = code[n - 1]?.match(/^\s*(?:if|elif|while)\s+(.*):/);
            if (!m) continue;
            const ops = [...new Set([...m[1].replace(/(["'])(?:(?!\1).)*\1/g, "").matchAll(/\b(or|and)\b/g)].map((x) => x[1]))];
            const about = use.entries.filter((e) => e.lines.includes(n)).map((e) => e.spoken.toLowerCase()).join(" ");
            for (const op of ops) {
              const heard = op === "or" ? /\b(or|either|unless)\b/ : /\b(and|both)\b/;
              if (!heard.test(about)) ev.push(`segments/${seg.id}: ${id} line ${n} \`${code[n - 1].trim().slice(0, 70)}\` is narrated without its "${op}" — each side of it is a reason the viewer needs`);
            }
          }
        }
      }
      return ev.length ? fail(ev) : pass(ok.length ? ok : ["every narrated branch has its siblings said"]);
    },
  },
];

/** Stages that name code without teaching it. */
const UNTAUGHT = ["hook", "recap", "practice", "next"];

/** The if/elif/else chains of a code block with two or more branches: [[{ lines: [header, ...body], comment }]]. */
function branchChains(code) {
  const indent = (l) => l.match(/^\s*/)[0].length;
  const blank = (l) => !l.trim() || /^\s*#/.test(l);
  const chains = [];
  const open = new Map(); // indent → the chain still accepting elif/else at that indent
  code.forEach((l, i) => {
    if (blank(l)) return;
    const d = indent(l);
    for (const k of [...open.keys()]) if (k > d || (k === d && !/^\s*(elif\b|else\s*:)/.test(l))) open.delete(k);
    const m = l.match(/^\s*(if|elif|else)\b/);
    if (!m) return;
    let end = i + 1;
    while (end < code.length && (blank(code[end]) || indent(code[end]) > d)) end++;
    const lines = Array.from({ length: end - i }, (_, k) => i + 1 + k).filter((n) => !blank(code[n - 1]));
    const comment = lines.map((n) => code[n - 1].match(/#\s*(.*)$/)?.[1] ?? "").join(" ").toLowerCase();
    const branch = { lines, comment };
    if (m[1] === "if") {
      const chain = [branch];
      chains.push(chain);
      open.set(d, chain);
    } else open.get(d)?.push(branch);
  });
  return chains.filter((c) => c.length > 1);
}

const STOP = new Set("the a an it its is are was to of in on at by for and or not no only this that so if else then can could when with from as be".split(" "));
const stem = (w) => w.replace(/(?:ing|ed|es|s)$/, "");
/** With no `lines:`, a branch counts as said when a word only its own comment has is in the part's narration;
 * null when the branch has no comment of its own to go by. Half of those words, not one: a word like "left" is
 * also how the narration names a pointer. */
function commentSaid(b, chain, spoken) {
  const words = (c) => (c.match(/[a-z]{3,}/g) ?? []).filter((w) => !STOP.has(w));
  const others = new Set(chain.filter((x) => x !== b).flatMap((x) => words(x.comment)));
  const own = words(b.comment).filter((w) => !others.has(w));
  if (!own.length) return null;
  // at least half of them: "the left pointer moves" names a pointer, it does not say the else branch's "too big"
  const heard = new Set((spoken.match(/[a-z]+/g) ?? []).map(stem));
  return own.filter((w) => heard.has(stem(w))).length * 2 >= own.length;
}

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

export const CRITERIA = [...orientation, ...teaching, ...bonus];
export const GROUPS = ["orientation", "teaching", "bonus"];
export const SHAPES = ["long"];
export const ABOUT = "coding tutorials: the problem → think → plan → write → trace arc, code built line by line, never naming the source";
export const BANNED = DEFAULT_BANNED; // never naming the source: words the text gates refuse in the narration
