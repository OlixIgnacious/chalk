#!/usr/bin/env node
// regroup-captions.mjs — re-forms the caption groups of a built captions.html into readable phrases.
//
//   node regroup-captions.mjs <captions.html> [<caption_groups.json>]
//
// The faceless-explainer caption builder caps a group at 2-4 words by speech density and has no minimum
// duration, so a muted viewer of a Short sees fragments like "out an" for 0.3 s. This keeps every word and
// its timing and only moves the group boundaries:
//   - a group stays inside one frame, and a sentence end (. ? !) or a pause over 0.5 s always ends it;
//   - a group grows to 3-5 words and at most ~20 characters (one line at 64 px in a portrait band), and breaks at a comma once it has 3 words;
//   - it never ends on a function word ("a", "the", "to", "and" …) unless the sentence ends there;
//   - a group shorter than 0.7 s is merged into its neighbour in the same frame when the result still fits.
// It rewrites the `var GROUPS = [...]` line of captions.html (the runtime builds spans from it) and, if given,
// caption_groups.json.
import { readFileSync, writeFileSync } from "node:fs";

const MAX_WORDS = 5, MAX_CHARS = 20, MIN_WORDS = 3, MIN_DUR = 0.7, GAP = 0.5, TAIL_PAD = 0.12;
const SENT_END = /[.?!]["”’)]*$/;
const CLAUSE_END = /[,;:—]["”’)]*$/;
const WEAK = new Set(["a", "an", "the", "to", "and", "or", "of", "in", "into", "on", "at", "for", "with", "by", "from",
  "that", "it", "its", "it's", "is", "are", "was", "were", "be", "but", "so", "as", "if", "then", "can", "could", "would",
  "will", "did", "do", "does", "not", "your", "their", "this", "these", "those", "than", "about"]);
const r3 = (x) => Number(x.toFixed(3));
const bare = (t) => t.toLowerCase().replace(/[^a-z0-9']/g, "");
const chars = (ws) => ws.map((w) => w.text).join(" ").length;

export function regroup(groups) {
  const words = groups.flatMap((g) => g.words.map((w) => ({ text: w.text, start: w.start, end: w.end, frame: g.frame })));
  const out = [];
  let cur = [];
  const flush = () => { if (cur.length) out.push(cur); cur = []; };
  for (let i = 0; i < words.length; i++) {
    const w = words[i], next = words[i + 1];
    if (cur.length && (w.frame !== cur[0].frame || w.start - cur[cur.length - 1].end > GAP)) flush();
    // the sentence's last one or two words stay with this group rather than dangle on their own
    const rest = [];
    for (let k = i; k < words.length && words[k].frame === w.frame; k++) { rest.push(words[k]); if (SENT_END.test(words[k].text)) break; }
    const tailFits = rest.length <= 2 && SENT_END.test(rest[rest.length - 1].text) && chars([...cur, ...rest]) <= MAX_CHARS + 4;
    if (cur.length && !tailFits && (cur.length >= MAX_WORDS || chars([...cur, w]) > MAX_CHARS)) {
      // full: move a trailing weak word over to the next group so this one doesn't end on it
      const tail = [];
      while (cur.length > 1 && WEAK.has(bare(cur[cur.length - 1].text)) && tail.length < 2) tail.unshift(cur.pop());
      flush();
      cur = tail;
    }
    cur.push(w);
    const endsHere = !next || next.frame !== w.frame || next.start - w.end > GAP;
    if (SENT_END.test(w.text) || endsHere) flush();
    else if (CLAUSE_END.test(w.text) && cur.length >= MIN_WORDS) flush();
  }
  flush();
  // merge groups that flash by (or are a lone word) into a neighbour in the same frame
  const fits = (a, b) => a[0].frame === b[0].frame && a.length + b.length <= MAX_WORDS + 1 && chars([...a, ...b]) <= MAX_CHARS + 2;
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const g = out[i], dur = g[g.length - 1].end - g[0].start;
      if (dur >= MIN_DUR && g.length >= 2) continue;
      const prev = out[i - 1], next = out[i + 1];
      const prevOk = prev && fits(prev, g) && !SENT_END.test(prev[prev.length - 1].text);
      const nextOk = next && fits(g, next) && !SENT_END.test(g[g.length - 1].text);
      if (nextOk) { out.splice(i, 2, [...g, ...next]); changed = true; break; }
      if (prevOk) { out.splice(i - 1, 2, [...prev, ...g]); changed = true; break; }
    }
  }
  return out.map((ws, gi) => {
    const nx = out[gi + 1];
    let end = r3(ws[ws.length - 1].end + TAIL_PAD);
    if (nx && nx[0].start < end) end = r3(nx[0].start);
    return {
      id: `caption-group-${gi}`, frame: ws[0].frame, start: r3(ws[0].start), end,
      text: ws.map((w) => w.text).join(" "),
      words: ws.map((w, wi) => ({ id: `caption-word-${gi}-${wi}`, text: w.text, start: w.start, end: w.end })),
    };
  });
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const [html, json] = process.argv.slice(2);
  if (!html) { console.error("usage: regroup-captions.mjs <captions.html> [<caption_groups.json>]"); process.exit(2); }
  const src = readFileSync(html, "utf8");
  const m = src.match(/var GROUPS = (\[.*\]);/);
  if (!m) { console.error(`regroup-captions: no "var GROUPS = [...]" line in ${html}`); process.exit(1); }
  const before = JSON.parse(m[1]);
  const after = regroup(before);
  const nWords = (gs) => gs.reduce((n, g) => n + g.words.length, 0);
  if (nWords(after) !== nWords(before)) { console.error("regroup-captions: word count changed — refusing"); process.exit(1); }
  writeFileSync(html, src.replace(m[0], `var GROUPS = ${JSON.stringify(after).replace(/</g, "\\u003c")};`));
  if (json) {
    const j = JSON.parse(readFileSync(json, "utf8"));
    j.groups = after;
    writeFileSync(json, JSON.stringify(j, null, 2));
  }
  const short = after.filter((g) => g.end - g.start < MIN_DUR).length;
  console.log(`regroup-captions: ${before.length} → ${after.length} group(s) from ${nWords(after)} words; ${short} under ${MIN_DUR}s`);
}
