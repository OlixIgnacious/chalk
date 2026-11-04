// criteria.mjs — what a good Short needs on top of the shared criteria (evals/shared.mjs): one idea, short
// enough to hold a phone viewer, a payoff in the first seconds, nothing under the platform's own buttons and
// captions, nothing that names the source, and a way to the full walkthrough.

import { stripMarkers } from "../../../evals/lib/load.mjs";
import { pass, fail, skip, scenesOf } from "../../../evals/lib/kit.mjs";

const SAFE_BOTTOM = 1320; // framelib.KEEP_OUT in portrait: captions below it, then the platform's zone
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
    title: `Nothing drawn where the platform puts its captions, title and buttons (content above y=${SAFE_BOTTOM})`,
    weight: 2,
    run(ctx) {
      const frames = ctx.segments.flatMap((s) => s.frames);
      if (!frames.length) return skip("no frames");
      const ev = [];
      for (const f of frames) {
        const stage = f.html.split(/<div id="[^"]+-stage"/)[1]?.split(/<script/)[0] ?? "";
        for (const m of stage.matchAll(/id="([^"]+)"[^>]*?top:(\d+)px/g)) {
          if (Number(m[2]) > SAFE_BOTTOM) ev.push(`${f.file.split("/segments/")[1]}: #${m[1]} at y=${m[2]}`);
        }
        if (/data-width="1920"/.test(f.html)) ev.push(`${f.file.split("/segments/")[1]}: drawn landscape`);
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
      const ev = [];
      if (!last?.source?.includes("pipeline")) ev.push(`the last line cites ${JSON.stringify(last?.source ?? [])}, not [pipeline]: it is not a pointer`);
      if (!ctx.short.full_video?.title && !ctx.short.sources?.length) ev.push("short.json has no full_video.title or sources for the description");
      return ev.length ? fail(ev) : pass([`"${last.display}"`]);
    },
  },
];

export const CRITERIA = short;
export const GROUPS = ["short"];
