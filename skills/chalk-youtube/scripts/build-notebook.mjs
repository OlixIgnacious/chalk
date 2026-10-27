#!/usr/bin/env node
// build-notebook.mjs — the hands-on companion to the video, as a plain nbformat 4.5 notebook.
//
//   node build-notebook.mjs <output-dir> [--out notebook.ipynb]
//
// Reads chapter.json, video.json and each segment's script.md (through chalk-core's gate parser),
// and writes one section per segment: the chapter's own code verbatim, the script that computes any
// derived example, and a try-it stub for each exercise the segment cites.
//
// Nothing here runs code, and no output is recorded: a cell's result is produced when someone runs
// it, so a number in the notebook can never drift from the code that makes it. Python only — a block
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
import { pathToFileURL } from "node:url";
import { stamp } from "./kit.mjs";

const PYTHON = new Set(["python", "py", "python3", "ipython"]);

/** nbformat stores a cell's source as lines that keep their newlines. */
const lines = (s) => s.split("\n").map((l, i, a) => (i < a.length - 1 ? l + "\n" : l));

export function buildNotebook({ chapter, manifest, scenesBySegment, starts, readSegmentFile, fragments = new Map() }) {
  const cells = [];
  const skipped = [];
  const problems = [];
  let n = 0;
  const md = (text) => cells.push({ cell_type: "markdown", id: `m${++n}`, metadata: {}, source: lines(text) });
  const code = (text) =>
    cells.push({ cell_type: "code", id: `c${++n}`, metadata: {}, execution_count: null, outputs: [], source: lines(text) });

  const byId = new Map(chapter.blocks.map((b) => [b.id, b]));
  md(
    `# ${manifest.title ?? chapter.title}\n\n` +
      "The hands-on companion to the video. Run the cells top to bottom; outputs are produced when you " +
      "run them, not stored here.\n",
  );
  const readOnly = new Map([...fragments, ...Object.entries(manifest.notebook?.read_only ?? {})]);
  const setup = manifest.notebook?.setup ?? {};

  const used = new Set();
  for (const [i, seg] of manifest.segments.entries()) {
    const scenes = scenesBySegment[seg.id] ?? [];
    const cited = new Set(scenes.flatMap((s) => s.entries.flatMap((e) => e.source ?? [])));
    const at = starts?.[i] !== undefined ? ` · video ${stamp(starts[i])}` : "";
    md(`## ${String(i + 1).padStart(2, "0")} · ${seg.title}${at}\n`);

    // The chapter's own code, in chapter order, exactly as written.
    for (const b of chapter.blocks) {
      if (b.kind !== "code" || !cited.has(b.id) || used.has(b.id)) continue;
      used.add(b.id);
      const lang = (b.lang ?? "").toLowerCase();
      if (PYTHON.has(lang) && readOnly.has(b.id)) {
        md(`Read this one, don't run it: ${readOnly.get(b.id)}.\n\n\`\`\`python\n${b.text}\n\`\`\``);
      } else if (PYTHON.has(lang)) {
        if (setup[b.id]) {
          const [sid, ...rest] = setup[b.id].replace(/^segments\//, "").split("/");
          const body = readSegmentFile(sid, rest.join("/"));
          if (body === null) problems.push(`notebook.setup for ${b.id} names ${setup[b.id]}, which is missing`);
          else code(`# setup for the next cell\n${body.replace(/\s+$/, "")}`);
        }
        code(`# source: ${b.id}\n${b.text}`);
      } else {
        const why = lang ? `language: ${lang}` : "no language tag";
        skipped.push({ id: b.id, why });
        md(`_\`${b.id}\` is not included as a cell (${why}). Notebooks here are Python only._`);
      }
    }

    // Derived examples: the script is the only source of the numbers the video showed.
    for (const sc of scenes) {
      if (sc.example !== "derived") continue;
      const file = sc.computedBy ?? "";
      const body = file ? readSegmentFile(seg.id, file) : null;
      if (body === null) {
        problems.push(`segment ${seg.id}: scene "${sc.title}" computes its example in ${file || "(nothing)"}, which is missing`);
        continue;
      }
      if (!file.endsWith(".py")) {
        skipped.push({ id: file, why: "derived example is not Python" });
        md(`_The example in \`${file}\` is not Python, so it is not included as a cell._`);
        continue;
      }
      md(`The numbers in the video's "${sc.title}" scene come from this cell.`);
      code(`# computed-by: ${file}\n${body.replace(/\s+$/, "")}`);
    }

    // Exercises this segment cites become try-it stubs.
    for (const b of chapter.blocks) {
      if (b.kind !== "exercise" || !cited.has(b.id)) continue;
      used.add(b.id);
      md(`**Try it** (\`${b.id}\`). ${b.text}`);
      code("# your code here\n");
    }
  }

  const rest = chapter.blocks.filter((b) => b.kind === "exercise" && !used.has(b.id));
  if (rest.length) {
    md("## More to try\n");
    for (const b of rest) {
      md(`**Try it** (\`${b.id}\`). ${b.text}`);
      code("# your code here\n");
    }
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
  const r = spawnSync("npx", ["chalk-core", "check-readability", ...files, "--json"], { encoding: "utf8" });
  if (r.error || (r.status !== 0 && r.status !== 1)) throw new Error(`chalk-core check-readability failed: ${r.error?.message ?? r.stderr}`);
  for (const f of JSON.parse(r.stdout).files) by[basename(dirname(f.file))] = f.scenes;
  return by;
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
    scenesBySegment: loadScenes(outDir, manifest.segments),
    starts: null,
    fragments: findFragments(chapter),
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
  writeFileSync(outFile, JSON.stringify(notebook, null, 1) + "\n");
  for (const s of skipped) console.warn(`build-notebook: skipped ${s.id} (${s.why})`);
  console.log(`build-notebook: ${notebook.cells.length} cells → ${outFile}`);
}
