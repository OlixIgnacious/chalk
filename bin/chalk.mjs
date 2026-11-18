#!/usr/bin/env node
// chalk — one entry point for every step, whichever format is being made.
//
//   chalk pipeline <out> [--doc <source>] […]  run every stage whose inputs changed; stop where a person or an agent is needed
//   chalk pipeline approve <out> --scripts|--watched, chalk pipeline adopt <out>
//   chalk status <out>                    what is done, stale or waiting, and why
//   chalk <core command> [args...]        ingest, check-readability, narrate, align-captions, … (core/)
//   chalk assets                          stage fonts and GSAP once per machine (frames/build.sh)
//   chalk voice|narrate|align|frames|render NN   step 4 for one segment, run from the output dir
//   chalk stills NN [--every 5]           contact sheet of segments/NN/segment.mp4 → work/stills/NN.png
//   chalk stills NN --at-cues             three stills per reveal from the frames build, before render → work/stills/NN-cues-*.png
//   chalk read-aloud <out>                the scripts as a viewer gets them (screen, code, captions; no sources)
//   chalk pack <out> [--list]             the genre pack the build is judged by, and its references
//   chalk themes [--show n | --for <out> | --poster n]   the themes, one's THEME.md, a build's theme, a poster
//   chalk shorts-plan <long-out>          the parts (and scene ranges) of a long video that could be Shorts
//   chalk recut <long-out> NN [--out d]   a part as a Short, its narration unchanged
//   chalk eval <out> [--format f] […]     score an output dir (evals/)
//   chalk deliver <out> [--format f] […]  the format's deliver script
//   chalk notebook <out>                  build notebook.ipynb (long format)
//   chalk lesson-page <lesson.json>       build lesson.html (lesson format)
//   chalk doctor                          check the machine: Python, Kokoro, Manim, ffmpeg, Hyperframes, assets
//   chalk publish auth | <out> [--at "YYYY-MM-DD HH:MM"] [--dry-run]   upload a video or Short to YouTube (publish/)
//
// --format is long, lesson or short ("youtube" is read as long). Without it, an output dir with a short.json is a
// Short (vertical), one with a lesson.json is a lesson, and anything else is a long video.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { shapeOf, detectShape, assetsDir, packOf } from "../formats/index.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const coreBin = join(root, "core/bin/chalk-core.mjs");
const FORMATS = {
  long: {
    skill: join(root, "formats/long/skills/chalk-long"),
    deliver: "scripts/deliver.mjs",
  },
  lesson: {
    skill: join(root, "formats/lesson/skills/chalk"),
    deliver: "scripts/deliver.mjs",
  },
  short: {
    skill: join(root, "formats/short/skills/chalk-short"),
    deliver: "scripts/deliver.mjs",
  },
};
const CORE = ["ingest", "check-readability", "build-tokens", "align-captions", "apply-display", "narrate",
  "check-spoken", "emit-vtt", "fix-index", "manim-render", "facts", "loudness", "path"];
const STAGES = ["voice", "narrate", "align", "frames", "render"];

const [cmd, ...args] = process.argv.slice(2);
const die = (m, code = 2) => {
  console.error("chalk:", m);
  process.exit(code);
};
const run = (bin, argv, opts = {}) => {
  const r = spawnSync(bin, argv, { stdio: "inherit", ...opts });
  if (r.error) die(`${bin}: ${r.error.message}`, 1);
  return r.status ?? 1;
};
const node = (script, argv) => run(process.execPath, [script, ...argv]);

/** Take --format off argv; infer it from the output dir when it is not given. */
function format(argv) {
  const i = argv.indexOf("--format");
  let f = null;
  if (i !== -1) {
    f = argv[i + 1];
    argv.splice(i, 2);
  }
  const out = argv.find((a) => !a.startsWith("-"));
  const shape = f ? shapeOf(f) : detectShape(out);
  if (!shape) die(`unknown format "${f}" (long, lesson or short; youtube is the old name for long)`);
  return shape;
}

function python() {
  return [process.env.CHALK_PYTHON, process.env.HYPERFRAMES_PYTHON, join(root, ".venv/bin/python")].find(
    (p) => p && existsSync(p),
  ) ?? "python3";
}

/** Three stills per reveal from the frames build (not the mp4, so before the render), tiled with an index. */
async function stillsAtCues(nn) {
  const { readCues, reveals, stillTimes } = await import(join(root, "frames/cues.mjs"));
  const project = join("segments", nn, "video");
  const rows = stillTimes(reveals(readCues(project)));
  if (!rows.length) die(`${project} has no cues: build its frames first (chalk frames ${nn}); framelib writes a .cues.json per frame`);
  const raw = join("work", "stills", `${nn}-cues-raw`);
  rmSync(raw, { recursive: true, force: true });
  mkdirSync(raw, { recursive: true });
  const times = [...new Set(rows.flatMap((r) => r.at))].sort((a, b) => a - b);
  let status = run("npx", ["hyperframes", "snapshot", project, "--at", times.join(","), "--no-end", "--keep", "--output", raw]);
  if (status !== 0) return status;
  const still = (t) => join(raw, `at-${t}s.png`);
  const PER = 6; // reveals per sheet: three stills across, six down, still readable
  const index = [`# Stills at cues — segment ${nn}`, "", "Each row is one reveal: entry (t + 0.1 s), settled (t + its duration), end of hold (next − 0.1 s).", ""];
  for (let k = 0; k * PER < rows.length; k++) {
    const part = rows.slice(k * PER, (k + 1) * PER);
    const seq = join(raw, `seq-${k + 1}`);
    mkdirSync(seq, { recursive: true });
    part.flatMap((r) => r.at).forEach((t, i) => {
      const f = still(t);
      if (existsSync(f)) copyFileSync(f, join(seq, `${String(i + 1).padStart(4, "0")}.png`));
    });
    const sheet = join("work", "stills", `${nn}-cues-${k + 1}.png`);
    status = run("ffmpeg", ["-v", "error", "-y", "-i", join(seq, "%04d.png"), "-vf", `scale=560:-1,tile=3x${part.length}:padding=6:color=white`,
      "-frames:v", "1", sheet]);
    if (status !== 0) return status;
    index.push(`## ${sheet}`, "", "| row | frame | at | shows | entry · settled · hold |", "|---|---|---|---|---|",
      ...part.map((r, i) => `| ${i + 1} | ${r.frame} | ${r.t.toFixed(2)} s | ${(r.text || "—").replace(/\|/g, "\\|")} | ${r.at.join(" · ")} |`), "");
  }
  writeFileSync(join("work", "stills", `${nn}-cues.md`), index.join("\n"));
  console.log(`stills: ${rows.length} reveal(s) → work/stills/${nn}-cues-*.png, index in work/stills/${nn}-cues.md`);
  return 0;
}

function stills(argv) {
  const nn = argv.find((a) => /^\d+$/.test(a));
  if (!nn) die("usage: chalk stills NN [--every 5 | --at-cues]");
  const i = argv.indexOf("--every");
  const every = i !== -1 ? Number(argv[i + 1]) : 5;
  const mp4 = join("segments", nn, "segment.mp4");
  if (!existsSync(mp4)) die(`${mp4} is not there — render segment ${nn} first`);
  mkdirSync(join("work", "stills"), { recursive: true });
  const png = join("work", "stills", `${nn}.png`);
  const status = run("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-vf", `fps=1/${every},scale=480:-1,tile=4x4:padding=4`,
    "-frames:v", "1", png]);
  if (status === 0) console.log(`stills: ${png} (one frame per ${every}s, first 16)`);
  return status;
}

function doctor() {
  const py = python();
  const checks = [
    ["node ≥ 22", () => Number(process.versions.node.split(".")[0]) >= 22],
    [`python (${py})`, () => spawnSync(py, ["-c", "1"]).status === 0],
    ["kokoro-onnx in that python", () => spawnSync(py, ["-c", "import kokoro_onnx"]).status === 0],
    ["manim in that python (Tier 2 only)", () => spawnSync(py, ["-c", "import manim"]).status === 0, true],
    ["ffmpeg", () => spawnSync("ffmpeg", ["-version"]).status === 0],
    ["ffprobe", () => spawnSync("ffprobe", ["-version"]).status === 0],
    ["faceless-explainer skill", () => existsSync(join(homedir(), ".claude/skills/faceless-explainer"))],
    ["claude CLI (the UI runs agents with it)", () => spawnSync("claude", ["--version"]).status === 0, true],
    ["streamlit in that python (the UI)", () => spawnSync(py, ["-c", "import streamlit"]).status === 0, true],
    ["fonts and GSAP staged (chalk assets)", () =>
      existsSync(join(assetsDir(), "gsap.min.js")) && existsSync(join(assetsDir(), "fonts", "caveat-latin-700-normal.woff2"))],
  ];
  let bad = 0;
  for (const [name, ok, optional] of checks) {
    const pass = ok();
    if (!pass && !optional) bad++;
    console.log(`  ${pass ? "ok  " : optional ? "warn" : "FAIL"}  ${name}`);
  }
  console.log("\nhyperframes doctor:");
  run("npx", ["hyperframes", "doctor"]);
  return bad ? 1 : 0;
}

if (!cmd || cmd === "--help" || cmd === "-h") {
  const lines = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1);
  const head = lines.slice(0, lines.findIndex((l) => !l.startsWith("//")));
  console.log(`chalk ${pkg.version}\n` + head.map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(cmd ? 0 : 2);
}
if (cmd === "--version" || cmd === "-v") {
  console.log(pkg.version);
  process.exit(0);
}

let status;
if (cmd === "pipeline" || cmd === "status") {
  const { main } = await import(join(root, "pipeline/run.mjs"));
  status = await main(cmd === "status" ? ["status", ...args] : args);
} else if (CORE.includes(cmd)) status = node(coreBin, [cmd, ...args]);
else if (cmd === "assets") status = run("bash", [join(root, "frames/build.sh"), "assets"]);
else if (STAGES.includes(cmd)) {
  if (!/^\d+$/.test(args[0] ?? "")) die(`usage: chalk ${cmd} NN (from the output dir)`);
  status = run("bash", [join(root, "frames/build.sh"), args[0], cmd]);
} else if (cmd === "stills") status = args.includes("--at-cues") ? await stillsAtCues(args.find((a) => /^\d+$/.test(a)) ?? die("usage: chalk stills NN --at-cues")) : stills(args);
else if (cmd === "read-aloud") {
  const { main } = await import(join(root, "pipeline/read-aloud.mjs"));
  status = main(args);
}
else if (cmd === "recut" || cmd === "shorts-plan") {
  const { main } = await import(join(root, "pipeline/recut.mjs"));
  status = await main(cmd, args);
}
else if (cmd === "themes") {
  const { main } = await import(join(root, "frames/themes.mjs"));
  status = await main(args);
}
else if (cmd === "pack") {
  // the genre pack a build is judged by, and where its outline and script references are
  const out = resolve(args.find((a) => !a.startsWith("-")) ?? ".");
  const shape = format(args);
  const { load } = await import(join(root, "evals/lib/load.mjs"));
  const { PACKS } = await import(join(root, "packs/index.mjs"));
  const ctx = load(out, { channelPath: args.includes("--channel") ? args[args.indexOf("--channel") + 1] : undefined });
  const name = packOf(shape, { manifest: shape === "lesson" ? ctx.lesson : ctx.video, channel: ctx.channel });
  if (args.includes("--list")) for (const [k, p] of Object.entries(PACKS)) console.log(`${k.padEnd(14)} ${(p.SHAPES ?? []).join(", ").padEnd(20)} ${p.ABOUT ?? ""}`);
  else if (!name) console.log(`none (the ${shape} shape's own rules only)`);
  else if (!PACKS[name]) die(`unknown pack "${name}" (${Object.keys(PACKS).join(", ")})`);
  else console.log(`${name}\n${join(root, "packs", name, "references")}${(PACKS[name].SHAPES ?? []).includes(shape) ? "" : `\nnote: ${name} has no rules for the ${shape} shape`}`);
  status = 0;
}
else if (cmd === "eval") {
  const f = format(args);
  status = node(join(root, "evals/run.mjs"), [...args, "--format", f]);
} else if (cmd === "deliver") {
  const f = format(args);
  status = node(join(FORMATS[f].skill, FORMATS[f].deliver), args);
} else if (cmd === "notebook") status = node(join(FORMATS.long.skill, "scripts/build-notebook.mjs"), args);
else if (cmd === "lesson-page") status = node(join(FORMATS.lesson.skill, "scripts/build-lesson-page.mjs"), args);
else if (cmd === "doctor") status = doctor();
else if (cmd === "publish") {
  const { main } = await import(join(root, "publish/index.mjs"));
  status = await main(args);
}
else die(`unknown command "${cmd}". Try: chalk --help`);
process.exit(status);
