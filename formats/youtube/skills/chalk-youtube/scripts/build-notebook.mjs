#!/usr/bin/env node
// build-notebook.mjs — the hands-on companion to the video, as a plain nbformat 4.5 notebook.
//
//   node build-notebook.mjs <output-dir> [--out notebook.ipynb]
//
// Reads chapter.json and video.json's `notebook` outline, and writes a notebook that stands alone: the
// problem, then each solution from the brute force up (its explanation and code from the source, verbatim,
// and a cell of example calls to change and rerun), then the practice list. It follows its own outline, not
// the video's parts, and says nothing about the video.
//
// buildNotebook runs nothing. The CLI and deliver then run every cell in order (executeNotebook) and store
// its output, so the notebook reads with its results; a number in it is always what the code printed. Python only — a block
// in another language, or one with no language tag, is listed in the notebook instead of becoming a
// cell, because running code nobody has read is not something this tool does on its own.
//
// A Python block that cannot run as a cell of its own — a fragment that does not compile alone (a
// template with a bare `return`), or one the manifest lists in `notebook.read_only` (code that raises on
// purpose) — is shown verbatim as "read, don't run" instead. `notebook.setup` names, per block, a segment
// file that runs first (e.g. building a table the block reads); it is labelled as setup. Each block appears
// once, the first time a segment cites it. The notebook is viewer-facing: it never names the source file.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, basename, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { notebookLinks } from "./kit.mjs";

/** This repo's core, called directly so it resolves wherever the output dir sits. */
const CORE = fileURLToPath(new URL("../../../../../core/bin/chalk-core.mjs", import.meta.url));

const PYTHON = new Set(["python", "py", "python3", "ipython"]);

/** nbformat stores a cell's source as lines that keep their newlines. */
const lines = (s) => s.split("\n").map((l, i, a) => (i < a.length - 1 ? l + "\n" : l));

/**
 * One example call as its own cell: the call alone, so the notebook shows its result and the learner edits it in
 * one place. `# raises X` after it catches X and prints it, so "Run all" still reaches the end.
 */
function exampleCell(call) {
  const m = call.match(/^(.*?)\s*#\s*raises\s+(\w+)\s*$/);
  if (!m) return call.trim();
  return `try:\n    ${m[1].trim()}\nexcept ${m[2]} as error:\n    print("${m[2]}:", error)`;
}

/** A link label left behind when the source's link was dropped: it points nowhere in a notebook. */
const DEAD_LINK = /\s*Open on LeetCode\s*$/;
/** Words that would send a reader to a book or a video the notebook does not have. */
const ELSEWHERE = /\b(chapter|section|week \d|the video|in the video|video \d)\b/i;

/**
 * The notebook stands alone: someone who never saw the video opens it, reads the problem, and runs each
 * solution from the brute force up. It follows `manifest.notebook.sections`, not the video's parts:
 *
 *   { "title": "Valid Anagram (LeetCode 242)",
 *     "sections": [ { "title": "The problem", "text": ["p024", "p025"] },
 *                   { "title": "Brute force", "text": ["p036"], "code": "c037", "after": ["p038"],
 *                     "run": ["is_anagram_brute(\"rat\", \"car\")"] }, ... ] }
 *
 * Every word of explanation and every line of code is a source block, verbatim; only the titles and the
 * example calls are written for the notebook. No tracer, no asserts, no timestamps, nothing about the video.
 */
export function buildNotebook({ chapter, manifest, readSegmentFile, fragments = new Map(), links = null }) {
  const cells = [];
  const skipped = [];
  const problems = [];
  let n = 0;
  const md = (text) => cells.push({ cell_type: "markdown", id: `m${++n}`, metadata: {}, source: lines(text) });
  const code = (text) =>
    cells.push({ cell_type: "code", id: `c${++n}`, metadata: {}, execution_count: null, outputs: [], source: lines(text) });

  const spec = manifest.notebook ?? {};
  const byId = new Map(chapter.blocks.map((b) => [b.id, b]));
  const readOnly = new Map([...fragments, ...Object.entries(spec.read_only ?? {})]);
  const setup = spec.setup ?? {};
  if (!spec.sections?.length) problems.push("video.json has no notebook.sections: list the problem, each solution and the practice list");

  const block = (id, where) => {
    const b = byId.get(id);
    if (!b) problems.push(`notebook ${where}: no block ${id} in chapter.json`);
    else if (b.kind !== "code" && ELSEWHERE.test(b.text)) problems.push(`notebook ${where}: ${id} points outside the notebook ("${b.text.match(ELSEWHERE)[0]}")`);
    return b;
  };
  // `trim: { "p050": [": see Follow-ups"] }` cuts named words from a block: only a pointer to a part of the source
  // the notebook leaves out, listed where the author can see it. Everything else is the block as written.
  const titles = (spec.sections ?? []).map((x) => x.title.toLowerCase());
  const trimmed = (b) => (spec.trim?.[b.id] ?? []).reduce((t, cut) => {
    if (!t.includes(cut)) problems.push(`notebook.trim for ${b.id}: "${cut}" is not in the block`);
    return t.replace(cut, "");
  }, b.text);
  const prose = (ids, where) => {
    for (const id of ids ?? []) {
      const b0 = block(id, where);
      if (!b0) continue;
      const b = { ...b0, text: trimmed(b0) };
      for (const m of b.text.matchAll(/\bsee ([A-Z][\w-]*(?: [A-Z][\w-]*)*)/g))
        if (!titles.some((t) => t.includes(m[1].toLowerCase()))) problems.push(`notebook ${where}: ${id} says "see ${m[1]}", and the notebook has no such section (add it, or list the words under notebook.trim)`);
      if (b.kind === "code") problems.push(`notebook ${where}: ${id} is code; list it under "code"`);
      else if (b.kind === "heading") md(`### ${b.text}`);
      // a numbered list item stands alone here, under its own section title: the number is the title's
      else if (b.kind === "list") md(b.text.replace(DEAD_LINK, "").replace(/^\d+\.\s+/, ""));
      else md(b.text.replace(DEAD_LINK, ""));
    }
  };

  const badge = links ? `[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](${links.colab})\n\n` : "";
  md(`# ${spec.title ?? manifest.title ?? chapter.title}\n\n${badge}` +
    "Run the cells in order. Below each solution are cells that call it on an example: change the inputs and run them again.\n");

  for (const sec of spec.sections ?? []) {
    const where = `section "${sec.title}"`;
    md(`## ${sec.title}\n`);
    prose(sec.text, where);
    for (const id of [sec.code ?? []].flat()) {
      const b = block(id, where);
      if (!b) continue;
      const lang = (b.lang ?? "").toLowerCase();
      if (b.kind !== "code") problems.push(`notebook ${where}: ${id} is not code`);
      else if (!PYTHON.has(lang)) {
        skipped.push({ id, why: lang ? `language: ${lang}` : "no language tag" });
        md(`\`\`\`${lang}\n${b.text}\n\`\`\``);
      } else if (readOnly.has(id)) {
        md(`Read this one, don't run it: ${readOnly.get(id)}.\n\n\`\`\`python\n${b.text}\n\`\`\``);
      } else {
        if (setup[id]) {
          const [sid, ...rest] = setup[id].replace(/^segments\//, "").split("/");
          const file = readSegmentFile(sid, rest.join("/"));
          if (file === null) problems.push(`notebook.setup for ${id} names ${setup[id]}, which is missing`);
          else {
            md("Run this first: it sets up the data the next cell uses.");
            code(file.replace(/\s+$/, ""));
          }
        }
        code(b.text);
      }
    }
    prose(sec.after, where);
    for (const call of sec.run ?? []) code(exampleCell(call));
  }

  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
      language_info: { name: "python" },
    },
    cells,
  };
  return { notebook, skipped, problems };
}

/**
 * Compile every code cell with Python's own compiler — `ast.parse` accepts a top-level `return`, which
 * then fails the moment the cell runs. IPython magics (`%x`, `!x`) are not Python, so they are blanked
 * out first. Returns [] when everything parses, or when no interpreter can be found —
 * in which case `checked` is false and the caller should say so rather than claim a pass.
 */
export function checkSyntax(notebook, python = process.env.CHALK_PYTHON || process.env.HYPERFRAMES_PYTHON || "python3") {
  const sources = notebook.cells
    .filter((c) => c.cell_type === "code")
    .map((c) => c.source.join("").split("\n").map((l) => (/^\s*[%!]/.test(l) ? "pass" : l)).join("\n"));
  const prog =
    "import json,sys\nbad=[]\n" +
    "for i,s in enumerate(json.load(sys.stdin)):\n" +
    "    try: compile(s, f'cell {i+1}', 'exec')\n" +
    "    except SyntaxError as e: bad.append([i,e.msg,e.lineno])\n" +
    "print(json.dumps(bad))\n";
  const r = spawnSync(python, ["-c", prog], { input: JSON.stringify(sources), encoding: "utf8" });
  if (r.error || r.status !== 0) return { checked: false, errors: [] };
  return { checked: true, errors: JSON.parse(r.stdout) };
}

/**
 * Run the code cells in order in one namespace, as a kernel would, and store what each printed and the value
 * of its last expression, so the notebook reads with its results before anyone runs it. The outputs come from
 * running the cells, never from anywhere else. Returns { ran: false } when no interpreter can be found.
 */
export function executeNotebook(notebook, python = process.env.CHALK_PYTHON || process.env.HYPERFRAMES_PYTHON || "python3") {
  const cells = notebook.cells.filter((c) => c.cell_type === "code");
  const prog = `
import ast, contextlib, io, json, linecache, sys, traceback
ns, out = {"__name__": "__main__"}, []
for i, src in enumerate(json.load(sys.stdin)):
    name = f"<cell {i + 1}>"
    linecache.cache[name] = (len(src), None, src.splitlines(True), name)
    buf, value, error = io.StringIO(), None, None
    try:
        tree = ast.parse(src)
        last = tree.body.pop() if tree.body and isinstance(tree.body[-1], ast.Expr) else None
        with contextlib.redirect_stdout(buf):
            exec(compile(tree, name, "exec"), ns)
            if last is not None:
                v = eval(compile(ast.Expression(last.value), name, "eval"), ns)
                value = None if v is None else repr(v)
    except BaseException as e:
        error = [type(e).__name__, str(e)]
    out.append([buf.getvalue(), value, error])
print(json.dumps(out))
`;
  const r = spawnSync(python, ["-c", prog], { input: JSON.stringify(cells.map((c) => c.source.join(""))), encoding: "utf8" });
  if (r.error || r.status !== 0) return { ran: false, errors: [] };
  const errors = [];
  JSON.parse(r.stdout.trim().split("\n").at(-1)).forEach(([stdout, value, error], i) => {
    const c = cells[i];
    c.execution_count = i + 1;
    c.outputs = [];
    if (stdout) c.outputs.push({ output_type: "stream", name: "stdout", text: lines(stdout) });
    if (value !== null) c.outputs.push({ output_type: "execute_result", execution_count: i + 1, metadata: {}, data: { "text/plain": lines(value) } });
    if (error) errors.push(`code cell ${i + 1}: ${error[0]}: ${error[1]}`);
  });
  return { ran: true, errors };
}

/** Python code blocks that do not compile as a program of their own: id → why, for "read, don't run". */
export function findFragments(chapter, python = process.env.CHALK_PYTHON || process.env.HYPERFRAMES_PYTHON || "python3") {
  const blocks = chapter.blocks.filter((b) => b.kind === "code" && PYTHON.has((b.lang ?? "").toLowerCase()));
  const r = spawnSync(python, ["-c", "import json,sys\nout={}\nfor i,s in json.load(sys.stdin):\n    try: compile(s,i,'exec')\n    except SyntaxError as e: out[i]=e.msg\nprint(json.dumps(out))"], {
    input: JSON.stringify(blocks.map((b) => [b.id, b.text])),
    encoding: "utf8",
  });
  if (r.error || r.status !== 0) return new Map();
  return new Map(Object.entries(JSON.parse(r.stdout)).map(([id, msg]) => [id, `it is a fragment, not a whole program (${msg})`]));
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────

/** Scenes per segment id, from chalk-core's own parser so grounding has one definition. */
export function loadScenes(outDir, segments) {
  const files = segments.map((s) => join(outDir, "segments", s.id, "script.md")).filter(existsSync);
  const by = {};
  if (!files.length) return by;
  const r = spawnSync(process.execPath, [CORE, "check-readability", ...files, "--json"], { encoding: "utf8" });
  if (r.error || (r.status !== 0 && r.status !== 1)) throw new Error(`chalk-core check-readability failed: ${r.error?.message ?? r.stderr}`);
  for (const f of JSON.parse(r.stdout).files) by[basename(dirname(f.file))] = f.scenes;
  return by;
}

/** The channel.json nearest above the output dir, or null. */
function nearestChannel(dir) {
  for (let d = dir; ; d = dirname(d)) {
    const f = join(d, "channel.json");
    if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
    if (dirname(d) === d) return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const die = (m) => {
    console.error("build-notebook:", m);
    process.exit(2);
  };
  const outDir = resolve(argv.find((a) => !a.startsWith("--")) ?? ".");
  const oi = argv.indexOf("--out");
  const outFile = oi >= 0 ? resolve(argv[oi + 1] ?? die("--out needs a value")) : join(outDir, "notebook.ipynb");
  const readJson = (f) => {
    try {
      return JSON.parse(readFileSync(f, "utf8"));
    } catch (e) {
      return die(`cannot read ${f} — ${e.message}`);
    }
  };
  const chapter = readJson(join(outDir, "chapter.json"));
  const manifest = readJson(join(outDir, "video.json"));
  const { notebook, skipped, problems } = buildNotebook({
    chapter,
    manifest,
    fragments: findFragments(chapter),
    links: notebookLinks(nearestChannel(outDir), manifest),
    readSegmentFile: (id, f) => {
      const p = join(outDir, "segments", id, f);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    },
  });
  if (problems.length) {
    console.error("build-notebook:\n  " + problems.join("\n  "));
    process.exit(1);
  }
  const { checked, errors } = checkSyntax(notebook);
  if (errors.length) {
    console.error(`build-notebook: ${errors.length} cell(s) are not valid Python:\n  ` +
      errors.map(([i, msg, line]) => `code cell ${i + 1}: ${msg} (line ${line})`).join("\n  "));
    process.exit(1);
  }
  if (!checked) console.warn("build-notebook: no Python interpreter found, so cell syntax was not checked.");
  const run = executeNotebook(notebook);
  if (run.errors.length) {
    console.error("build-notebook: a cell fails when run in order:\n  " + run.errors.join("\n  "));
    process.exit(1);
  }
  if (!run.ran) console.warn("build-notebook: no Python interpreter found, so the notebook is written without outputs.");
  writeFileSync(outFile, JSON.stringify(notebook, null, 1) + "\n");
  for (const s of skipped) console.warn(`build-notebook: skipped ${s.id} (${s.why})`);
  console.log(`build-notebook: ${notebook.cells.length} cells → ${outFile}`);
}
