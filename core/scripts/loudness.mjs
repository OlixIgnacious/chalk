#!/usr/bin/env node
// loudness.mjs — every delivered file plays at the same loudness: −14 LUFS integrated, true peak ≤ −1 dBTP,
// what the platforms normalise to. Two passes: measure, then apply with the measured values (linear when it
// can), so a long video, a lesson and a Short come out within 1 LU of each other. The picture is copied.
//
//   node loudness.mjs <in.mp4> --out <out.mp4>     master a file
//   node loudness.mjs <in.mp4> --measure           print { I, TP, LRA } as JSON
//
// Every deliver uses master(); the eval's V4 uses measure().

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const TARGET = { I: -14, TP: -1, LRA: 11 };

const ff = (args) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...args], { encoding: "utf8", maxBuffer: 1 << 26 });

/** True when the file has an audio stream. */
export function hasAudio(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", file], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() !== "";
}

/** loudnorm's first pass: the file's own integrated loudness, true peak, range and threshold. */
function analyse(file, t = TARGET) {
  const r = ff(["-i", file, "-af", `loudnorm=I=${t.I}:TP=${t.TP}:LRA=${t.LRA}:print_format=json`, "-f", "null", "-"]);
  const m = r.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
  if (r.status !== 0 || !m) throw new Error(`loudness: could not measure ${file}: ${r.stderr.slice(-300)}`);
  return JSON.parse(m[0]);
}

/** The file's loudness as a player measures it (EBU R128): { I (LUFS), TP (dBTP), LRA (LU) }, or null. */
export function measure(file) {
  if (!hasAudio(file)) return null;
  const r = ff(["-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"]);
  if (r.status !== 0) return null;
  const summary = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const num = (re) => Number(summary.match(re)?.[1]);
  const out = { I: num(/I:\s+(-?[\d.]+) LUFS/), TP: num(/Peak:\s+(-?[\d.]+) dBFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/) };
  return Number.isFinite(out.I) ? out : null;
}

/**
 * Master `input` into `output` at the target: two-pass loudnorm on the audio, the video stream copied, AAC at
 * 192 kb/s, 48 kHz, faststart. A file with no audio is copied as it is. Returns the measured input values.
 */
export function master(input, output, t = TARGET) {
  if (!hasAudio(input)) {
    const c = ff(["-v", "error", "-y", "-i", input, "-c", "copy", "-movflags", "+faststart", output]);
    if (c.status !== 0) throw new Error(`loudness: could not copy ${input}: ${c.stderr}`);
    return null;
  }
  const m = analyse(input, t);
  // silence (a test clip, a music-less ambient hold) has no loudness to bring up: copy it as it is
  if (!(Number(m.input_i) > -70)) {
    const c = ff(["-v", "error", "-y", "-i", input, "-c", "copy", "-movflags", "+faststart", output]);
    if (c.status !== 0) throw new Error(`loudness: could not copy ${input}: ${c.stderr}`);
    return m;
  }
  const filter = `loudnorm=I=${t.I}:TP=${t.TP}:LRA=${t.LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
    `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=48000`;
  const r = ff(["-v", "error", "-y", "-i", input, "-map", "0:v?", "-map", "0:a", "-c:v", "copy", "-af", filter,
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", output]);
  if (r.status !== 0) throw new Error(`loudness: could not master ${input}: ${r.stderr.slice(-300)}`);
  return m;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const input = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--out");
  if (!input) {
    console.error("usage: loudness.mjs <in.mp4> (--out <out.mp4> | --measure)");
    process.exit(2);
  }
  if (argv.includes("--measure")) {
    console.log(JSON.stringify(measure(input)));
    process.exit(0);
  }
  const out = argv[argv.indexOf("--out") + 1];
  if (!argv.includes("--out") || !out) {
    console.error("loudness: --out <file> is required");
    process.exit(2);
  }
  master(input, out);
  console.log(`loudness: ${out} at ${TARGET.I} LUFS, true peak ≤ ${TARGET.TP} dBTP`);
}
