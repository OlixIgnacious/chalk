// eval.mjs — the destination pack: whether what each platform would be sent fits it. Group "platform", run by
// `chalk publish <out> --plan` and by `chalk eval` when the manifest names publish.to. Platform rules live here
// and in platforms.json, never in evals/shared.mjs: a lesson has no destination, and the eval stage hashes only
// evals/ and the pack.
//
//   P1  duration within the platform's cap for the shape        P4  no URL where links are dead
//   P2  title and text within limits, nothing cut                P5  the cover within the platform's size limits
//   P3  hashtags within the cap, none generic                    P6  the first visible characters carry the thesis

import { existsSync, statSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { LIMITS, shape } from "./lib/shape.mjs";

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+\.\w+/i;
const WEAK_OPEN = /^\s*(#|hey\b|hi\b|hello\b|so\b|today\b|in this video\b|welcome\b|what's up\b)/i;

const ok = (evidence = []) => ({ status: "pass", evidence });
const no = (evidence) => ({ status: "fail", evidence });
const skip = (why) => ({ status: "skip", evidence: [why] });

const dims = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" });
  const [w, h] = (r.stdout ?? "").trim().split(",").map(Number);
  return w && h ? { w, h } : null;
};

export const CRITERIA = [
  {
    id: "P1", title: "Duration within the platform's cap for this shape", weight: 2,
    run: ({ kit, lim }) => {
      const cap = lim.duration_max_s?.[kit.shape];
      if (!cap) return skip("no cap");
      return kit.duration <= cap ? ok([`${kit.duration.toFixed(1)} s ≤ ${cap} s`]) : no([`${kit.duration.toFixed(1)} s is over the ${cap} s this platform takes for a ${kit.shape}`]);
    },
  },
  {
    id: "P2", title: "Title and text within the platform's limits, nothing cut to fit", weight: 2,
    run: ({ s, lim }) => {
      const ev = [];
      if (s.title && lim.title_max && s.title.length > lim.title_max) ev.push(`title ${s.title.length} > ${lim.title_max}`);
      if (s.text.length > lim.text_max) ev.push(`text ${s.text.length} > ${lim.text_max}`);
      for (const w of s.warnings) if (/\b(title|text) cut\b/.test(w)) ev.push(w);
      return ev.length ? no(ev) : ok([`text ${s.text.length}/${lim.text_max}`]);
    },
  },
  {
    id: "P3", title: "Hashtags within the platform's cap, none generic (#fyp, #viral…)", weight: 1,
    run: ({ s, lim, platform }) => {
      const tags = s.text.match(/#\w+/g) ?? [];
      const ev = [];
      if (lim.hashtag_max != null && tags.length > lim.hashtag_max) ev.push(`${tags.length} hashtags; ${lim.hashtag_max} at most`);
      const generic = tags.filter((t) => (lim.generic_tags ?? []).includes(t.toLowerCase()));
      if (generic.length) ev.push(`generic: ${generic.join(" ")}`);
      if (platform !== "youtube" && tags.some((t) => t.toLowerCase() === "#shorts")) ev.push("#Shorts outside YouTube");
      return ev.length ? no(ev) : ok([tags.join(" ") || "none"]);
    },
  },
  {
    id: "P4", title: "No URL in the text where the platform's links are dead", weight: 2,
    run: ({ s, lim }) => {
      if (lim.links_clickable) return ok(["links work here"]);
      const m = s.text.match(URL_RE);
      return m ? no([`"${m[0]}" is dead text here: put it in the bio${lim.first_comment ? " or the first comment" : ""}`]) : ok();
    },
  },
  {
    id: "P5", title: "The cover is within the platform's size limits", weight: 1,
    run: ({ s, lim, out }) => {
      if (!s.cover) return skip("no cover for this platform and shape");
      const f = join(out, s.cover);
      if (!existsSync(f)) return no([`${s.cover} is not there`]);
      const ev = [];
      const bytes = statSync(f).size;
      if (lim.cover.max_bytes && bytes > lim.cover.max_bytes) ev.push(`${s.cover} is ${bytes} bytes; ${lim.cover.max_bytes} at most`);
      const d = dims(f);
      if (d && Math.abs(d.w / d.h - lim.cover.width / lim.cover.height) > 0.02) ev.push(`${s.cover} is ${d.w}x${d.h}; the platform wants ${lim.cover.width}x${lim.cover.height}`);
      return ev.length ? no(ev) : ok([`${s.cover}${d ? ` ${d.w}x${d.h}` : ""}, ${bytes} bytes`]);
    },
  },
  {
    id: "P6", title: "The first characters a feed shows carry the thesis, not a greeting or a hashtag", weight: 2,
    run: ({ s, lim, kit }) => {
      const shown = s.text.slice(0, lim.visible_chars ?? 125);
      if (WEAK_OPEN.test(s.title ?? shown) && !s.title) return no([`opens weakly: "${shown.slice(0, 40)}"`]);
      if (WEAK_OPEN.test(shown)) return no([`opens weakly: "${shown.slice(0, 40)}"`]);
      const key = (kit.thesis ?? kit.title).toLowerCase().split(/\s+/).slice(0, 4).join(" ");
      return shown.toLowerCase().includes(key) ? ok([`"${shown.slice(0, 60)}…"`]) : no([`the first ${lim.visible_chars} characters do not carry the thesis: "${shown.slice(0, 60)}…"`]);
    },
  },
];

/** Every P criterion for every platform: [{ platform, id, title, weight, status, evidence }]. */
export function platformEval(out, kit, channel, platforms, overrides = {}) {
  const results = [];
  for (const platform of platforms) {
    if (platform === "kit") continue;
    const lim = LIMITS[platform];
    const s = shape(platform, kit, channel, overrides[platform]);
    for (const c of CRITERIA) {
      let r;
      try {
        r = c.run({ s, lim, kit, out, platform });
      } catch (e) {
        r = no([`criterion crashed: ${e.message}`]);
      }
      results.push({ platform, id: `${c.id}·${platform}`, group: "platform", title: `${c.title} (${platform})`, weight: c.weight, ...r });
    }
  }
  return results;
}

export const readKit = (out) => (existsSync(join(out, "kit.json")) ? JSON.parse(readFileSync(join(out, "kit.json"), "utf8")) : null);
