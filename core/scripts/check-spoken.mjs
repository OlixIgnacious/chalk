#!/usr/bin/env node
// check-spoken.mjs — does the narration sound like a person, or like a document read aloud?
//
//   node check-spoken.mjs <script.md> [...] [--banned "chapter,book,section"] [--max-avg 12] [--min-you 0.1] [--json]
//
// check-readability enforces grounding and reading time; nothing checked HOW the narration sounds, and
// a faithful summary read aloud passed every gate while sounding like a robot (13.7 words a sentence, a
// third of them comma lists, three questions in 110 sentences). This measures the spoken layer.
//
// It FAILS on two things that are never right for the ear: a sentence too long to say in one breath, and
// a sentence that reads out a list. It only WARNS on the rest (long average sentences, no questions in a
// long stretch, no talking to the viewer, a scene that changes topic without saying so), because those are
// judgement. The limits are generous on purpose: a YouTube video has no word budget, and a teacher explaining
// something properly uses full sentences. Pause markers do not count as words.
//
// Two opt-in gates for a skill that needs them: `--banned` fails any spoken or display line that says one of
// the terms (whole words, case-insensitive) — a video for people who never saw the book must not say
// "the chapter"; `--max-avg` turns the average-sentence-length warning into a failure at that limit;
// `--min-you` fails a part that addresses the viewer ("you") in fewer than that share of its sentences.
//
// Exit 0 ok (warnings allowed), 1 a hard failure, 2 usage.

import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const opt = (n) => {
  const i = argv.indexOf(`--${n}`);
  if (i < 0) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`check-spoken: --${n} needs a value`);
    process.exit(2);
  }
  return v;
};
const BANNED = (opt("banned") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const MAX_AVG = opt("max-avg") === null ? null : Number(opt("max-avg"));
if (MAX_AVG !== null && !(MAX_AVG > 0)) {
  console.error("check-spoken: --max-avg needs a positive number");
  process.exit(2);
}
const MIN_YOU = opt("min-you") === null ? null : Number(opt("min-you"));
if (MIN_YOU !== null && !(MIN_YOU >= 0 && MIN_YOU <= 1)) {
  console.error("check-spoken: --min-you needs a share between 0 and 1");
  process.exit(2);
}
const values = new Set(["banned", "max-avg", "min-you"].map((n) => argv.indexOf(`--${n}`) + 1).filter((i) => i > 0));
const files = argv.filter((a, i) => !a.startsWith("--") && !values.has(i));
if (!files.length) {
  console.error('usage: check-spoken.mjs <script.md> [...] [--banned "chapter,book"] [--max-avg 12] [--min-you 0.1] [--json]');
  process.exit(2);
}
const bannedRe = BANNED.length
  ? new RegExp(`(^|[^\\w])(${BANNED.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=$|[^\\w])`, "i")
  : null;

const HARD_WORDS = 40; // a sentence longer than this cannot be said in one breath
const HARD_LIST = 4; // a sentence with this many commas is reading out a list
const SOFT_AVG = 16;
const SOFT_LONG = 28;
const WORDS_PER_SECOND = 2.4;

const strip = (s) => s.replace(/\{(beat|pause|think)\}/g, " ").replace(/\s+/g, " ").trim();

/** The spoken entries of a script.md, grouped by scene (each group carries its scene's `visual`), outside any fenced example. */
function scenesOf(md) {
  const scenes = [];
  let fenced = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    if (/^##\s/.test(line)) {
      scenes.push([]);
      continue;
    }
    const v = line.match(/^visual:\s*(.+?)\s*(\(tier.*)?$/i);
    if (v && scenes.length) scenes.at(-1).visual = v[1].toLowerCase();
    const m = line.match(/^\s*(?:-\s*)?spoken:\s*"(.*)"\s*$/i);
    if (m) (scenes.at(-1) ?? scenes[scenes.push([]) - 1]).push(m[1]);
  }
  return scenes.filter((s) => s.length);
}

// A scene change is a topic change, and saying so aloud is what stops it feeling rushed. A question is
// always a signpost; otherwise the opening words should say what is happening ("let's look at an example").
const SIGNPOST = /^(let'?s|now|next|so|here|before|alright|okay|time|back|one more|another|finally|last|first|second|third|then|imagine|say|take|think|remember|picture|and|but|why|what|how|when|where|which|who|there are|there'?s|a quick|quick|meanwhile|that'?s|ready|up next|on to)\b/i;
const opensWithSignpost = (entry) => {
  const first = strip(entry).split(/(?<=[.!?])\s+/)[0] ?? "";
  return /\?$/.test(first) || SIGNPOST.test(first);
};

const YOU = /\byou(?:'re|'ll|'ve|'d|r|rs|rself)?\b/i;
const CONTRACTION = /\b(?:\w+n't|\w+'(?:re|ll|ve|d|m)|it's|that's|here's|there's|what's|let's|who's)\b/gi;

function measure(entries, scenes = []) {
  const sentences = entries.flatMap((e) => strip(e).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean));
  const lens = sentences.map((s) => s.split(/\s+/).length);
  const words = lens.reduce((a, b) => a + b, 0);
  return {
    sentences: sentences.length,
    words,
    avgWords: sentences.length ? Number((words / sentences.length).toFixed(1)) : 0,
    maxWords: Math.max(0, ...lens),
    questions: sentences.filter((s) => /\?$/.test(s)).length,
    you: sentences.filter((s) => YOU.test(s)).length,
    contractions: sentences.reduce((a, s) => a + (s.match(CONTRACTION)?.length ?? 0), 0),
    lists: sentences.filter((s) => (s.match(/,/g)?.length ?? 0) >= 3).length,
    seconds: Number((words / WORDS_PER_SECOND).toFixed(1)),
    // scenes after the first that begin without saying what is happening (1-based)
    unsignposted: scenes.map((s, i) => (i > 0 && !opensWithSignpost(s[0]) ? i + 1 : null)).filter(Boolean),
    sentenceList: sentences,
  };
}

let failed = 0;
const NUM = "(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|-?\\d+)";
const ARRAY_RUN = new RegExp(`\\b${NUM}(?:,\\s*${NUM}){2,}\\b`, "gi");
const report = [];
for (const file of files) {
  let md;
  try {
    md = readFileSync(file, "utf8");
  } catch (e) {
    console.error(`check-spoken: cannot read ${file} — ${e.message}`);
    process.exit(2);
  }
  const scenes = scenesOf(md);
  const m = measure(scenes.flat(), scenes);
  const failures = [];
  const warnings = [];
  if (bannedRe) {
    md.split("\n").forEach((line, i) => {
      const f = line.match(/^\s*(?:-\s*)?(spoken|display):\s*"(.*)"\s*$/i);
      const hit = f && f[2].match(bannedRe);
      if (hit) failures.push(`line ${i + 1}: the ${f[1].toLowerCase()} layer says "${hit[2]}", which this video must not — "${f[2].slice(0, 60)}"`);
    });
  }
  for (const s of m.sentenceList) {
    const n = s.split(/\s+/).length;
    // a spoken array ("one, two, three, one") is one value, not a list of items to hold in mind
    const commas = s.replace(ARRAY_RUN, "ARRAY").match(/,/g)?.length ?? 0;
    if (n > HARD_WORDS) failures.push(`a sentence of ${n} words is too long to say in one breath — "${s.slice(0, 60)}…"`);
    if (commas >= HARD_LIST) failures.push(`a sentence reads out a list of ${commas + 1} items — say two or three and leave the rest on screen — "${s.slice(0, 60)}…"`);
    else if (n > SOFT_LONG && n <= HARD_WORDS) warnings.push(`a ${n}-word sentence is long — "${s.slice(0, 50)}…"`);
  }
  if (MAX_AVG !== null && m.sentences && m.avgWords > MAX_AVG) failures.push(`sentences average ${m.avgWords} words; this video's limit is ${MAX_AVG}`);
  else if (m.sentences && m.avgWords > SOFT_AVG) warnings.push(`sentences average ${m.avgWords} words; aim for 12–14 or fewer, mixing in longer ones where an idea needs room`);
  if (m.seconds > 60 && m.questions === 0) warnings.push(`about ${Math.round(m.seconds)}s of narration with no question to the viewer`);
  // "And the price? {beat} Memory." — a one-word answer read aloud sounds like a slide label; a teacher answers
  // with the reason ("It's memory: the set has to store every value it has seen")
  for (const e of scenes.flat()) {
    const m = e.match(/\?\s*(?:\{(?:beat|pause|think)\}\s*)?([A-Z][\w'’-]*(?:\s[\w'’-]+)?)[.!]\s*(?:\{(?:beat|pause|think)\}\s*)?$/);
    if (m && !/^(yes|no|right|exactly|true|false)$/i.test(m[1])) {
      warnings.push(`"${e.slice(0, 50)}" answers its question with a bare "${m[1]}" — answer with the reason, the way a teacher would`);
    }
  }
  // two markers in a row ("…the past. {pause}" then "{beat} What if…") keep only the last: the pause is lost
  scenes.forEach((s) => s.forEach((e, i) => {
    const next = s[i + 1];
    if (next && /\{(beat|pause|think)\}\s*$/.test(e) && /^\s*\{(beat|pause|think)\}/.test(next)) {
      warnings.push(`"${e.slice(-40)}" and "${next.slice(0, 30)}…" put two pause markers together; only the second is heard — keep one`);
    }
  }));
  // a build or a plan read straight through is a list read aloud: give the viewer a breath between steps
  scenes.forEach((s, i) => {
    if (/^(code build|plan card)$/.test(s.visual ?? "") && s.length > 3 && !s.some((e) => /\{(pause|beat|think)\}/.test(e))) {
      warnings.push(`scene ${i + 1} (${s.visual}) runs ${s.length} steps with no {pause} — add one after each step's reason`);
    }
  });
  for (const n of m.unsignposted) warnings.push(`scene ${n} opens without a signpost — say what is happening ("let's look at it through an example", "now, the other way round")`);
  if (MIN_YOU !== null && m.sentences >= 5 && m.you / m.sentences < MIN_YOU) {
    failures.push(`the viewer is addressed ("you") in only ${m.you} of ${m.sentences} sentences; this channel's floor is ${Math.round(MIN_YOU * 100)}% — talk to the viewer, not about the code`);
  } else if (m.sentences >= 5 && m.you / m.sentences < 0.2) warnings.push(`the viewer is addressed ("you") in only ${m.you} of ${m.sentences} sentences`);
  failed += failures.length;
  const { sentenceList, ...metrics } = m;
  report.push({ file, metrics, warnings, failures });
  if (!JSON_OUT) {
    console.log(`${file} — ${m.sentences} sentences, ${m.words} words, avg ${m.avgWords}, max ${m.maxWords}, ${m.questions} question(s), you ${m.you}, contractions ${m.contractions}`);
    for (const w of warnings) console.error(`  warn ${file}: ${w}`);
  }
  for (const f of failures) console.error(`  FAIL ${file}: ${f}`);
}

if (JSON_OUT) console.log(JSON.stringify({ files: report }, null, 2));
if (failed) {
  console.error(`\ncheck-spoken: ${failed} failure(s)`);
  process.exit(1);
}
if (!JSON_OUT) console.log("\ncheck-spoken: ok");
