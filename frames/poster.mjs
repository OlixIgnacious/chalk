// poster.mjs — a theme's poster.png: one frame drawn by framelib in that theme from a fixed sample (a headline,
// a row of values, a result, a two-step plan), settled, screenshotted with the headless Chrome HyperFrames
// installs. The gallery shows it, and the frames agent and reviewer see what the theme looks like.
//
//   chalk themes --poster <name> [--portrait]

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { dirname, join } from "node:path";
import { listThemes } from "./themes.mjs";
import { assetsDir } from "../formats/index.mjs";

const HERE = dirname(new URL(import.meta.url).pathname);

export function chrome() {
  const root = join(homedir(), ".cache/hyperframes/chrome/chrome-headless-shell");
  if (!existsSync(root)) return null;
  for (const v of readdirSync(root).sort().reverse()) {
    const dir = join(root, v);
    for (const sub of readdirSync(dir)) {
      const bin = join(dir, sub, "chrome-headless-shell");
      if (existsSync(bin)) return bin;
    }
  }
  return null;
}

const python = () => [process.env.CHALK_PYTHON, process.env.HYPERFRAMES_PYTHON, join(HERE, "../.venv/bin/python")].find((p) => p && existsSync(p)) ?? "python3";

/** The sample frame's HTML in a theme: a one-frame project, framelib's own components, nothing typed by hand. */
export function sampleFrame(theme, orientation = "landscape") {
  const proj = mkdtempSync(join(tmpdir(), "chalk-poster-"));
  const words = "Keep one running total and add each value once".split(" ").map((text, i) => ({ text, start: i * 0.4, end: i * 0.4 + 0.35 }));
  writeFileSync(join(proj, "audio_meta.json"), JSON.stringify({ voices: [{ frame: 1, words }] }));
  writeFileSync(join(proj, "STORYBOARD.md"), "# poster\n\n## Frame 1 — sample\n\n- duration: 6.0s\n");
  const portrait = orientation === "portrait";
  const code = `import sys; sys.path.insert(0, ${JSON.stringify(HERE)})
import framelib
framelib.set_theme(${JSON.stringify(theme)})
${portrait ? 'framelib.set_canvas("portrait")' : ""}
from framelib import Frame
F = Frame(${JSON.stringify(proj)}, 1, "f01-sample", {"stage": "hook", "series_label": "SAMPLE SERIES · PART 1", "part_title": "running totals",
  "strip": ["Problem", "Plan", "Code", "Trace"], "stage_index": 1})
y = ${portrait ? 360 : 170}
F.headline("keep one running total", "Keep", y=y)
c = F.cells([2, 5, 1], ${portrait ? 180 : 104}, y + ${portrait ? 220 : 160})
for i, cell in enumerate(c):
    F.fade(cell, "running")
r = F.text("total 8", ${portrait ? 180 : 620}, y + ${portrait ? 400 : 190}, size=72, weight=800, color=framelib.ORANGE)
F.pop(r, "add")
F.plan_card([("start the total at 0", "Keep", "nothing is added yet", "one"), ("add each value once", "add", "every value counts once", "once")], x=${portrait ? 120 : 104}, y=${portrait ? 880 : 520})
F.write(drift=False)
print(${JSON.stringify(join(proj, "compositions", "frames", "f01-sample.html"))})`;
  const r = spawnSync(python(), ["-I", "-c", code], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`poster: framelib could not draw the sample in ${theme}: ${r.stderr.slice(-400)}`);
  return { proj, html: readFileSync(r.stdout.trim().split("\n").at(-1), "utf8"), portrait };
}

/** Render the sample, settled, to <theme dir>/poster.png. */
export function poster(name, { orientation = "landscape", out } = {}) {
  const t = listThemes().find((x) => x.name === name);
  if (!t) throw new Error(`no theme "${name}"`);
  const bin = chrome();
  if (!bin) throw new Error("poster: no headless Chrome (run `npx hyperframes doctor` once; it installs one)");
  const { proj, html, portrait } = sampleFrame(name, orientation);
  const assets = assetsDir();
  if (!existsSync(join(assets, "gsap.min.js"))) throw new Error("poster: run `chalk assets` first (fonts and GSAP)");
  cpSync(assets, join(proj, "assets"), { recursive: true });
  const [w, h] = portrait ? [1080, 1920] : [1920, 1080];
  // the settled frame is every element in its own CSS state: each reveal ends there (rise, fade, pop, draw), so
  // the poster drops the timeline instead of seeking it (a headless screenshot does not wait for GSAP's renders)
  const body = html.replace(/^\s*<template>/, "").replace(/<\/template>\s*$/, "").replace(/<script[\s\S]*?<\/script>/g, "");
  writeFileSync(join(proj, "poster.html"), `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden} [id*="-field"] > div { opacity: 0.55 !important; }</style></head>
<body>${body}</body></html>`);
  const dest = out ?? join(t.dir, portrait ? "poster-portrait.png" : "poster.png");
  const r = spawnSync(bin, ["--headless", "--hide-scrollbars", "--disable-gpu", "--run-all-compositor-stages-before-draw", `--window-size=${w},${h}`, "--virtual-time-budget=8000",
    `--screenshot=${dest}`, `file://${join(proj, "poster.html")}`], { encoding: "utf8" });
  rmSync(proj, { recursive: true, force: true });
  if (r.status !== 0 || !existsSync(dest)) throw new Error(`poster: Chrome could not render ${name}: ${r.stderr.slice(-300)}`);
  console.log(`poster: ${dest}`);
  return 0;
}
