#!/usr/bin/env node
// narrate.mjs — the voice, with pauses we control, in the shape the pipeline already reads.
//
//   node narrate.mjs --script SCRIPT.md --out <project> [--voice af_heart] [--speed 0.93]
//        [--sentence 0.42] [--question 0.7] [--beat 0.55] [--pause 1.0] [--think 2.5] [--jitter 0.18]
//        [--lead 0.6]
//        [--engine parakeet] [--polish] [--no-transcribe] [--python <venv python>] [--lexicon lexicon.json]
//   node narrate.mjs --text "One paragraph." --wav out.wav [--voice ...]     (audition one voice)
//
// It replaces the VOICE half of faceless-explainer's `audio.mjs`, which on the offline route cannot do
// what a teacher does: its Kokoro path ignores --speed, exposes no pause control, and falls back to a
// fixed voice. Here each sentence is synthesized alone and the silence between sentences is inserted by
// us — longer after a question, longer still at `{beat}`, `{pause}` and `{think}` — with a deterministic jitter so
// the pauses are not metronomic.
//
// The silence is baked into each take, so a frame's duration still equals its narration: nothing here
// is a hold. It writes assets/voice/NN.wav, then audio_meta.json and audio_engine_meta.json in the exact
// shape audio.mjs writes, so sync-durations, captions.mjs and assemble-index run unchanged.
//
// Markers ({beat}, {pause}, {think}) live only in SCRIPT.md. They are stripped before anything is transcribed or
// aligned, so the spoken and display layers stay word-for-word the same.

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

// ── pure helpers (tested directly) ────────────────────────────────────────────────────────────────

const MARKER = /\{(beat|pause|think)\}/g;

/** Spoken text with the pause markers removed and the spacing tidied. */
export function stripMarkers(text) {
  return text.replace(MARKER, " ").replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
}

/**
 * Narration into pieces, each carrying the kind of silence that follows it:
 * "question" after a "?", "sentence" after a "." or "!", "beat" / "pause" / "think" where the writer put a marker
 * (which REPLACES the natural gap), and null after the last piece. A trailing marker is ignored here;
 * the --script path refuses one rather than lose it.
 */
export function splitSpoken(text) {
  const out = [];
  let pending = null; // a marker waits for the next sentence, so one with nothing after it does nothing
  for (const chunk of text.split(/(\{beat\}|\{pause\}|\{think\})/)) {
    const m = chunk.match(/^\{(beat|pause|think)\}$/);
    if (m) {
      pending = m[1];
      continue;
    }
    for (const s of chunk.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean)) {
      if (out.length) {
        const prev = out[out.length - 1];
        prev.gap = pending ?? (/[?]$/.test(prev.text) ? "question" : "sentence");
      }
      pending = null;
      out.push({ text: s, gap: null });
    }
  }
  return out;
}

/** A small deterministic hash in [-1, 1) so the same place always pauses the same length. */
function unit(key) {
  let h = 2166136261;
  for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 2000) / 1000 - 1;
}

/** Seconds of silence for a kind of gap, with up to ±jitter variation. */
export function gapSeconds(kind, key, o) {
  if (!kind) return 0;
  const base = o[kind];
  if (typeof base !== "number") throw new Error(`unknown gap kind "${kind}"`);
  return Number((base * (1 + o.jitter * unit(`${kind}:${key}`))).toFixed(3));
}

/**
 * The lexicon's `spoken` form is what TTS must say (step-3-script.md § Lexicon). A term written in its
 * display form inside the spoken text — "dict", "SQL", "LeetCode" — is replaced by its spoken form, whole
 * words only, longest term first. A term whose spoken form equals its display form changes nothing.
 */
export function applyLexicon(text, terms) {
  const sorted = [...terms].filter((t) => t.display && t.spoken && t.display !== t.spoken).sort((a, b) => b.display.length - a.display.length);
  let out = text;
  for (const t of sorted) {
    const esc = t.display.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(`(^|[^\\w])${esc}(?=$|[^\\w])`, "g"), (m, pre) => pre + t.spoken);
  }
  return out;
}

/** SCRIPT.md → [{ frame, text }]: the indented block under each `## … (Frame N)`. Markers are kept. */
export function parseScript(md) {
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.text.trim()) out.push({ frame: cur.frame, text: cur.text.trim() });
    cur = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^#{2,3}\s+.*?\(frame\s+(\d+)\)/i);
    if (h) {
      flush();
      cur = { frame: Number(h[1]), text: "" };
      continue;
    }
    if (!cur || /^\s*\*\*/.test(line)) continue;
    const m = line.match(/^(?: {4,}|\t)(.+)$/);
    if (m) cur.text += (cur.text ? " " : "") + m[1].trim();
  }
  flush();
  return out;
}

// ── the CLI ───────────────────────────────────────────────────────────────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

function main() {
  const argv = process.argv.slice(2);
  const die = (m) => {
    console.error("narrate:", m);
    process.exit(2);
  };
  const flag = (n, d) => {
    const i = argv.indexOf("--" + n);
    if (i < 0) return d;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) die(`--${n} needs a value`);
    return v;
  };
  const num = (n, d) => {
    const v = Number(flag(n, d));
    if (!Number.isFinite(v) || v < 0) die(`--${n} needs a non-negative number`);
    return v;
  };

  const voice = flag("voice", "af_heart");
  const speed = num("speed", 0.93);
  if (speed < 0.5 || speed > 2) die("--speed must be between 0.5 and 2");
  const gaps = { sentence: num("sentence", 0.42), question: num("question", 0.7), beat: num("beat", 0.55), pause: num("pause", 1.0), think: num("think", 2.5), jitter: num("jitter", 0.18) };
  // A breath of silence before every take but the first: a scene change is a change of topic, and without
  // it the new scene's first word lands the instant the last one ends. Baked into the take, so a frame's
  // duration still equals its narration.
  const lead = num("lead", 0);
  const python = flag("python", process.env.HYPERFRAMES_PYTHON || "python3");
  const lang = flag("lang", "en-us");
  const cache = join(homedir(), ".cache/hyperframes/tts");
  const model = flag("model", join(cache, "models/kokoro-v1.0.onnx"));
  const voices = flag("voices", join(cache, "voices/voices-v1.0.bin"));
  const helper = join(dirname(fileURLToPath(import.meta.url)), "kokoro_narrate.py");
  if (!existsSync(model) || !existsSync(voices)) die(`Kokoro's model files are not at ${cache}. Run \`npx hyperframes tts --list\` once to download them.`);

  const synth = (jobs) => {
    const r = spawnSync(python, [helper], { input: JSON.stringify({ model, voices, voice, speed, lang, jobs }), encoding: "utf8", maxBuffer: 1 << 28 });
    if (r.error) die(`cannot run ${python}: ${r.error.message}`);
    if (r.status !== 0) {
      console.error(r.stderr.trim());
      process.exit(r.status === 2 ? 2 : 1);
    }
    return JSON.parse(r.stdout.trim().split("\n").at(-1)).takes;
  };
  const lexPath = flag("lexicon", null);
  let lexTerms = [];
  if (lexPath) {
    try {
      const lx = JSON.parse(readFileSync(resolve(lexPath), "utf8"));
      lexTerms = Array.isArray(lx.terms) ? lx.terms : die(`${lexPath} has no terms[]`);
    } catch (e) {
      die(`cannot read ${lexPath} — ${e.message}`);
    }
  }
  const piecesFor = (text, key) =>
    splitSpoken(applyLexicon(text, lexTerms)).map((p, i) => ({ text: p.text, gap: gapSeconds(p.gap, `${key}-${i}`, gaps) }));

  // Audition mode: one text, one WAV, nothing else.
  const audition = flag("text", null);
  if (audition !== null) {
    const wav = flag("wav", null) ?? die("--text needs --wav <out.wav>");
    mkdirSync(dirname(resolve(wav)), { recursive: true });
    const [take] = synth([{ out: resolve(wav), pieces: piecesFor(audition, "audition") }]);
    if (argv.includes("--polish")) polish(resolve(wav), die);
    console.log(`narrate: ${wav} — ${take.duration}s, voice ${voice}, speed ${speed}`);
    return;
  }

  const scriptPath = flag("script", null) ?? die("usage: narrate.mjs --script SCRIPT.md --out <project> [--voice af_heart] [--speed 0.93]");
  const outDir = resolve(flag("out", "."));
  if (!existsSync(scriptPath)) die(`cannot read ${scriptPath} — no such file`);
  const frames = parseScript(readFileSync(scriptPath, "utf8"));
  if (!frames.length) die(`${scriptPath} has no "## … (Frame N)" blocks with narration`);
  // a marker with nothing after it in its take would be dropped (splitSpoken), losing a pause the writer asked for
  const trailing = frames.filter((f) => /\{(beat|pause|think)\}\s*$/.test(f.text)).map((f) => f.frame);
  if (trailing.length) die(`frame(s) ${trailing.join(", ")} end on a pause marker, which a take cannot hold — move it before more words in the same frame, or remove it`);

  const voiceDir = join(outDir, "assets/voice");
  mkdirSync(voiceDir, { recursive: true });
  const pad = (n) => String(n).padStart(2, "0");
  const takes = synth(frames.map((f, i) => ({ out: join(voiceDir, `${pad(f.frame)}.wav`), lead: i === 0 ? 0 : lead, pieces: piecesFor(f.text, `f${f.frame}`) })));

  const noTranscribe = argv.includes("--no-transcribe");
  const engine = flag("engine", "auto");
  const metaVoices = [];
  for (const [i, f] of frames.entries()) {
    const wav = takes[i].out;
    if (argv.includes("--polish")) polish(wav, die);
    let words = [];
    if (!noTranscribe) {
      const t = spawnSync("npx", ["hyperframes", "transcribe", wav, "--engine", engine, "--json"], { cwd: outDir, encoding: "utf8", maxBuffer: 1 << 26 });
      if (t.status !== 0) die(`transcribe failed for frame ${f.frame}:\n${(t.stderr || t.stdout).trim().slice(-400)}`);
      const meta = JSON.parse(t.stdout.trim().split("\n").filter((l) => l.startsWith("{")).at(-1));
      const raw = JSON.parse(readFileSync(meta.transcriptPath, "utf8"));
      words = (Array.isArray(raw) ? raw : raw.words).map((w, n) => ({ id: `w${n}`, text: w.text, start: w.start, end: w.end }));
    }
    const dur = probeSeconds(wav) ?? takes[i].duration;
    metaVoices.push({ frame: f.frame, path: `assets/voice/${pad(f.frame)}.wav`, duration_s: Number(dur.toFixed(3)), words });
    const wc = stripMarkers(f.text).split(/\s+/).length;
    console.log(`narrate: frame ${f.frame}: ${dur.toFixed(2)}s, ${wc} words (${(wc / dur).toFixed(2)}/s)`);
  }

  writeFileSync(join(outDir, "audio_meta.json"), JSON.stringify({ bgm: null, bgm_pending: false, voices: metaVoices, sfx: [] }, null, 2));
  writeFileSync(join(outDir, "audio_engine_meta.json"), JSON.stringify({
    tts_provider: "kokoro", voice_id: voice, bgm: null, bgm_pending: false, bgm_provider: null, bgm_pid: null, bgm_log: null,
    bgm_mode: null, bgm_target_duration_s: null, bgm_seed_duration_s: null, bgm_loop_count: null,
    voices: metaVoices.map((v) => ({ id: pad(v.frame), path: v.path, duration_s: v.duration_s, words: v.words })), sfx: [],
  }, null, 2));
  const total = metaVoices.reduce((a, v) => a + v.duration_s, 0);
  console.log(`narrate: ${frames.length} frame(s), ${total.toFixed(1)}s of narration, voice ${voice} at ${speed}× → ${outDir}`);
}

function probeSeconds(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" });
  const n = Number(r.stdout.trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** A gentle polish that never changes the length: even out the level and trim rumble. */
function polish(wav, die) {
  const tmp = wav.replace(/\.wav$/, ".polish.wav");
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-i", wav, "-af",
    "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=20:release=250:makeup=2,loudnorm=I=-18:TP=-2:LRA=9", "-ar", "24000", tmp], { encoding: "utf8" });
  if (r.status !== 0) die(`polish failed: ${r.stderr.trim()}`);
  renameSync(tmp, wav);
}
