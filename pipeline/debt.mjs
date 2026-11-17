// debt.mjs — the pipeline items earlier builds left open.
//
// A resolution.md ends with a "## Pipeline" checklist: what the chalk repo must change so the next build
// does not repeat this one's mistakes. Each line is open until it names the commit that landed it, or says
// why it was put off:
//
//   - [ ] F.pointer_walk in framelib, from dsa-04 s11.py                  open
//   - [x] F.pointer_walk in framelib, from dsa-04 s11.py — 3f2c1ab         closed (the commit exists in chalk)
//   - [x] E5, the insight-pace criterion — deferred: needs a fixture first  closed (put off, with a reason)
//
// A ticked line whose commit is not in the chalk repo is still open: the item is closed by the commit,
// not by the tick. The pipeline-debt stage waits on these before a new build's frames are written, because
// a round that only fixes its own video leaves the guard for "later", and later never comes.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SKIP = new Set(["node_modules", ".git", ".chalk", "segments", "work", "frames", "renders", "assets"]);
const known = new Map();

/** True when `sha` names a commit in the chalk repo. */
export function isCommit(repo, sha) {
  const k = `${repo}\0${sha}`;
  if (!known.has(k)) {
    const r = spawnSync("git", ["-C", repo, "cat-file", "-e", `${sha}^{commit}`], { stdio: "ignore" });
    known.set(k, r.status === 0);
  }
  return known.get(k);
}

/** The "## Pipeline" checklist of one resolution.md, as [{ line, text, done, why }]. */
export function parseDebt(md, repo) {
  const items = [];
  let inside = false;
  md.split("\n").forEach((l, i) => {
    if (/^##\s/.test(l)) inside = /^##\s+Pipeline\b/i.test(l);
    if (!inside) return;
    const m = l.match(/^\s*[-*]\s+\[([ xX~])\]\s+(.*)$/);
    if (!m) return;
    const text = m[2].trim();
    const ticked = m[1] !== " ";
    const deferred = /\bdeferred:\s*\S/i.test(text);
    const shas = [...text.matchAll(/\b[0-9a-f]{7,40}\b/g)].map((x) => x[0]).filter((s) => /[a-f]/.test(s) && /\d/.test(s));
    const landed = shas.some((s) => isCommit(repo, s));
    let why = null;
    if (!ticked) why = "open";
    else if (!deferred && !shas.length) why = "ticked, but names no commit";
    else if (!deferred && !landed) why = `ticked, but ${shas.join(", ")} is not a commit in chalk`;
    items.push({ line: i + 1, text, done: !why, why });
  });
  return items;
}

/** Every resolution.md in the workspace (the channel.json dir, else the output dir's parent), up to two levels down. */
function resolutions(root) {
  const found = [];
  const walk = (d, depth) => {
    let names = [];
    try { names = readdirSync(d); } catch { return; }
    for (const n of names) {
      if (SKIP.has(n) || n.startsWith(".") || /^previous-/.test(n)) continue;
      const p = join(d, n);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (n === "resolution.md" && depth > 0) found.push(p);
    }
  };
  walk(root, 0);
  return found.sort();
}

/** The open items of every other build in this workspace: [{ file, line, text, why }]. */
export function openDebt(o, repo) {
  const root = o.channelPath ? dirname(o.channelPath) : dirname(o.out);
  const self = existsSync(o.out) ? realpathSync(o.out) : o.out;
  const open = [];
  for (const f of resolutions(root)) {
    if (realpathSync(dirname(f)) === self) continue; // a build's own items are for the next one
    for (const it of parseDebt(readFileSync(f, "utf8"), repo)) {
      if (!it.done) open.push({ file: relative(root, f), line: it.line, text: it.text, why: it.why });
    }
  }
  return open;
}
