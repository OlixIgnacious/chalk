// criteria.mjs — what a good Short needs on top of the shared criteria (evals/shared.mjs): one idea, short
// enough to hold a phone viewer, a payoff in the first seconds, nothing under the platform's own buttons and
// captions, nothing that names the source, and a way to the full walkthrough.

import { readFileSync } from "node:fs";
import { stripMarkers } from "../../../evals/lib/load.mjs";
import { pass, fail, skip, scenesOf } from "../../../evals/lib/kit.mjs";

// the safe box framelib draws in, from one file (frames/safe.json): content inside the platforms' clear bands
const SAFE = JSON.parse(readFileSync(new URL("../../../frames/safe.json", import.meta.url), "utf8")).portrait;
const BANDS = SAFE.content; // [[top, bottom, left, right], …] top to bottom
const TOP = BANDS[0][0], BOTTOM = BANDS.at(-1)[1];
const BANNED = ["chapter", "chapters", "book", "section", "the author"];
const CHROME = /-(kicker|hair|ground|layer|stage)\b/;

/** Seconds of the Short: the delivered file when there is one, else the narrated takes plus holds. */
function length(ctx, env) {
  if (ctx.files.video) {
    const d = env.duration(ctx.files.video);
    if (d) return d;
  }
  const sb = ctx.segments[0]?.storyboard;
  if (!sb) return null;
  return [...sb.matchAll(/- duration: ([\d.]+)s/g)].reduce((a, m) => a + Number(m[1]), 0);
}

const short = [
  {
    id: "S1",
    group: "short",
    title: "One idea: a Short is one part of at most three scenes",
    weight: 2,
    run(ctx) {
      if (!ctx.short) return skip("no short.json");
      const segs = ctx.segments.filter((s) => s.script);
      if (!segs.length) return skip("no script");
      const ev = [];
      if (segs.length > 1) ev.push(`${segs.length} parts; a Short is one`);
      const n = segs[0].script.scenes.length;
      if (n > 3) ev.push(`segments/${segs[0].id}: ${n} scenes; one idea fits in three`);
      return ev.length ? fail(ev) : pass([`1 part, ${n} scene(s)`]);
    },
  },
  {
    id: "S2",
    group: "short",
    title: "15 to 60 seconds (Shorts and Reels allow 3 minutes; past 60 s viewers leave)",
    weight: 2,
    run(ctx, env) {
      if (!ctx.short) return skip("no short.json");
      const d = length(ctx, env);
      if (d == null) return skip("not narrated yet");
      if (d > 180) return fail([`${d.toFixed(1)}s: over the 3-minute limit`]);
      if (d > 60 || d < 15) return fail([`${d.toFixed(1)}s`]);
      return pass([`${d.toFixed(1)}s`]);
    },
  },
  {
    id: "S3",
    group: "short",
    title: "It opens on its payoff: the voice starts within 0.8 s and something to look at is on screen within 2 s",
    weight: 2,
    run(ctx) {
      const s = ctx.segments[0];
      const words = s?.audioMeta?.voices?.find((v) => Number(v.frame ?? v.id) === 1)?.words;
      if (!words?.length) return skip("not narrated yet");
      const ev = [];
      if (words[0].start > 0.8) ev.push(`the first word starts at ${words[0].start.toFixed(2)}s`);
      const f1 = s.frames.find((f) => /\/f01-/.test(f.file));
      if (f1) {
        const times = [...f1.html.matchAll(/tl\.\w+\("([^"]+)"[^;]*, ([\d.]+)\);/g)].filter((m) => !CHROME.test(m[1])).map((m) => Number(m[2]));
        if (times.length && Math.min(...times) > 2) ev.push(`the first thing to look at appears at ${Math.min(...times).toFixed(2)}s`);
      }
      return ev.length ? fail(ev) : pass([`voice at ${words[0].start.toFixed(2)}s${f1 ? ", picture within 2s" : ""}`]);
    },
  },
  {
    id: "S4",
    group: "short",
    title: `Nothing drawn where TikTok, Reels or Shorts put their title, buttons or captions (content in y ${TOP}–${BOTTOM}, x ${BANDS.map((b) => `${b[2]}–${b[3]}`).join(" / ")}; frames/safe.json)`,
    weight: 2,
    run(ctx) {
      const frames = ctx.segments.flatMap((s) => s.frames);
      if (!frames.length) return skip("no frames");
      const ev = [];
      for (const f of frames) {
        const where = f.file.split("/segments/")[1];
        if (/data-width="1920"/.test(f.html)) ev.push(`${where}: drawn landscape`);
        const stage = f.html.split(/<div id="[^"]+-stage"/)[1]?.split(/<script/)[0] ?? "";
        // a top-level element on the stage: its id and its box (left, top and, when it has one, width)
        for (const m of stage.matchAll(/<div id="([^"]+)"[^>]*?style="position:absolute;left:(-?\d+)px;top:(-?\d+)px;(?:width:(\d+)px;)?/g)) {
          if (CHROME.test(m[1])) continue;
          const [l, t, w] = [Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 0];
          const band = BANDS.find((b) => t >= b[0] && t < b[1]);
          if (t < TOP || t >= BOTTOM) ev.push(`${where}: #${m[1]} at y=${t}, outside ${TOP}–${BOTTOM}`);
          else if (l < band[2] || l + w > band[3]) ev.push(`${where}: #${m[1]} spans x ${l}–${l + w} at y=${t}; ${band[2]}–${band[3]} is clear there`);
        }
      }
      return ev.length ? fail(ev.slice(0, 10)) : pass([`${frames.length} frame(s) inside the safe area`]);
    },
  },
  {
    id: "S5",
    group: "short",
    title: "The title fits (100 characters) and nothing seen or heard names the source",
    weight: 3,
    run(ctx) {
      if (!ctx.short) return skip("no short.json");
      const terms = [...BANNED, ...(ctx.channel?.banned_terms ?? [])];
      const re = new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
      const ev = [];
      const title = ctx.short.title ?? "";
      if (!title) ev.push("short.json has no title");
      if (title.length > 100) ev.push(`title is ${title.length} characters`);
      for (const [what, text] of [["title", title], ["thesis", ctx.short.thesis ?? ""]]) if (re.test(text)) ev.push(`${what} says "${text.match(re)[1]}"`);
      for (const { seg, sc } of scenesOf(ctx)) {
        for (const e of sc.entries) {
          const m = stripMarkers(`${e.spoken} ${e.display}`).match(re);
          if (m) ev.push(`segments/${seg.id} scene ${sc.n}: "${m[1]}"`);
        }
      }
      return ev.length ? fail(ev) : pass();
    },
  },
  {
    id: "S6",
    group: "short",
    title: "It ends by pointing somewhere (a [pipeline] line), and short.json names it: the full video, or the sources of a news Short",
    weight: 1,
    run(ctx) {
      if (!ctx.short) return skip("no short.json");
      const sc = ctx.segments[0]?.script?.scenes.at(-1);
      if (!sc) return skip("no script");
      const last = sc.entries.at(-1);
      // a recut keeps the long part's narration: its pointer is drawn in the last frame's hold, not spoken
      if (ctx.short.recut) {
        return ctx.short.full_video?.title ? pass([`a recut of ${ctx.short.recut.segment}: the pointer to "${ctx.short.full_video.title}" is drawn in the end hold`])
          : fail(["a recut's short.json has no full_video.title to point to"]);
      }
      const ev = [];
      if (!last?.source?.includes("pipeline")) ev.push(`the last line cites ${JSON.stringify(last?.source ?? [])}, not [pipeline]: it is not a pointer`);
      if (!ctx.short.full_video?.title && !ctx.short.sources?.length) ev.push("short.json has no full_video.title or sources for the description");
      return ev.length ? fail(ev) : pass([`"${last.display}"`]);
    },
  },
  {
    id: "S7",
    group: "short",
    title: "The first line is a hook: at most 12 words, its first sentence ends by 3 s, no weak opener (so, today, in this video, have you ever, this is…) and no greeting",
    weight: 2,
    run(ctx) {
      const s = ctx.segments[0];
      const first = s?.script?.scenes[0]?.entries[0];
      if (!first) return skip("no script");
      const line = stripMarkers(first.spoken || first.display);
      const ev = [];
      const n = line.split(/\s+/).filter(Boolean).length;
      if (n > 12) ev.push(`${n} words: "${line.slice(0, 80)}"`);
      if (WEAK.test(line)) ev.push(`opens weakly: "${line.slice(0, 40)}"`);
      const words = s.audioMeta?.voices?.find((v) => Number(v.frame ?? v.id) === 1)?.words;
      const firstSentence = line.split(/(?<=[.!?])\s/)[0];
      const k = firstSentence.split(/\s+/).filter(Boolean).length;
      if (words?.length >= k && !s.audioStale && words[k - 1].end > 3) ev.push(`its first sentence ends at ${words[k - 1].end.toFixed(2)} s`);
      return ev.length ? fail(ev) : pass([`"${line}"`]);
    },
  },
];

const WEAK = /^\s*(so\b|today\b|in this (video|short)\b|have you ever\b|this is\b|hey\b|hi\b|hello\b|welcome\b|what's up\b|let's talk\b|did you know\b)/i;

export const CRITERIA = short;
export const GROUPS = ["short"];
