// cues.mjs — when to look at a segment's frames: three stills per reveal, read from the cues framelib writes.
//
// framelib's write() leaves <frame>.cues.json beside each frame: every substantive reveal's start and duration
// on the segment's clock. Reveals that start together (within 0.35 s of the moment's first, in one frame: a word
// apart, which a viewer sees as one change) are one moment. For each:
//
//   entry    t + 0.1 s          is it arriving where it should, from where it should?
//   settled  t + its duration   the finished state: clipping, overflow, overlap, contrast
//   hold     next − 0.1 s       the last moment before the next reveal (or the frame's end): is it still right?
//
// The frames reviewer reads these stills before the render (chalk stills NN --at-cues).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every frame's cues in a segment's HyperFrames project, in frame order. */
export function readCues(project) {
  const dir = join(project, "compositions", "frames");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".cues.json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    .sort((a, b) => a.no - b.no);
}

/** Reveals closer than this to a moment's first are part of it. */
export const TOGETHER = 0.35;

/** The reveals: cues grouped by frame and start time. → [{ frame, no, t, dur, text, frameEnd }] */
export function reveals(frames) {
  const out = [];
  for (const f of frames) {
    for (const c of f.cues ?? []) {
      const last = out.at(-1);
      if (last && last.frame === f.frame && c.t - last.t <= TOGETHER) {
        last.dur = r3(Math.max(last.dur, c.t - last.t + c.dur));
        if (c.text && !last.text.includes(c.text)) last.text = [last.text, c.text].filter(Boolean).join(" / ");
      } else out.push({ frame: f.frame, no: f.no, t: c.t, dur: c.dur, text: c.text ?? "", frameEnd: f.end });
    }
  }
  return out;
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/** Three moments per reveal, each inside its frame. → [{ ...reveal, at: [entry, settled, hold] }] */
export function stillTimes(rs) {
  return rs.map((r, i) => {
    const next = rs[i + 1] && rs[i + 1].frame === r.frame ? rs[i + 1].t : r.frameEnd;
    const hold = Math.max(r.t + 0.1, next - 0.1);
    const settled = Math.min(r.t + Math.max(r.dur, 0.1), hold);
    return { ...r, at: [r3(r.t + 0.1), r3(settled), r3(hold)] };
  });
}
