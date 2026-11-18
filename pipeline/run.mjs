// run.mjs — the resumable build: run every stage whose inputs changed, stop where a person or an agent
// has to write or approve something, and say exactly what.
//
//   chalk pipeline <out> [--doc <source> [--kind document|script] | --topic "…"] [--format long|lesson|short] [--only 03,07] [--from <stage>] [--jobs 3] [--notebook]
//   chalk pipeline approve <out> --research | --scripts | --watched
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
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync, renameSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { FORMATS } from "./stages.mjs";
import { shapeOf, detectShape } from "../formats/index.mjs";

/** A format's stage list name: "youtube" is "long"; any other name (a test's own) is itself. */
const fmt = (f) => shapeOf(f ?? "long") ?? f;

const SKIP_DIRS = new Set(["node_modules", "__pycache__", ".git", "renders", "assets"]);

/** Files read to hash them, for the tests: an untouched file is hashed from the cache, not re-read. */
export const hashStats = { reads: 0 };

/** Every file under p (or p itself), in hashing order, as [path, stat]. */
function filesOf(p) {
  const files = [];
  const walk = (q) => {
    const st = statSync(q, { bigint: true });
    if (st.isDirectory()) {
      for (const n of readdirSync(q).sort()) if (!SKIP_DIRS.has(n)) walk(join(q, n));
    } else files.push([q, st]);
  };
  walk(p);
  return files;
}

/** Hash of a file, or of every file under a directory; "missing" when it is not there.
 *
 * With a cache (see hashCacheFor), a path whose files all have the size and mtime they had last time
 * returns the hash recorded then, without reading them: the status a UI polls every few seconds would
 * otherwise re-read every video it depends on. The hash itself is the same either way. */
export function hashPath(p, cache) {
  if (!existsSync(p)) return "missing";
  const files = filesOf(p);
  let sig;
  if (cache) {
    sig = createHash("sha1");
    for (const [q, st] of files) sig.update(`${q.slice(p.length)}\0${st.size}\0${st.mtimeNs}\n`);
    sig = sig.digest("hex");
    const hit = cache.data[p];
    if (hit && hit.sig === sig) return hit.hash;
  }
  const h = createHash("sha1");
  for (const [q] of files) {
    h.update(q.slice(p.length));
    h.update(readFileSync(q));
    hashStats.reads++;
  }
  const hash = h.digest("hex").slice(0, 16);
  if (cache) {
    cache.data[p] = { sig, hash };
    cache.dirty = true;
  }
  return hash;
}

/** One hash cache per output dir, kept in <out>/.chalk/hashcache.json and written once when the process exits. */
const hashCaches = new Map();
export function hashCacheFor(out) {
  if (hashCaches.has(out)) return hashCaches.get(out);
  const file = join(out, ".chalk", "hashcache.json");
  let data = {};
  try {
    data = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  } catch {
    data = {}; // a torn or corrupt cache only costs a full re-hash
  }
  const cache = { file, data, dirty: false };
  hashCaches.set(out, cache);
  if (hashCaches.size === 1) process.on("exit", flushHashCaches);
  return cache;
}
export function flushHashCaches() {
  for (const c of hashCaches.values()) {
    if (!c.dirty) continue;
    try {
      mkdirSync(dirname(c.file), { recursive: true });
      const tmp = `${c.file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(c.data));
      renameSync(tmp, c.file);
      c.dirty = false;
    } catch {
      // best effort: the next run re-hashes
    }
  }
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
    let ids = readdirSync(root).filter((d) => /^\d\d$/.test(d) && existsSync(join(root, d, "script.md"))).sort();
    // a part cut from video.json keeps its folder on disk, but is no longer built (the eval reads the same list)
    try {
      const listed = JSON.parse(readFileSync(join(out, "video.json"), "utf8")).segments?.map((s) => s.id);
      if (listed?.length) ids = ids.filter((d) => listed.includes(d));
    } catch { /* no video.json yet */ }
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
    // a research build has no document when it starts: its approved brief is the document it ingests
    doc: opts.doc ? resolve(opts.doc) : state.opts.doc ??
      ((opts.topic ?? state.opts.topic) && state.approvals["research-approved"] && existsSync(join(out, "research.md")) ? join(out, "research.md") : undefined),
    topic: opts.topic ?? state.opts.topic,
    kind: opts.kind ?? state.opts.kind ?? ((opts.topic ?? state.opts.topic) ? "research" : undefined),
    notebook: opts.notebook ?? state.opts.notebook ?? false,
    channelPath,
    channel: channelPath && existsSync(channelPath) ? JSON.parse(readFileSync(channelPath, "utf8")) : null,
    segments: segmentsOf(out),
    hashCache: hashCacheFor(out),
  };
}

const abs = (o, p) => (isAbsolute(p) ? real(p) : join(o.out, p));
const key = (stage, nn) => (nn ? `${stage.name}:${nn}` : stage.name);
const inputHash = (o, stage, nn) => {
  const h = createHash("sha1");
  for (const p of stage.inputs(o, nn)) {
    // { path, only }: the stage depends on part of a file (narration on a script's spoken lines, not its citations)
    if (typeof p === "object") {
      const f = abs(o, p.path);
      const part = existsSync(f) ? createHash("sha1").update(p.only(readFileSync(f, "utf8"))).digest("hex").slice(0, 16) : "missing";
      h.update(`${p.path}[${p.as}]=${part};`);
    } else h.update(`${isAbsolute(p) ? real(p) : p}=${hashPath(abs(o, p), o.hashCache)};`);
  }
  return h.digest("hex").slice(0, 16);
};

/** One stage (for one segment) → { status: done|stale|todo|waiting, why }. Pure: reads files and state. */
export function check(o, stage, nn) {
  // a stage this build has no use for (research, when the source is a document) is done by not applying
  if (stage.skip?.(o)) return { status: "done" };
  if (stage.gate) return stage.gate(o, nn);
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
export function plan(o, format = "long", { only } = {}) {
  const stages = FORMATS[fmt(format)];
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
    const dependent = !["author", "gate"].includes(stage.kind) || stage.newerThan;
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
  const format = fmt(opts.format);
  const stages = FORMATS[format];
  if (!stages) throw new Error(`unknown format "${format}"`);
  const state = readState(out);
  state.opts = { ...state.opts, format, ...(opts.doc ? { doc: resolve(opts.doc) } : {}), ...(opts.notebook ? { notebook: true } : {}),
    ...(opts.channel ? { channel: resolve(opts.channel) } : {}), ...(opts.topic ? { topic: opts.topic } : {}),
    ...(opts.kind ? { kind: opts.kind } : {}) };
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

/** True when the oldest output is older than the newest file among the stage's inputs (by mtime). */
function olderThanInputs(o, stage, nn, outs) {
  const newest = (p) => {
    const f = abs(o, p);
    if (!existsSync(f)) return 0n;
    return filesOf(f).reduce((m, [, st]) => (st.mtimeNs > m ? st.mtimeNs : m), 0n);
  };
  const oldestOut = outs.map((p) => statSync(abs(o, p), { bigint: true }).mtimeNs).reduce((a, b) => (a < b ? a : b));
  // a { path, only } input is a view of part of a file (the spoken lines of a lexicon): its mtime says nothing,
  // so a heard-form edit can still be adopted without re-narrating
  const ins = stage.inputs(o, nn).filter((p) => typeof p !== "object");
  return ins.some((p) => newest(p) > oldestOut);
}

/** Record the current inputs of every mechanical stage whose outputs exist, without running anything. */
export function adopt(out, opts = {}) {
  out = real(out);
  const o = context(out, opts);
  const state = o.state;
  let n = 0;
  for (const stage of FORMATS[fmt(opts.format)]) {
    if (stage.kind !== "run") continue;
    // opts.stages: adopt only these (a recut adopts its reused narration and nothing it has not checked)
    if (opts.stages && !opts.stages.includes(stage.name)) continue;
    for (const nn of stage.per === "segment" ? o.segments : [null]) {
      const outs = stage.outputs(o, nn);
      if ((!stage.cmd(o, nn) && !opts.stages) || (outs.length && outs.some((p) => !existsSync(abs(o, p))))) continue;
      if (!outs.length && stage.name !== "text-gates") continue;
      // an output older than an input it is built from was not built from these inputs: leave it stale
      if (outs.length && olderThanInputs(o, stage, nn, outs)) continue;
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
  const stage = FORMATS[fmt(opts.format)].find((s) => s.kind === "approve" && s.name.startsWith(name));
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

/** The same picture as status(), for a program (the UI): every stage with a cell per segment. */
export function statusJson(out, opts = {}) {
  out = real(out);
  const o = context(out, opts);
  const format = fmt(opts.format);
  return {
    out,
    format,
    segments: o.segments,
    channel: o.channelPath,
    doc: o.doc ?? null,
    notebook: o.notebook,
    approvals: Object.keys(o.state.approvals),
    stages: plan(o, format, opts).map(({ stage, cells }) => ({
      name: stage.name,
      kind: stage.kind,
      per: stage.per ?? null,
      cells: cells.map(({ nn, status, why, after }) => ({ nn: nn ?? null, status, why: why ?? null, after: after ?? null,
        outputs: stage.outputs ? stage.outputs(o, nn ?? undefined) : [] })),
    })),
  };
}

export async function main(argv) {
  const val = (n) => (argv.indexOf(`--${n}`) >= 0 ? argv[argv.indexOf(`--${n}`) + 1] : undefined);
  const VALUED = ["--doc", "--format", "--only", "--from", "--jobs", "--channel", "--topic", "--kind"];
  const pos = argv.filter((a, i) => !a.startsWith("--") && !VALUED.includes(argv[i - 1]));
  const opts = {
    doc: val("doc"),
    format: val("format"),
    only: val("only")?.split(",").map((s) => s.trim().padStart(2, "0")),
    from: val("from"),
    jobs: val("jobs") ? Number(val("jobs")) : undefined,
    channel: val("channel"),
    topic: val("topic"),
    kind: val("kind"),
    notebook: argv.includes("--notebook") || undefined,
  };
  const [sub, out] = pos[0] === "approve" || pos[0] === "adopt" || pos[0] === "status" ? pos : [null, pos[0]];
  // the format given, else the one this dir was built as, else a lesson if it has a lesson.json
  // a build recorded as "youtube" is the long shape under its old name
  opts.format ??= (out && readState(real(out)).opts.format) ?? detectShape(out);
  opts.format = fmt(opts.format);
  if (!FORMATS[opts.format]) {
    console.error(`chalk pipeline: format "${opts.format}" has no pipeline yet (${Object.keys(FORMATS).join(", ")})`);
    return 2;
  }
  if (!out) {
    console.error("usage: chalk pipeline <out> [--doc <source>] [--only NN,..] [--from <stage>] [--jobs 3] [--notebook]\n" +
      "       chalk pipeline approve <out> --research|--scripts|--watched\n       chalk pipeline adopt <out>\n       chalk status <out>");
    return 2;
  }
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  if (sub === "status") {
    console.log(argv.includes("--json") ? JSON.stringify(statusJson(out, opts), null, 2) : status(out, opts));
    return 0;
  }
  if (sub === "adopt") {
    console.log(`adopted ${adopt(out, opts)} stage run(s) as up to date`);
    console.log(status(out, opts));
    return 0;
  }
  if (sub === "approve") {
    // agents launched by the UI run with this set: a gate is the person's to pass, never an agent's
    if (process.env.CHALK_NO_APPROVE) {
      console.error("chalk pipeline approve: approvals are the person's — this process may not approve");
      return 2;
    }
    const what = argv.includes("--scripts") ? "scripts" : argv.includes("--watched") ? "watched" : argv.includes("--research") ? "research-approved" : null;
    if (!what) {
      console.error("chalk pipeline approve: say what — --research, --scripts or --watched");
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
