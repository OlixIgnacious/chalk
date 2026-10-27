// shared.mjs — the criteria every format is scored on: grounding, plain speech, the voice and captions,
// the render and the notebook. A format adds its own pack (formats/<format>/eval/criteria.mjs).
//
// Each criterion: { id, group, title, weight, run(ctx, env) → { status: "pass"|"fail"|"skip", evidence: [] } }.
// `env` carries the side-effecting helpers (python, ffprobe, chalk-core) so the criteria stay readable and
// a fixture without media simply skips what it cannot measure. Judgement calls (is this explanation
// vague?) are not here: they belong to the chalk-reviewer agent, which reads this file's output.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { stripMarkers } from "./lib/load.mjs";
import { pass, fail, skip, scenesOf, mainSegments, at } from "./lib/kit.mjs";

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
      const framed = ctx.segments.some((s) => s.frames.length && s.script?.scenes.some((sc) => sc.code));
      if (!framed) return skip("no frames of a part that shows code");
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
  {
    id: "G4",
    group: "grounding",
    title: "Lines about the video itself (next part, the series, the notebook) cite [pipeline], not a block that does not say them",
    weight: 1,
    run(ctx) {
      const META = /\b(next (video|part|time|up|in the series)|in the series|this series|the notebook|part \d+ of|first of \w+ patterns)\b/i;
      const ev = [];
      let n = 0;
      for (const { seg, sc } of scenesOf(ctx)) for (const e of sc.entries) {
        const m = e.display.match(META);
        if (!m) continue;
        n++;
        if (e.source.includes("pipeline")) continue;
        const key = m[0].toLowerCase().match(/notebook|series|next|part|patterns/)?.[0] ?? m[0];
        const says = e.source.some((id) => (ctx.blocks.get(id)?.text ?? "").toLowerCase().includes(key));
        if (!says) ev.push(`${at(seg, e.line)}: "${e.display.slice(0, 60)}" cites [${e.source.join(", ")}], which never mention "${key}" — cite [pipeline]`);
      }
      if (!n) return skip("no lines about the video itself");
      return ev.length ? fail(ev) : pass([`${n} meta line(s)`]);
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
  {
    id: "E4",
    group: "ease",
    title: "No part is rushed: at most 2.8 spoken words a second over its takes, pauses included (a lesson 3.0; channel.json max_words_per_second overrides)",
    weight: 2,
    run(ctx) {
      // a lesson is planned at Kokoro's measured 2.85 words/s (formats/lesson step-2); a tutorial video slower
      const MAX = ctx.channel?.max_words_per_second ?? { lesson: 3.0 }[ctx.format] ?? 2.8;
      const rates = [];
      for (const s of mainSegments(ctx)) {
        const v = s.audioMeta?.voices;
        if (!v?.length) continue;
        const words = v.reduce((a, x) => a + (x.words?.length ?? 0), 0);
        const secs = v.reduce((a, x) => a + (x.duration_s ?? 0), 0);
        if (secs) rates.push({ s, rate: words / secs, words, secs });
      }
      if (!rates.length) return skip("no narration timings yet");
      const fast = rates.filter((r) => r.rate > MAX);
      const fmt = (r) => `segments/${r.s.id}: ${r.rate.toFixed(2)} words/s (${r.words} words in ${r.secs.toFixed(1)}s)`;
      return fast.length ? fail([...fast.map(fmt), `limit ${MAX}; split the part or give it {pause}s`])
        : pass([`fastest ${fmt(rates.reduce((a, b) => (b.rate > a.rate ? b : a)))}`]);
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
  {
    id: "R5",
    group: "render",
    title: "A reason the narration gives is readable when it is on screen: 36px or more",
    weight: 1,
    run(ctx) {
      const MIN = 36;
      const norm = (s) => s.toLowerCase().replace(/&#x27;|&#39;/g, "'").replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
      const ev = [];
      let checked = 0;
      for (const s of ctx.segments) {
        if (!s.frames.length || !s.script) continue;
        // the part of each narrated sentence that is its reason: from "because", "so", … to the end
        const tails = s.script.scenes.flatMap((sc) => sc.entries).map((e) => norm(e.display)).flatMap((d) => {
          const m = d.match(/\b(because|so that|so|since|which means|otherwise)\b(.*)$/);
          return m && m[2].trim().split(" ").length >= 2 ? [m[0]] : [];
        });
        if (!tails.length) continue;
        for (const f of s.frames) {
          for (const m of f.html.matchAll(/font-size:(\d+)px[^>]*>([^<]{8,120})</g)) {
            const text = norm(m[2]);
            if (text.split(" ").length < 4) continue; // a label ("should be false") is not a reason
            const bare = text.replace(/^(because|so that|so|since|which means|otherwise) /, "");
            if (!tails.some((tl) => tl.includes(bare))) continue;
            checked++;
            if (Number(m[1]) < MIN) ev.push(`${f.file.split("/segments/")[1] ?? f.file}: reason "${m[2].trim().slice(0, 50)}" is ${m[1]}px`);
          }
        }
      }
      if (!checked) return skip("no narrated reason found on screen");
      return ev.length ? fail([...ev.slice(0, 8), `${ev.length}/${checked} on-screen reasons under ${MIN}px`]) : pass([`${checked} on-screen reason(s) at ${MIN}px or more`]);
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

export const CRITERIA = [...grounding, ...ease, ...audio, ...render, ...notebook];
export const GROUPS = ["grounding", "ease", "voice", "render", "notebook"];
