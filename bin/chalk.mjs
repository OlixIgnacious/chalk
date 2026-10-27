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
//   chalk eval <out> [--format f] […]     score an output dir (evals/)
//   chalk deliver <out> [--format f] […]  the format's deliver script
//   chalk notebook <out>                  build notebook.ipynb (youtube format)
//   chalk lesson-page <lesson.json>       build lesson.html (lesson format)
//   chalk doctor                          check the machine: Python, Kokoro, Manim, ffmpeg, Hyperframes, assets
//
// --format is youtube or lesson. Without it, an output dir with a lesson.json is a lesson and
// anything else is a YouTube video.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const coreBin = join(root, "core/bin/chalk-core.mjs");
const FORMATS = {
  youtube: {
    skill: join(root, "formats/youtube/skills/chalk-youtube"),
    deliver: "scripts/deliver.mjs",
  },
  lesson: {
    skill: join(root, "formats/lesson/skills/chalk"),
    deliver: "scripts/deliver.mjs",
  },
};
const CORE = ["ingest", "check-readability", "build-tokens", "align-captions", "apply-display", "narrate",
  "check-spoken", "emit-vtt", "fix-index", "manim-render", "path"];
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
  f ??= out && existsSync(join(out, "lesson.json")) ? "lesson" : "youtube";
  if (!FORMATS[f]) die(`unknown format "${f}" (youtube or lesson)`);
  return f;
}

function python() {
  return [process.env.CHALK_PYTHON, process.env.HYPERFRAMES_PYTHON, join(root, ".venv/bin/python")].find(
    (p) => p && existsSync(p),
  ) ?? "python3";
}

function stills(argv) {
  const nn = argv.find((a) => /^\d+$/.test(a));
  if (!nn) die("usage: chalk stills NN [--every 5]");
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
    ["kokoro in that python", () => spawnSync(py, ["-c", "import kokoro"]).status === 0],
    ["manim in that python (Tier 2 only)", () => spawnSync(py, ["-c", "import manim"]).status === 0, true],
    ["ffmpeg", () => spawnSync("ffmpeg", ["-version"]).status === 0],
    ["ffprobe", () => spawnSync("ffprobe", ["-version"]).status === 0],
    ["faceless-explainer skill", () => existsSync(join(homedir(), ".claude/skills/faceless-explainer"))],
    ["fonts and GSAP staged (chalk assets)", () =>
      existsSync(join(process.env.CHALK_ASSETS ?? join(homedir(), ".cache/chalk-youtube/assets"), "gsap.min.js"))],
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
  const head = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 21);
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
} else if (cmd === "stills") status = stills(args);
else if (cmd === "eval") {
  const f = format(args);
  status = node(join(root, "evals/run.mjs"), [...args, "--format", f]);
} else if (cmd === "deliver") {
  const f = format(args);
  status = node(join(FORMATS[f].skill, FORMATS[f].deliver), args);
} else if (cmd === "notebook") status = node(join(FORMATS.youtube.skill, "scripts/build-notebook.mjs"), args);
else if (cmd === "lesson-page") status = node(join(FORMATS.lesson.skill, "scripts/build-lesson-page.mjs"), args);
else if (cmd === "doctor") status = doctor();
else die(`unknown command "${cmd}". Try: chalk --help`);
process.exit(status);
