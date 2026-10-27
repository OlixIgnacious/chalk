// criteria.mjs — what "a good tutorial video" means, as mechanical checks.
//
// Each criterion: { id, group, title, weight, run(ctx, env) → { status: "pass"|"fail"|"skip", evidence: [] } }.
// `env` carries the side-effecting helpers (python, ffprobe, chalk-core) so the criteria stay readable and
// a fixture without media simply skips what it cannot measure. Judgement calls (is this explanation
// vague?) are not here: they belong to the chalk-reviewer agent, which reads this file's output.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { frameText, stripMarkers, isBonus } from "./lib/load.mjs";

/** The teaching arc every main problem walks, in order. `stage:` on a scene names one of these. */
export const ARC = ["spot", "problem", "think", "plan", "write", "trace", "why-fast", "bug", "other-ways", "interview"];
/** What must be taught before what. `spot` (the name) may follow the problem and the brute force. */
const BEFORE = [
  ["problem", "think"], ["problem", "spot"], ["think", "plan"], ["plan", "write"], ["write", "trace"],
  ["trace", "bug"], ["trace", "why-fast"], ["write", "other-ways"], ["trace", "interview"],
];
export const DEFAULT_BANNED = ["chapter", "chapters", "book", "section", "the author"];

const pass = (evidence = []) => ({ status: "pass", evidence });
const fail = (evidence) => ({ status: "fail", evidence });
const skip = (why) => ({ status: "skip", evidence: [why] });

const scenesOf = (ctx) => ctx.segments.flatMap((s) => (s.script?.scenes ?? []).map((sc) => ({ seg: s, sc })));
const mainSegments = (ctx) => ctx.segments.filter((s) => !isBonus(ctx, s));
const at = (seg, line) => `segments/${seg.id}/script.md:${line}`;

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

// ── grounding ─────────────────────────────────────────────────────────────────────────────────────

const unescapeHtml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#8203;/g, "").replace(/&amp;/g, "&");

const grounding = [
  {
    id: "G1",
    group: "grounding",
    title: "check-readability passes (every line sourced, every derived example computed)",
    weight: 3,
    run(ctx, env) {
      const scripts = ctx.segments.filter((s) => s.script).map((s) => s.scriptPath);
      if (!scripts.length) return skip("no scripts");
      const r = env.chalkCore(["check-readability", ...scripts]);
      if (r === null) return skip("chalk-core unavailable");
      const fails = (r.stdout + r.stderr).split("\n").filter((l) => /FAIL/.test(l)).map((l) => l.trim());
      return r.status === 0 ? pass() : fail(fails.length ? fails : [(r.stderr || r.stdout).trim().slice(-300)]);
    },
  },
  {
    id: "G2",
    group: "grounding",
    title: "Code on screen is the source block, character for character",
    weight: 3,
    run(ctx) {
      const panels = [];
      for (const s of ctx.segments) {
        for (const f of s.frames) {
          for (const m of f.html.matchAll(/data-code="([^"]+)"[^>]*>([\s\S]*?)<!--\/code-->/g)) panels.push({ seg: s, f, id: m[1], inner: m[2] });
        }
      }
      const framed = ctx.segments.some((s) => s.frames.length);
      if (!framed) return skip("no frames");
      if (!panels.length) return fail(['no code panel is marked data-code="<block id>", so on-screen code cannot be checked against the source']);
      const ev = [];
      for (const p of panels) {
        const block = ctx.blocks.get(p.id);
        const shown = [...p.inner.matchAll(/data-codeline[^>]*>([\s\S]*?)<\/span>/g)].map((m) => unescapeHtml(m[1].replace(/<[^>]+>/g, "")));
        if (!block) ev.push(`${p.f.file.split("/segments/")[1]}: unknown block ${p.id}`);
        else if (shown.join("\n") !== block.text && !block.text.split("\n").join("\n").includes(shown.join("\n")))
          ev.push(`${p.f.file.split("/segments/")[1]}: code differs from ${p.id}`);
      }
      return ev.length ? fail(ev) : pass([`${panels.length} code panel(s) match`]);
    },
  },
  {
    id: "G3",
    group: "grounding",
    title: "Every example script runs, and every number its scenes show comes from its output or the source",
    weight: 2,
    run(ctx, env) {
      const ev = [];
      let ran = 0;
      for (const { seg, sc } of scenesOf(ctx)) {
        if (!sc.computedBy) continue;
        const by = join(seg.dir, sc.computedBy);
        if (!existsSync(by)) {
          ev.push(`${at(seg, sc.line)}: computed-by ${sc.computedBy} is missing`);
          continue;
        }
        const r = env.python(by, seg.dir);
        if (r === null) return skip("python unavailable");
        ran++;
        if (r.status !== 0) {
          ev.push(`${at(seg, sc.line)}: ${sc.computedBy} exits ${r.status}`);
          continue;
        }
        const src = sc.entries.flatMap((e) => e.source).map((id) => ctx.blocks.get(id)?.text ?? "").join(" ");
        const known = new Set([...(r.stdout + " " + src).matchAll(/\d+(?:[.,]\d+)*/g)].flatMap((m) => [m[0].replace(/,/g, ""), ...m[0].split(/[.,]/)]));
        for (const e of sc.entries) {
          const nums = [...e.display.replace(/O\([^)]*\)/g, "").matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/,/g, ""));
          const strange = nums.filter((n) => !known.has(n) && !/^[0-9]$/.test(n));
          if (strange.length) ev.push(`${at(seg, e.line)}: ${strange.join(", ")} not in ${sc.computedBy} output or its sources`);
        }
      }
      if (!ran && !ev.length) return skip("no computed-by scenes");
      return ev.length ? fail(ev) : pass([`${ran} script(s) ran`]);
    },
  },
];

// ── ease ──────────────────────────────────────────────────────────────────────────────────────────

const sentences = (t) => stripMarkers(t).split(/(?<=[.!?])\s+/).filter((s) => /\w/.test(s));

const ease = [
  {
    id: "E1",
    group: "ease",
    title: "Plain spoken language: average sentence ≤ 12 words, none over 28",
    weight: 2,
    run(ctx) {
      const all = ctx.segments.flatMap((s) => (s.script?.scenes ?? []).flatMap((sc) => sc.entries.flatMap((e) => sentences(e.spoken).map((x) => ({ s, e, x })))));
      if (!all.length) return skip("no narration");
      const words = all.map((a) => a.x.split(/\s+/).length);
      const avg = words.reduce((a, b) => a + b, 0) / words.length;
      const long = all.filter((a) => a.x.split(/\s+/).length > 28).map((a) => `${at(a.s, a.e.line)}: ${a.x.split(/\s+/).length} words`);
      const ev = [`average ${avg.toFixed(1)} words per sentence over ${all.length}`];
      return avg <= 12 && !long.length ? pass(ev) : fail([...ev, ...long]);
    },
  },
  {
    id: "E2",
    group: "ease",
    title: "One running example through the main parts (at most two distinct example inputs; the problem statement's own examples excepted)",
    weight: 1,
    run(ctx) {
      const arrays = new Map();
      for (const s of mainSegments(ctx)) {
        for (const sc of s.script?.scenes ?? []) {
          if ((sc.stage ?? "").toLowerCase() === "problem") continue;
          const text = [sc.onScreen ?? "", ...sc.entries.map((e) => e.display)].join(" ");
          // "[1, 2, 3, 1]" on screen, or "1, 2, 3, 1" as the lexicon writes a spoken example
          for (const m of text.matchAll(/\[(?:\s*-?\d+\s*,)+\s*-?\d+\s*\]|(?<![\d,]\s?)-?\d+(?:, -?\d+){2,}(?![\d,])/g)) {
            // the same values in another order (e.g. sorted) are the same example
            const k = "[" + m[0].replace(/[\s[\]]+/g, "").split(",").sort((a, b) => a - b).join(",") + "]";
            arrays.set(k, (arrays.get(k) ?? new Set()).add(s.id));
          }
        }
      }
      if (!arrays.size) return skip("no example arrays found");
      const list = [...arrays].map(([k, v]) => `${k} in part(s) ${[...v].join(", ")}`);
      return arrays.size <= 2 ? pass(list) : fail([`${arrays.size} different example inputs in the main parts`, ...list]);
    },
  },
  {
    id: "E3",
    group: "ease",
    title: "Main parts stay short: one idea, at most 75 s each (hook and bonus excepted)",
    weight: 1,
    run(ctx, env) {
      const ev = [];
      let measured = 0;
      for (const s of mainSegments(ctx).slice(1)) {
        const d = s.mp4 ? env.duration(s.mp4) : sbDuration(s.storyboard);
        if (d == null) continue;
        measured++;
        if (d > 75.5) ev.push(`segments/${s.id} "${s.script?.title ?? ""}": ${d.toFixed(1)}s`);
      }
      if (!measured) return skip("no durations");
      return ev.length ? fail(ev) : pass([`${measured} part(s) measured`]);
    },
  },
];

const sbDuration = (sb) => (sb ? [...sb.matchAll(/- duration: ([\d.]+)s/g)].reduce((a, m) => a + Number(m[1]), 0) || null : null);

// ── voice and audio ───────────────────────────────────────────────────────────────────────────────

const words = (t) => t.toLowerCase().replace(/[^a-z0-9.'\s-]/g, " ").split(/\s+/).filter(Boolean);

const audio = [
  {
    id: "V1",
    group: "voice",
    title: "Narration uses the channel's chosen voice",
    weight: 2,
    run(ctx) {
      const want = ctx.channel?.voice;
      if (!want) return fail(["channel.json has no voice: the choice is not recorded anywhere the pipeline reads"]);
      const voiced = ctx.segments.filter((s) => s.audioMeta || s.engineMeta);
      if (!voiced.length) return skip("no narration yet");
      const wrong = voiced
        .map((s) => ({ s, v: s.audioMeta?.voice_id ?? s.engineMeta?.voice_id ?? s.engineMeta?.voice }))
        .filter((x) => x.v !== want)
        .map((x) => `segments/${x.s.id}: voice ${x.v ?? "unknown"}, channel wants ${want}`);
      return wrong.length ? fail(wrong) : pass([want]);
    },
  },
  {
    id: "V2",
    group: "voice",
    title: "Captions carry the script's display layer word for word",
    weight: 2,
    run(ctx) {
      if (!ctx.files.captions) return skip("no captions.srt");
      const cap = words(ctx.files.captions.split("\n").filter((l) => l && !/^\d+$/.test(l) && !/-->/.test(l)).join(" "));
      const disp = words(ctx.segments.flatMap((s) => (s.script?.scenes ?? []).flatMap((sc) => sc.entries.map((e) => e.display))).join(" "));
      let i = 0;
      const missing = [];
      for (const w of disp) {
        const j = cap.indexOf(w, i);
        if (j < 0 || j - i > 6) missing.push(w);
        else i = j + 1;
      }
      return missing.length <= Math.max(2, disp.length * 0.005) ? pass([`${disp.length} display words`]) : fail([`${missing.length} display word(s) not found in order in captions.srt, e.g. ${missing.slice(0, 8).join(", ")}`]);
    },
  },
  {
    id: "V3",
    group: "voice",
    title: "Long silences are only scripted pauses, scene joins or the end hold",
    weight: 1,
    run(ctx, env) {
      const ev = [];
      let checked = 0;
      for (const s of ctx.segments) {
        if (!s.mp4 || !s.audioMeta || !s.storyboard) continue;
        const sil = env.silences(s.mp4);
        if (sil === null) return skip("ffmpeg unavailable");
        checked++;
        const durs = [...s.storyboard.matchAll(/- duration: ([\d.]+)s/g)].map((m) => Number(m[1]));
        const total = durs.reduce((a, b) => a + b, 0);
        let t = 0;
        const joins = durs.slice(0, -1).map((d) => (t += d));
        // a silence inside a take is scripted when its scene carries a marker ({beat} after a question
        // runs past 0.9s); without one it is a splice or a stall
        const marked = new Set((s.script?.scenes ?? []).filter((sc) => sc.entries.some((e) => /\{(beat|pause|think)\}/.test(e.spoken))).map((sc) => sc.n));
        for (const [start, dur] of sil) {
          if (start > total - 2.6 || start + dur > total - 0.3) continue; // the end hold, however long (an end screen)
          if (joins.some((j) => Math.abs(start + dur - j) < 1.3 || Math.abs(start - j) < 1.3)) continue;
          const frame = 1 + joins.filter((j) => j <= start).length;
          if (marked.has(frame)) continue;
          ev.push(`segments/${s.id}: ${dur.toFixed(1)}s silence at ${start.toFixed(1)}s in scene ${frame}, which has no pause marker`);
        }
      }
      if (!checked) return skip("no rendered segments");
      return ev.length ? fail(ev) : pass([`${checked} segment(s)`]);
    },
  },
];

// ── render ────────────────────────────────────────────────────────────────────────────────────────

const render = [
  {
    id: "R1",
    group: "render",
    title: "Every part is 1920x1080 at 30 fps",
    weight: 2,
    run(ctx, env) {
      const vids = ctx.segments.filter((s) => s.mp4);
      if (!vids.length) return skip("no rendered segments");
      const ev = [];
      for (const s of vids) {
        const p = env.probe(s.mp4);
        if (p === null) return skip("ffprobe unavailable");
        if (p.width !== 1920 || p.height !== 1080 || Math.round(p.fps) !== 30) ev.push(`segments/${s.id}: ${p.width}x${p.height} @ ${p.fps.toFixed(2)}fps`);
      }
      return ev.length ? fail(ev) : pass([`${vids.length} part(s)`]);
    },
  },
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
  {
    id: "R4",
    group: "render",
    title: "Code on screen is readable on a phone (code panels at 28px or more)",
    weight: 1,
    run(ctx) {
      const panels = ctx.segments.flatMap((s) => s.frames.flatMap((f) => [...f.html.matchAll(/data-code="([^"]+)"[^>]*font-size:(\d+)px/g)].map((m) => ({ f, id: m[1], px: Number(m[2]) }))));
      if (!ctx.segments.some((s) => s.frames.length)) return skip("no frames");
      if (!panels.length) return skip("no marked code panels");
      const small = panels.filter((p) => p.px < 28).map((p) => `${p.f.file.split("/segments/")[1]}: ${p.id} at ${p.px}px`);
      return small.length ? fail(small) : pass([`${panels.length} code panel(s) at 28px or more`]);
    },
  },
  {
    id: "R3",
    group: "render",
    title: "hyperframes check passes for every part (--deep only)",
    weight: 1,
    run(ctx, env) {
      if (!env.deep) return skip("pass --deep to run hyperframes check per part");
      const ev = [];
      for (const s of ctx.segments) {
        if (!existsSync(join(s.project, "index.html"))) continue;
        const r = env.hyperframesCheck(s.project);
        if (r && r.status !== 0) ev.push(`segments/${s.id}: hyperframes check failed`);
      }
      return ev.length ? fail(ev) : pass();
    },
  },
];

// ── notebook ──────────────────────────────────────────────────────────────────────────────────────

const notebook = [
  {
    id: "N1",
    group: "notebook",
    title: "Every notebook code cell runs, top to bottom",
    weight: 2,
    run(ctx, env) {
      const nb = ctx.files.notebook;
      if (!nb) return skip("no notebook.ipynb");
      const cells = nb.cells.filter((c) => c.cell_type === "code").map((c) => (Array.isArray(c.source) ? c.source.join("") : c.source));
      const r = env.runCells(cells);
      if (r === null) return skip("python unavailable");
      return r.failures.length ? fail(r.failures) : pass([`${cells.length} cell(s) ran`]);
    },
  },
];

export const CRITERIA = [...orientation, ...teaching, ...bonus, ...grounding, ...ease, ...audio, ...render, ...notebook];
export const GROUPS = ["orientation", "teaching", "bonus", "grounding", "ease", "voice", "render", "notebook"];
