#!/usr/bin/env node
// run.mjs — score a chalk-youtube output dir as a tutorial.
//
//   node evals/run.mjs <output-dir> [--channel <channel.json>] [--deep] [--json] [--no-write]
//
// Writes <output-dir>/eval.json and eval.md: every criterion in criteria.mjs with pass / fail / skip,
// its evidence (file:line, timestamp) and its weight, and a score over the criteria that ran. Exit code
// 1 when any criterion fails, so it can gate a build. Judgement calls are the chalk-reviewer agent's job;
// it reads this report first.

import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "./lib/load.mjs";
import { CRITERIA, GROUPS } from "./criteria.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function makeEnv({ deep = false } = {}) {
  const py = [process.env.CHALK_PYTHON, process.env.HYPERFRAMES_PYTHON, join(root, ".venv/bin/python")].find((p) => p && existsSync(p)) ?? "python3";
  const run = (cmd, args, opts = {}) => {
    const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 26, timeout: 120000, ...opts });
    return r.error ? null : r;
  };
  const cache = new Map();
  const memo = (k, f) => (cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k)));
  return {
    deep,
    python: (script, cwd) => memo(`py:${script}`, () => run(py, ["-I", script], { cwd })),
    chalkCore: (args) => run("npx", ["chalk-core", ...args], { cwd: root }),
    hyperframesCheck: (project) => run("npx", ["hyperframes", "check"], { cwd: project, timeout: 600000 }),
    duration: (file) =>
      memo(`dur:${file}`, () => {
        const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
        return r && r.status === 0 ? Number(r.stdout.trim()) : null;
      }),
    probe: (file) => {
      const r = run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", file]);
      if (!r || r.status !== 0) return null;
      const s = JSON.parse(r.stdout).streams[0];
      const [a, b] = s.r_frame_rate.split("/").map(Number);
      return { width: s.width, height: s.height, fps: a / (b || 1) };
    },
    silences: (file) => {
      const r = run("ffmpeg", ["-hide_banner", "-i", file, "-af", "silencedetect=n=-45dB:d=0.9", "-f", "null", "-"]);
      if (!r) return null;
      return [...r.stderr.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    },
    runCells: (cells) => {
      const harness = `
import json, sys, io, contextlib
cells = json.load(sys.stdin); g = {}; bad = []
for i, src in enumerate(cells):
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            exec(compile(src, f"cell {i + 1}", "exec"), g)
    except BaseException as e:
        bad.append(f"cell {i + 1} ({src.splitlines()[0][:50] if src.strip() else 'empty'}): {type(e).__name__}: {e}")
print(json.dumps(bad))
`;
      const r = run(py, ["-c", harness], { input: JSON.stringify(cells) });
      if (!r || r.status !== 0) return null;
      return { failures: JSON.parse(r.stdout.trim().split("\n").at(-1)) };
    },
  };
}

export function evaluate(outDir, { channelPath, deep = false, env = makeEnv({ deep }) } = {}) {
  const ctx = load(outDir, { channelPath });
  const results = CRITERIA.map((c) => {
    let r;
    try {
      r = c.run(ctx, env);
    } catch (err) {
      r = { status: "fail", evidence: [`criterion crashed: ${err.message}`] };
    }
    return { id: c.id, group: c.group, title: c.title, weight: c.weight, ...r };
  });
  const ran = results.filter((r) => r.status !== "skip");
  const max = ran.reduce((a, r) => a + r.weight, 0);
  const got = ran.filter((r) => r.status === "pass").reduce((a, r) => a + r.weight, 0);
  const groups = Object.fromEntries(
    GROUPS.map((g) => {
      const rs = results.filter((r) => r.group === g);
      const st = rs.some((r) => r.status === "fail") ? "fail" : rs.every((r) => r.status === "skip") ? "skip" : "pass";
      return [g, st];
    }),
  );
  return { dir: ctx.dir, channel: ctx.channelPath, score: got, max, percent: max ? Math.round((100 * got) / max) : 0, groups, results };
}

export function toMarkdown(report) {
  const icon = { pass: "✅", fail: "❌", skip: "⏭️" };
  const lines = [
    `# Tutorial eval — ${report.dir.split("/").slice(-1)[0]}`,
    "",
    `**Score: ${report.score} / ${report.max} (${report.percent}%)** over the criteria that ran.`,
    "",
    "| Group | Verdict |",
    "|---|---|",
    ...Object.entries(report.groups).map(([g, s]) => `| ${g} | ${icon[s]} ${s} |`),
    "",
    "| | Criterion | Weight | Evidence |",
    "|---|---|---|---|",
    ...report.results.map(
      (r) => `| ${icon[r.status]} ${r.id} | ${r.title} | ${r.weight} | ${(r.evidence ?? []).slice(0, 6).map((e) => String(e).replace(/\|/g, "\\|")).join("<br>")}${(r.evidence ?? []).length > 6 ? `<br>…and ${r.evidence.length - 6} more` : ""} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flag = (n) => argv.includes(`--${n}`);
  const val = (n) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
  const outDir = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--channel");
  if (!outDir) {
    console.error("usage: node evals/run.mjs <output-dir> [--channel <channel.json>] [--deep] [--json] [--no-write]");
    process.exit(2);
  }
  const report = evaluate(outDir, { channelPath: val("channel"), deep: flag("deep") });
  if (!flag("no-write")) {
    writeFileSync(join(report.dir, "eval.json"), JSON.stringify(report, null, 2) + "\n");
    writeFileSync(join(report.dir, "eval.md"), toMarkdown(report));
  }
  if (flag("json")) console.log(JSON.stringify(report, null, 2));
  else {
    for (const r of report.results) console.log(`${r.status.padEnd(4)} ${r.id} ${r.title}${r.status === "fail" ? `\n       ${r.evidence.slice(0, 3).join("\n       ")}` : ""}`);
    console.log(`\neval: ${report.score}/${report.max} (${report.percent}%) — ${Object.entries(report.groups).map(([g, s]) => `${g} ${s}`).join(", ")}`);
  }
  process.exit(report.results.some((r) => r.status === "fail") ? 1 : 0);
}
