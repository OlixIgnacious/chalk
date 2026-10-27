// load.mjs — read a chalk output dir into one context object the criteria share.
//
// Everything is optional: a criterion whose inputs are missing reports `skip`, so the same evals score
// a text-only fixture and a fully rendered video. Nothing here runs a process.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);
const readText = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const unquote = (s) => s.trim().replace(/^"|"$/g, "");

/**
 * A segment's script.md → { title, scenes }. Scene fields: visual, tier, duration, example, computedBy,
 * onScreen, stage, code, codeDepth, trace. Entry fields: spoken, display, source[], lines[].
 */
export function parseScript(md) {
  const title = md.match(/^#\s+\d+\s+[—-]\s+(.+)$/m)?.[1]?.trim() ?? "";
  const scenes = [];
  let cur = null;
  let entry = null;
  let lineNo = 0;
  for (const line of md.split(/\r?\n/)) {
    lineNo++;
    const h = line.match(/^##\s+Scene\s+(\d+)\s+[—-]\s+(.+)$/i);
    if (h) {
      cur = { n: Number(h[1]), title: h[2].trim(), line: lineNo, entries: [] };
      scenes.push(cur);
      entry = null;
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^(visual|example|computed-by|on-screen|duration|stage|code-depth|code|trace):\s*(.*)$/i);
    if (kv) {
      const key = kv[1].toLowerCase().replace(/-(\w)/g, (_, c) => c.toUpperCase());
      cur[key] = kv[2].trim();
      if (key === "visual") cur.tier = Number(kv[2].match(/\(tier\s*(\d)\)/i)?.[1] ?? NaN);
      continue;
    }
    const f = line.match(/^\s*(-\s*)?(spoken|display|source|lines):\s*(.*)$/i);
    if (!f) continue;
    if (f[1]) {
      entry = { spoken: "", display: "", source: [], lines: [], line: lineNo };
      cur.entries.push(entry);
    }
    if (!entry) continue;
    const name = f[2].toLowerCase();
    const v = f[3].trim();
    if (name === "source" || name === "lines") {
      const items = v.replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
      entry[name] = name === "lines" ? items.flatMap(expandRange) : items;
    } else entry[name] = unquote(v);
  }
  for (const s of scenes) s.visualName = (s.visual ?? "").replace(/\(tier.*$/i, "").trim().toLowerCase();
  return { title, scenes };
}

/**
 * outline.md's parts table → [{ n, title, stage, teaches, line }]. Columns are found by their header
 * (`#`, `Title…`, `Stage`, `Teaches…`), so a table with extra columns still reads.
 */
export function parseOutline(md) {
  const lines = md.split(/\r?\n/);
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const h = lines.findIndex((l) => /^\s*\|/.test(l) && /\|\s*teaches/i.test(l));
  if (h < 0) return [];
  const head = cells(lines[h]).map((c) => c.toLowerCase());
  const col = (re) => head.findIndex((c) => re.test(c));
  const [cn, ct, cs, cw] = [col(/^#$/), col(/^title/), col(/^stage/), col(/^teaches/)];
  const rows = [];
  for (let i = h + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
    const c = cells(lines[i]);
    rows.push({ n: c[cn] ?? "", title: c[ct] ?? "", stage: (c[cs] ?? "").toLowerCase(), teaches: c[cw] ?? "", line: i + 1 });
  }
  return rows;
}

/** "3-5" → [3,4,5]; "7" → [7]. */
function expandRange(s) {
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return [Number(s)].filter(Number.isFinite);
  const out = [];
  for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(i);
  return out;
}

/** Visible text of a frame composition: tags, styles and scripts stripped, entities decoded. */
export function frameText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8203;/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip pause markers, as narrate does, so sentences read the way they are spoken. */
export const stripMarkers = (s) => s.replace(/\{(beat|pause|think)\}/g, " ").replace(/\s+/g, " ").trim();

export function load(outDir, { channelPath } = {}) {
  const dir = resolve(outDir);
  const segRoot = join(dir, "segments");
  const ids = existsSync(segRoot)
    ? readdirSync(segRoot).filter((d) => /^\d\d$/.test(d) && statSync(join(segRoot, d)).isDirectory()).sort()
    : [];
  const segments = ids.map((id) => {
    const sdir = join(segRoot, id);
    const md = readText(join(sdir, "script.md"));
    const project = join(sdir, "video");
    const framesDir = join(project, "compositions", "frames");
    const frames = existsSync(framesDir)
      ? readdirSync(framesDir)
          .filter((f) => f.endsWith(".html"))
          .sort()
          .map((f) => ({ file: join(framesDir, f), html: readFileSync(join(framesDir, f), "utf8") }))
      : [];
    return {
      id,
      dir: sdir,
      project,
      scriptPath: join(sdir, "script.md"),
      script: md ? parseScript(md) : null,
      frames,
      audioMeta: readJson(join(project, "audio_meta.json")),
      engineMeta: readJson(join(project, "audio_engine_meta.json")),
      storyboard: readText(join(project, "STORYBOARD.md")),
      mp4: existsSync(join(sdir, "segment.mp4")) ? join(sdir, "segment.mp4") : null,
    };
  });
  const chPath = channelPath ? resolve(channelPath) : [join(dir, "channel.json"), join(dir, "..", "..", "channel.json")].find(existsSync);
  const chapter = readJson(join(dir, "chapter.json"));
  return {
    dir,
    segments,
    chapter,
    blocks: new Map((chapter?.blocks ?? []).map((b) => [b.id, b])),
    video: readJson(join(dir, "video.json")),
    channel: chPath ? readJson(chPath) : null,
    channelPath: chPath ?? null,
    lexicon: readJson(join(dir, "lexicon.json")),
    outline: existsSync(join(dir, "outline.md")) ? parseOutline(readFileSync(join(dir, "outline.md"), "utf8")) : null,
    files: {
      captions: readText(join(dir, "captions.srt")),
      description: readText(join(dir, "description.txt")),
      chapters: readText(join(dir, "chapters.txt")),
      notebook: readJson(join(dir, "notebook.ipynb")),
      video: existsSync(join(dir, "video.mp4")) ? join(dir, "video.mp4") : null,
    },
  };
}

/** True when a segment is a bonus part: its title, or its video.json title, starts with Bonus, Stretch or Optional. */
export function isBonus(ctx, seg) {
  const vt = ctx.video?.segments?.find((s) => s.id === seg.id)?.title ?? "";
  const re = /^(bonus|stretch|optional)\b/i;
  return re.test(seg.script?.title ?? "") || re.test(vt);
}
