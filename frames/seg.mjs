#!/usr/bin/env node
// seg.mjs — per-segment plumbing for chalk-youtube step 4, run from the output dir (chalk/frames).
//
//   node seg.mjs setup NN    BRIEF.md, capture/, frame.md, staged fonts + GSAP, SCRIPT.md, STORYBOARD.md
//   node seg.mjs sync NN     real take lengths → STORYBOARD.md durations (+1.8s hold on the last frame)
//   node seg.mjs words NN    one absolute word stream → work/NN/words.json
//   node seg.mjs voice       print "<voice> <speed> <polish>" from channel.json, for build.sh
//
// The voice, series and banned terms come from channel.json (CHALK_CHANNEL, or the nearest one above the
// output dir). Fonts and GSAP come from the shared cache build.sh fills (CHALK_ASSETS).
//
// `sync` is faceless-explainer's sync-durations plus the end hold it deletes (step-4 § 6).

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";

const OUT = resolve(".");
const ASSETS = process.env.CHALK_ASSETS ?? join(homedir(), ".cache/chalk-youtube/assets");
const findChannel = () => {
  if (process.env.CHALK_CHANNEL) return process.env.CHALK_CHANNEL;
  for (let d = OUT; ; d = dirname(d)) {
    if (existsSync(join(d, "channel.json"))) return join(d, "channel.json");
    if (dirname(d) === d) return null;
  }
};
const channel = () => {
  const p = findChannel();
  return p ? JSON.parse(readFileSync(p, "utf8")) : null;
};
const FE = join(homedir(), ".claude/skills/faceless-explainer");
const [cmd, nn] = process.argv.slice(2);
// each part ends on a short hold; the video's last part (the outro) on ~20s, room for YouTube's end screen.
// END_HOLD overrides both. The outro used to get 1.8s unless END_HOLD=20 was passed by hand.
const lastPart = () => {
  try {
    return readdirSync(join(OUT, "segments")).filter((d) => /^\d\d$/.test(d)).sort().at(-1);
  } catch {
    return null;
  }
};
// a Short (short.json) loops: it ends on a beat, not an end screen, and it is portrait
const SHORT = existsSync(join(OUT, "short.json"));
const FORMAT = SHORT ? "1080x1920" : "1920x1080";
const HOLD = Number(process.env.END_HOLD ?? (SHORT ? 0.6 : nn && nn === lastPart() ? 20 : 1.8));
if (cmd === "voice") {
  const c = channel();
  if (!c?.voice) {
    console.error("seg: channel.json has no voice — audition and record one; never fall back silently");
    process.exit(1);
  }
  // a Short may set its own voice and pace (news is read brighter and faster than a lesson): short.json "voice", "speed"
  const own = SHORT ? JSON.parse(readFileSync(join(OUT, "short.json"), "utf8")) : {};
  console.log(`${own.voice ?? c.voice} ${own.speed ?? c.speed ?? 0.93} ${c.polish ? "polish" : "plain"}`);
  process.exit(0);
}
if (!cmd || !/^\d\d$/.test(nn ?? "")) {
  console.error("usage: seg.mjs setup|sync|words NN");
  process.exit(2);
}
const segDir = join(OUT, "segments", nn);
const proj = join(segDir, "video");
const die = (m) => {
  console.error(`seg ${nn}: ${m}`);
  process.exit(1);
};

/** script.md → { title, scenes: [{ n, title, visual, tier, example, computedBy, onScreen, entries }] } */
export function parseScript(md) {
  const title = md.match(/^#\s+\d+\s+—\s+(.+)$/m)?.[1]?.trim() ?? "";
  const scenes = [];
  let cur = null;
  let entry = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+Scene\s+(\d+)\s+—\s+(.+)$/);
    if (h) {
      cur = { n: Number(h[1]), title: h[2].trim(), entries: [] };
      scenes.push(cur);
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^(visual|example|computed-by|on-screen|duration|stage|code):\s*(.*)$/);
    if (kv) {
      cur[kv[1].replace(/-(\w)/g, (_, c) => c.toUpperCase())] = kv[2].trim();
      continue;
    }
    const f = line.match(/^\s*(-\s*)?(spoken|display|source):\s*(.*)$/);
    if (!f) continue;
    if (f[1]) {
      entry = { spoken: "", display: "", source: [] };
      cur.entries.push(entry);
    }
    const v = f[3].trim();
    if (f[2] === "source") entry.source = v.replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    else entry[f[2]] = v.replace(/^"|"$/g, "");
  }
  return { title, scenes };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
const frameId = (s) => `f${String(s.n).padStart(2, "0")}-${slug(s.title)}`;
const script = () => parseScript(readFileSync(join(segDir, "script.md"), "utf8"));

function setup() {
  if (!existsSync(join(proj, "hyperframes.json"))) die("run hyperframes init first");
  const { title, scenes } = script();
  const chapter = JSON.parse(readFileSync(join(OUT, "chapter.json"), "utf8"));
  const byId = new Map(chapter.blocks.map((b) => [b.id, b]));
  const cited = [...new Set(scenes.flatMap((s) => s.entries.flatMap((e) => e.source)))];
  const manifest = SHORT ? "short.json" : "video.json";
  const video = existsSync(join(OUT, manifest)) ? JSON.parse(readFileSync(join(OUT, manifest), "utf8")) : {};
  const ch = channel();
  // a marker ending a scene becomes the silence before the next scene's take (narrate); the last scene has no next take
  const last = scenes.at(-1);
  if (last && /\{(beat|pause|think)\}\s*$/.test(last.entries.at(-1)?.spoken ?? "")) die(`a pause marker ends scene ${last.n}, the last in the part; no take follows to hold it — remove it`);

  writeFileSync(
    join(proj, "BRIEF.md"),
    `---
workflow: faceless-explainer
flow: automation
storyboard: no
message: "${title}"
destination: ${SHORT ? "youtube-shorts" : "youtube"}
aspect: ${FORMAT}
fps: 30
language: en
audience: "${video.audience ?? "learners"}"
style_preset: broadside
---

## Intent

${SHORT ? `The chalk Short "${video.title ?? ""}"` : `Segment ${nn} of the chalk-youtube video "${video.title ?? ""}" — one YouTube chapter, "${title}"`}. Driven by chalk step 4; the two-layer script in
\`segments/${nn}/script.md\` is locked. Format pinned: ${SHORT ? "portrait" : "landscape"} ${FORMAT} at 30fps.

## Notes

- Source blocks: ${cited.join(", ")} (chapter.json).
- Design preset: broadside, dark register, for every segment of this video.
- Narration by chalk-core narrate (Kokoro), not audio.mjs. No BGM, no SFX.
- Captions come from the display layer (build-tokens → align-captions → apply-display).
- Code on screen is verbatim from chapter.json code blocks.
- Derived examples carry no label on screen.
${scenes.map((s) => `- Scene ${s.n} (${s.visual}${s.example ? `, example: ${s.example}` : ""}${s.computedBy ? `, computed-by: ${s.computedBy}` : ""})`).join("\n")}
`,
  );

  mkdirSync(join(proj, "capture/extracted"), { recursive: true });
  writeFileSync(
    join(proj, "capture/extracted/visible-text.txt"),
    cited.map((id) => `[${id}]\n${byId.get(id)?.text ?? ""}`).join("\n\n") + "\n",
  );
  writeFileSync(
    join(proj, "capture/extracted/tokens.json"),
    JSON.stringify({ title, description: `${video.title ?? ""}, segment ${nn}`, colors: [], fonts: [] }, null, 2) + "\n",
  );

  const bf = spawnSync("node", [join(FE, "scripts/build-frame.mjs"), "--preset", "broadside", "--hyperframes", "."], {
    cwd: proj,
    encoding: "utf8",
  });
  if (bf.status !== 0) die(`build-frame failed:\n${bf.stderr || bf.stdout}`);
  // Broadside lowercases every caption; a coding video's captions carry O(n), SQL and True, so they keep
  // the display layer's case (the on-screen titles keep the lowercase look through framelib).
  const skin = join(proj, ".hyperframes/caption-skin.html");
  if (existsSync(skin)) writeFileSync(skin, readFileSync(skin, "utf8").replace(/\n(\s*)text-transform: lowercase;/, "\n$1text-transform: none;"));

  if (!existsSync(join(ASSETS, "gsap.min.js"))) die(`no staged fonts/GSAP in ${ASSETS} — run build.sh assets first`);
  mkdirSync(join(proj, "assets/fonts"), { recursive: true });
  copyFileSync(join(ASSETS, "gsap.min.js"), join(proj, "assets/gsap.min.js"));
  for (const f of readdirSync(join(ASSETS, "fonts"))) copyFileSync(join(ASSETS, "fonts", f), join(proj, "assets/fonts", f));

  let s = `# SCRIPT — segment ${nn}\n\n**Voice:** Kokoro ${ch?.voice ?? "(unset)"}\n**Voice direction:** A teacher talking to one viewer: warm, unhurried, clear.\n\n---\n`;
  let b = `---\nformat: ${FORMAT}\nfps: 30\nduration: ${scenes.reduce((a, x) => a + parseFloat(x.duration?.match(/[\d.]+/)?.[0] ?? 0), 0)}s\nmessage: "${title}"\naudience: "${video.audience ?? "learners"}"\nmode: autonomous\nmusic: none\n---\n`;
  for (const sc of scenes) {
    const spoken = sc.entries.map((e) => e.spoken).join(" ");
    s += `\n## Line ${sc.n} — ${sc.title} (Frame ${sc.n})\n\n    ${spoken}\n`;
    b += `\n## Frame ${sc.n} — ${sc.title}\n\n- scene: ${sc.onScreen ?? sc.title}\n- duration: ${sc.duration?.replace("~", "") ?? "10s"}\n- transition_in: ${sc.n === 1 ? "cut" : "crossfade"}\n- status: outline\n- voiceover: "${sc.entries.map((e) => e.display).join(" ")}"\n- src: compositions/frames/${frameId(sc)}.html\n- visual: ${sc.visual}\n`;
  }
  writeFileSync(join(proj, "SCRIPT.md"), s);
  writeFileSync(join(proj, "STORYBOARD.md"), b);
  console.log(`seg ${nn}: setup done, ${scenes.length} frame(s): ${scenes.map(frameId).join(" ")}`);
}

function sync() {
  const meta = JSON.parse(readFileSync(join(proj, "audio_meta.json"), "utf8"));
  const dur = new Map(meta.voices.map((v) => [Number(v.frame ?? v.id), v.duration_s]));
  const last = Math.max(...dur.keys());
  const lines = readFileSync(join(proj, "STORYBOARD.md"), "utf8").split("\n");
  let cur = null;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const h = lines[i].match(/^## Frame (\d+)/);
    if (h) cur = Number(h[1]);
    else if (cur != null && /^- duration:/.test(lines[i]) && dur.has(cur)) {
      const d = dur.get(cur) + (cur === last ? HOLD : 0);
      lines[i] = `- duration: ${Number(d.toFixed(3))}s`;
      n++;
    }
  }
  writeFileSync(join(proj, "STORYBOARD.md"), lines.join("\n"));
  console.log(`seg ${nn}: ${n} duration(s) synced; frame ${last} carries the ${HOLD}s end hold`);
}

function words() {
  const meta = JSON.parse(readFileSync(join(proj, "audio_meta.json"), "utf8"));
  let t = 0;
  const out = [];
  const fr = (v) => Number(v.frame ?? v.id);
  for (const v of [...meta.voices].sort((a, b) => fr(a) - fr(b))) {
    for (const w of v.words) out.push({ text: w.text, start: +(t + w.start).toFixed(3), end: +(t + w.end).toFixed(3), frame: fr(v) });
    t += v.duration_s;
  }
  mkdirSync(join(OUT, "work", nn), { recursive: true });
  writeFileSync(join(OUT, "work", nn, "words.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`seg ${nn}: ${out.length} words over ${t.toFixed(2)}s → work/${nn}/words.json`);
}

const run = { setup, sync, words }[cmd];
if (!run) die(`unknown command ${cmd}`);
run();
