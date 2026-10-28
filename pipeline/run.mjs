// run.mjs — the resumable build: run every stage whose inputs changed, stop where a person or an agent
// has to write or approve something, and say exactly what.
//
//   chalk pipeline <out> [--doc <source>] [--format youtube] [--only 03,07] [--from <stage>] [--jobs 3] [--notebook]
//   chalk pipeline approve <out> --scripts | --watched
//   chalk pipeline adopt <out>          record a build made by hand as up to date (nothing is run)
//   chalk status <out>                  what is done, stale or waiting, and why
//
// State lives in <out>/.chalk/pipeline.json: per stage (and segment) the hash of its inputs at its last
// good run. A stage reruns when that hash changes or an output is missing, so a changed script redoes
// that segment's voice and everything after it, a changed frame spec redoes only its frames and render,
// and an aligner fix redoes only alignment. Exit 0 when everything is done, 3 when it stopped to wait
// for a person or an agent, 1 when a command failed, 2 on a usage error.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { FORMATS } from "./stages.mjs";

const SKIP_DIRS = new Set(["node_modules", "__pycache__", ".git", "renders", "assets"]);

/** Hash of a file, or of every file under a directory; "missing" when it is not there. */
export function hashPath(p) {
  if (!existsSync(p)) return "missing";
  const h = createHash("sha1");
  const walk = (q) => {
    const st = statSync(q);
    if (st.isDirectory()) {
      for (const n of readdirSync(q).sort()) if (!SKIP_DIRS.has(n)) walk(join(q, n));
    } else {
      h.update(q.slice(p.length));
      h.update(readFileSync(q));
    }
  };
  walk(p);
  return h.digest("hex").slice(0, 16);
}

const stateFile = (out) => join(out, ".chalk", "pipeline.json");
export function readState(out) {
  const f = stateFile(out);
  const s = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  return { stages: {}, approvals: {}, opts: {}, ...s };
}
function writeState(out, s) {
  mkdirSync(join(out, ".chalk"), { recursive: true });
  writeFileSync(stateFile(out), JSON.stringify(s, null, 2) + "\n");
}

/** The real path, so /tmp and /private/tmp (or any symlinked workspace) hash as the same file. */
const real = (p) => (existsSync(p) ? realpathSync(p) : resolve(p));

function findChannel(out, given) {
  if (given) return real(given);
  for (let d = out; ; d = dirname(d)) {
    if (existsSync(join(d, "channel.json"))) return join(d, "channel.json");
    if (dirname(d) === d) return null;
  }
}

function segmentsOf(out) {
  const root = join(out, "segments");
  if (existsSync(root)) {
    const ids = readdirSync(root).filter((d) => /^\d\d$/.test(d) && existsSync(join(root, d, "script.md"))).sort();
    if (ids.length) return ids;
  }
  const lesson = join(out, "lesson.json");
  if (existsSync(lesson)) return (JSON.parse(readFileSync(lesson, "utf8")).segments ?? []).map((s) => s.id);
  const outline = join(out, "outline.md");
  if (!existsSync(outline)) return [];
  return [...readFileSync(outline, "utf8").matchAll(/^\|\s*(\d\d)\s*\|/gm)].map((m) => m[1]);
}

/** Everything a stage function needs to know about this output dir. */
export function context(out, opts = {}) {
  out = real(out);
  const state = readState(out);
  const channelPath = findChannel(out, opts.channel ?? state.opts.channel);
  return {
    out,
    state,
    doc: opts.doc ? resolve(opts.doc) : state.opts.doc,
    notebook: opts.notebook ?? state.opts.notebook ?? false,
    channelPath,
    channel: channelPath && existsSync(channelPath) ? JSON.parse(readFileSync(channelPath, "utf8")) : null,
    segments: segmentsOf(out),
  };
}

const abs = (o, p) => (isAbsolute(p) ? real(p) : join(o.out, p));
const key = (stage, nn) => (nn ? `${stage.name}:${nn}` : stage.name);
const inputHash = (o, stage, nn) => {
  const h = createHash("sha1");
  for (const p of stage.inputs(o, nn)) h.update(`${isAbsolute(p) ? real(p) : p}=${hashPath(abs(o, p))};`);
  return h.digest("hex").slice(0, 16);
};

/** One stage (for one segment) → { status: done|stale|todo|waiting, why }. Pure: reads files and state. */
export function check(o, stage, nn) {
  const outs = stage.outputs ? stage.outputs(o, nn) : [];
  const missing = outs.filter((p) => !existsSync(abs(o, p)));
  if (stage.kind === "author") {
    if (missing.length) return { status: "waiting", why: stage.missing.replace("NN", nn ?? "NN") };
    // an agent's report is stale once anything it read has changed since it was written
    const refs = (typeof stage.newerThan === "function" ? stage.newerThan(o, nn) : [stage.newerThan ?? []].flat())
      .filter((p) => existsSync(abs(o, p)));
    const newest = refs.reduce((a, p) => (statSync(abs(o, p)).mtimeMs > (a ? statSync(abs(o, a)).mtimeMs : -1) ? p : a), null);
    if (newest && outs.some((p) => statSync(abs(o, p)).mtimeMs < statSync(abs(o, newest)).mtimeMs)) {
      return { status: "waiting", why: `${outs.join(", ")} is older than ${newest}: ${stage.missing}` };
    }
    return { status: "done" };
  }
  const h = inputHash(o, stage, nn);
  if (stage.kind === "approve") {
    const got = o.state.approvals[stage.name];
    if (got === h) return { status: "done" };
    return { status: "waiting", why: got ? `changed since you approved it — ${stage.missing}` : stage.missing };
  }
  if (!stage.cmd(o, nn)) return missing.length ? { status: "waiting", why: stage.missing } : { status: "done" };
  const rec = o.state.stages[key(stage, nn)];
  if (missing.length) return { status: "todo", why: `${missing[0]} is not there` };
  if (!rec) return { status: "todo", why: "no good run on record (new, cleared by --from, or built by hand — chalk pipeline adopt records one)" };
  if (rec.hash !== h) return { status: "stale", why: "its inputs changed since the last run" };
  return { status: "done" };
}

/** The whole build in order: one row per stage, with a cell per segment for per-segment stages. */
export function plan(o, format = "youtube", { only } = {}) {
  const stages = FORMATS[format];
  const rows = [];
  // The first stage not done blocks what follows it: a whole-video stage blocks everything after it, a
  // segment's stage blocks that segment's later stages and every whole-video stage. A stage that looks
  // done behind a blocker is only done until the blocker reruns and changes its inputs, so it is shown as
  // waiting. An author stage with no `newerThan` stands alone: a frame spec does not go stale with a take.
  // Two kinds of blocker, each scoped like this: a whole-video stage blocks every later stage, a
  // segment's stage blocks that segment's later stages and the later whole-video stages.
  //   order — any stage not done: what follows cannot run before it
  //   stale — a stage not done that writes files: what follows reads them, so it will change too
  const scope = () => ({ whole: null, any: null, seg: {} });
  const order = scope(), stale = scope();
  const by = (b, nn) => (nn ? b.seg[nn] ?? b.whole : b.any);
  const mark = (b, name, nn) => {
    b.any ??= name;
    if (nn) b.seg[nn] ??= name;
    else b.whole ??= name;
  };
  for (const stage of stages) {
    const segs = stage.per === "segment" ? o.segments.filter((nn) => !only || only.includes(nn)) : [null];
    const dependent = stage.kind !== "author" || stage.newerThan;
    const writes = stage.kind === "run" && stage.outputs(o, segs[0]).length > 0;
    const cells = segs.map((nn) => {
      const c = check(o, stage, nn);
      if (c.status === "done") {
        const s = dependent && by(stale, nn);
        return s ? { nn, ...c, status: "todo", after: s, flipped: true } : { nn, ...c, after: null };
      }
      return { nn, ...c, after: by(order, nn) };
    });
    rows.push({ stage, cells });
    for (const c of cells) {
      if (c.status === "done") continue;
      mark(order, stage.name, c.nn);
      // what this stage will rewrite makes later readers stale; so does a reader that is itself going stale
      if (writes || c.flipped) mark(stale, c.flipped ? c.after : stage.name, c.nn);
    }
  }
  return rows;
}

function exec(o, argv) {
  return new Promise((done) => {
    const p = spawn(argv[0], argv.slice(1), { cwd: o.out, stdio: "inherit" });
    p.on("close", (code) => done(code ?? 1));
    p.on("error", () => done(127));
  });
}

async function pool(items, n, fn) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      results[k] = await fn(items[k]);
    }
  }));
  return results;
}

/** Run every stage that is not done, in order, until one waits or fails. */
export async function run(out, opts = {}) {
  out = real(out);
  const format = opts.format ?? "youtube";
  const stages = FORMATS[format];
  if (!stages) throw new Error(`unknown format "${format}"`);
  const state = readState(out);
  state.opts = { ...state.opts, format, ...(opts.doc ? { doc: resolve(opts.doc) } : {}), ...(opts.notebook ? { notebook: true } : {}),
    ...(opts.channel ? { channel: resolve(opts.channel) } : {}) };
  if (opts.from) {
    const i = stages.findIndex((s) => s.name === opts.from);
    if (i < 0) throw new Error(`no stage "${opts.from}" (${stages.map((s) => s.name).join(", ")})`);
    for (const s of stages.slice(i)) for (const k of Object.keys(state.stages)) {
      const [name, nn] = k.split(":");
      if (name === s.name && (!nn || !opts.only || opts.only.includes(nn))) delete state.stages[k];
    }
  }
  writeState(out, state);

  for (const stage of stages) {
    const o = context(out, opts);
    const segs = stage.per === "segment" ? o.segments.filter((nn) => !opts.only || opts.only.includes(nn)) : [null];
    const todo = segs.map((nn) => ({ nn, ...check(o, stage, nn) })).filter((c) => c.status !== "done");
    if (!todo.length) continue;
    const waiting = todo.filter((c) => c.status === "waiting");
    if (waiting.length) {
      const which = waiting.map((c) => c.nn).filter(Boolean);
      console.log(`\n⏸  ${stage.name}${which.length ? ` (${which.join(", ")})` : ""}: ${waiting[0].why}`);
      return 3;
    }
    const n = stage.jobs ? Math.max(1, opts.jobs ?? 3) : 1;
    const codes = await pool(todo, n, async (c) => {
      const h = inputHash(o, stage, c.nn);
      const cmds = stage.cmd(o, c.nn);
      const list = Array.isArray(cmds[0]) ? cmds : [cmds];
      console.log(`\n▶  ${stage.name}${c.nn ? ` ${c.nn}` : ""} (${c.why})`);
      let code = 0;
      for (const argv of list) if ((code = await exec(o, argv)) !== 0) break;
      if (code === 0 || stage.allowFail) {
        const s = readState(out);
        s.stages[key(stage, c.nn)] = { hash: h, at: new Date().toISOString(), ...(code ? { exit: code } : {}) };
        writeState(out, s);
      }
      return stage.allowFail ? 0 : code;
    });
    const bad = codes.map((code, i) => ({ code, nn: todo[i].nn })).filter((x) => x.code !== 0);
    if (bad.length) {
      console.log(`\n✗  ${stage.name}${bad[0].nn ? ` ${bad.map((b) => b.nn).join(", ")}` : ""} failed (exit ${bad[0].code})`);
      return 1;
    }
  }
  console.log("\n✓  everything is done");
  return 0;
}

/** Record the current inputs of every mechanical stage whose outputs exist, without running anything. */
export function adopt(out, opts = {}) {
  out = real(out);
  const o = context(out, opts);
  const state = o.state;
  let n = 0;
  for (const stage of FORMATS[opts.format ?? "youtube"]) {
    if (stage.kind !== "run") continue;
    for (const nn of stage.per === "segment" ? o.segments : [null]) {
      const outs = stage.outputs(o, nn);
      if (!stage.cmd(o, nn) || (outs.length && outs.some((p) => !existsSync(abs(o, p))))) continue;
      if (!outs.length && stage.name !== "text-gates") continue;
      state.stages[key(stage, nn)] = { hash: inputHash(o, stage, nn), at: new Date().toISOString(), adopted: true };
      n++;
    }
  }
  writeState(out, state);
  return n;
}

export function approve(out, name, opts = {}) {
  out = real(out);
  const o = context(out, opts);
  const stage = FORMATS[opts.format ?? "youtube"].find((s) => s.kind === "approve" && s.name.startsWith(name));
  if (!stage) throw new Error(`nothing to approve called "${name}"`);
  o.state.approvals[stage.name] = inputHash(o, stage, null);
  writeState(out, o.state);
  return stage.name;
}

export function status(out, opts = {}) {
  out = real(out);
  const o = context(out, opts);
  const icon = { done: "✓", stale: "↻", todo: "·", waiting: "⏸" };
  const lines = [`${out}  (${o.segments.length} segment(s)${o.channelPath ? `, ${o.channelPath}` : ""})`, ""];
  for (const { stage, cells } of plan(o, opts.format, opts)) {
    const left = cells.filter((c) => c.status !== "done");
    const head = `${left.length ? icon[left[0].status] : icon.done}  ${stage.name.padEnd(18)}`;
    if (!left.length) lines.push(`${head}done${cells.length > 1 ? ` (${cells.length})` : ""}`);
    else if (stage.per === "segment") {
      const by = new Map();
      for (const c of left) {
        const why = c.after ? `after ${c.after}` : `${c.status}: ${c.why}`;
        by.set(why, [...(by.get(why) ?? []), c.nn]);
      }
      lines.push(`${head}${[...by].map(([why, nns]) => `${nns.join(" ")} — ${why}`).join("; ")}`);
    } else {
      const c = left[0];
      lines.push(`${head}${c.after ? `after ${c.after}` : `${c.status}: ${c.why}`}`);
    }
  }
  return lines.join("\n");
}

export async function main(argv) {
  const val = (n) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
  const VALUED = ["--doc", "--format", "--only", "--from", "--jobs", "--channel"];
  const pos = argv.filter((a, i) => !a.startsWith("--") && !VALUED.includes(argv[i - 1]));
  const opts = {
    doc: val("doc"),
    format: val("format"),
    only: val("only")?.split(",").map((s) => s.trim().padStart(2, "0")),
    from: val("from"),
    jobs: val("jobs") ? Number(val("jobs")) : undefined,
    channel: val("channel"),
    notebook: argv.includes("--notebook") || undefined,
  };
  const [sub, out] = pos[0] === "approve" || pos[0] === "adopt" || pos[0] === "status" ? pos : [null, pos[0]];
  // the format given, else the one this dir was built as, else a lesson if it has a lesson.json
  opts.format ??= (out && readState(real(out)).opts.format) ?? (out && existsSync(join(out, "lesson.json")) ? "lesson" : "youtube");
  if (!FORMATS[opts.format]) {
    console.error(`chalk pipeline: format "${opts.format}" has no pipeline yet (${Object.keys(FORMATS).join(", ")})`);
    return 2;
  }
  if (!out) {
    console.error("usage: chalk pipeline <out> [--doc <source>] [--only NN,..] [--from <stage>] [--jobs 3] [--notebook]\n" +
      "       chalk pipeline approve <out> --scripts|--watched\n       chalk pipeline adopt <out>\n       chalk status <out>");
    return 2;
  }
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  if (sub === "status") {
    console.log(status(out, opts));
    return 0;
  }
  if (sub === "adopt") {
    console.log(`adopted ${adopt(out, opts)} stage run(s) as up to date`);
    console.log(status(out, opts));
    return 0;
  }
  if (sub === "approve") {
    const what = argv.includes("--scripts") ? "scripts" : argv.includes("--watched") ? "watched" : null;
    if (!what) {
      console.error("chalk pipeline approve: say what — --scripts or --watched");
      return 2;
    }
    console.log(`approved: ${approve(out, what, opts)}`);
    return 0;
  }
  try {
    return await run(out, opts);
  } catch (err) {
    console.error(`chalk pipeline: ${err.message}`);
    return 2;
  }
}
