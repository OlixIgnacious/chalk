// read-aloud.mjs — the scripts as a viewer would get them, before anything is voiced: each part's title, what
// is on screen, the code shown, and the lines as the captions will read. No citations, no stage names, no
// visual notes, no source: the chalk-learner agent reads this in script mode, so its questions reach the
// author while a fix is still a script edit, not a re-narration.
//
//   chalk read-aloud <out>

import { load, stripMarkers } from "../evals/lib/load.mjs";

export function readAloud(out) {
  const ctx = load(out);
  const lines = [];
  for (const seg of ctx.segments) {
    if (!seg.script) continue;
    lines.push(`## Part ${seg.id} — ${seg.script.title}`, "");
    for (const sc of seg.script.scenes) {
      if (sc.onScreen) lines.push(`[on screen: ${sc.onScreen}]`);
      const code = sc.code && ctx.blocks.get(sc.code);
      if (code) lines.push("[code on screen]", "```", code.text, "```");
      for (const e of sc.entries) lines.push(stripMarkers(e.display || e.spoken));
      lines.push("");
    }
  }
  return lines.join("\n");
}

export function main(argv) {
  const out = argv.find((a) => !a.startsWith("--"));
  if (!out) {
    console.error("usage: chalk read-aloud <out>");
    return 2;
  }
  console.log(readAloud(out));
  return 0;
}
