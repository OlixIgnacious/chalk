// demos.mjs — a short demo video for each theme: the same eight-second scene (a headline, three values, a rule,
// a result), the same voice-over, built and rendered by the real pipeline in every theme.
//
//   chalk themes --demo [name,name…] [--out chalk-output/theme-demos]
//
// The template is frames/demo/ (original text). It is narrated once, in _base/, with the channel's voice; each
// theme then copies the takes and only builds its frames and renders, so a demo is what a real build in that theme
// looks like. Writes <out>/<theme>.mp4 and <out>/all-themes.mp4, every demo in a row.

import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { listThemes } from "./themes.mjs";

const HERE = dirname(new URL(import.meta.url).pathname);
const BUILD = join(HERE, "build.sh");

function sh(args, cwd, env = {}) {
  const r = spawnSync("bash", [BUILD, ...args], { cwd, encoding: "utf8", env: { ...process.env, CHALK_CHANNEL: join(cwd, "channel.json"), ...env } });
  if (r.status !== 0 || /Traceback|Error:/.test(r.stderr)) throw new Error(`${args.join(" ")} in ${cwd}:\n${(r.stderr || r.stdout).slice(-600)}`);
  return r.stdout;
}

/** _base/: the template, narrated once, with a 2 s end hold. */
function base(out) {
  const dir = join(out, "_base");
  if (existsSync(join(dir, "work", "01", "captions.json"))) return dir;
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(HERE, "demo"), dir, { recursive: true });
  sh(["01", "voice"], dir);
  const r = spawnSync(process.execPath, [join(HERE, "seg.mjs"), "sync", "01"], { cwd: dir, encoding: "utf8", env: { ...process.env, END_HOLD: "2" } });
  if (r.status !== 0) throw new Error(r.stderr);
  return dir;
}

export function demo(name, out) {
  const b = base(out);
  const dir = join(out, name);
  rmSync(dir, { recursive: true, force: true });
  cpSync(b, dir, { recursive: true, filter: (src) => !src.includes("/renders") && !src.endsWith("segment.mp4") });
  const v = JSON.parse(readFileSync(join(dir, "video.json"), "utf8"));
  writeFileSync(join(dir, "video.json"), JSON.stringify({ ...v, theme: name }, null, 2) + "\n");
  sh(["01", "frames"], dir);
  sh(["01", "render"], dir);
  const mp4 = join(out, `${name}.mp4`);
  copyFileSync(join(dir, "segments", "01", "segment.mp4"), mp4);
  return mp4;
}

export function demos(names, out) {
  out = resolve(out);
  mkdirSync(out, { recursive: true });
  const made = [];
  for (const n of names) {
    try {
      made.push(demo(n, out));
      console.log(`demo: ${n}.mp4`);
    } catch (e) {
      console.error(`demo: ${n} failed — ${e.message}`);
    }
  }
  if (made.length > 1) {
    const list = join(out, "_all.txt");
    writeFileSync(list, made.map((f) => `file '${f}'`).join("\n") + "\n");
    spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", join(out, "all-themes.mp4")]);
    console.log(`demo: all-themes.mp4 (${made.length} themes)`);
  }
  return made.length === names.length ? 0 : 1;
}

export function main(argv) {
  const i = argv.indexOf("--demo");
  const arg = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  const names = arg ? arg.split(",") : listThemes().map((t) => t.name);
  const out = argv.indexOf("--out") >= 0 ? argv[argv.indexOf("--out") + 1] : join(HERE, "..", "chalk-output", "theme-demos");
  return demos(names, out);
}
