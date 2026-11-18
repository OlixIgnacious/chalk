// shape.mjs — the kit in each platform's words. Pure: kit + channel + overrides → what that platform is sent.
//
//   shape(platform, kit, channel, overrides) → { platform, title, text, tags, first_comment, cover, captions,
//                                                file, warnings[] }
//
// The kit (publish/lib/kit.mjs) is neutral; everything a platform wants differently happens here, from the
// limits in publish/platforms.json: Instagram and TikTok lead with the thesis inside what the feed shows and move
// links to the bio or the first comment (their captions' links are dead); X fits 280 characters; #Shorts goes
// only to YouTube; hashtags are capped per platform and generic ones (#fyp, #viral) are dropped.

import { readFileSync } from "node:fs";
import { describe } from "./kit.mjs";

export const LIMITS = JSON.parse(readFileSync(new URL("../platforms.json", import.meta.url), "utf8"));
export const PLATFORMS = Object.keys(LIMITS).filter((k) => !k.startsWith("_"));

const tagOf = (h) => (h.startsWith("#") ? h : `#${h}`).replace(/\s+/g, "");
const lower = (s) => s.toLowerCase();

/** A platform's settings in channel.json: destinations.<p>, or the old top-level youtube block. */
export function destinationOf(channel, platform) {
  const d = channel?.destinations?.[platform];
  if (d) return d;
  if (platform === "youtube" && channel?.youtube) return channel.youtube;
  return {};
}

/** Hashtags for a platform: the kit's and the channel's, #Shorts only for YouTube, no generic ones, capped. */
function hashtags(platform, kit, dest, warnings) {
  const lim = LIMITS[platform];
  const all = [...(kit.hashtags ?? []), ...(dest.hashtags ?? [])].map(tagOf);
  const seen = new Set();
  const out = [];
  for (const h of all) {
    const k = lower(h);
    if (seen.has(k)) continue;
    seen.add(k);
    if (k === "#shorts" && platform !== "youtube") continue;
    if ((lim.generic_tags ?? []).includes(k)) {
      warnings.push(`${h} dropped: a generic tag says nothing about the video`);
      continue;
    }
    out.push(h);
  }
  if (lim.hashtag_max != null && out.length > lim.hashtag_max) {
    warnings.push(`hashtags capped at ${lim.hashtag_max}: dropped ${out.slice(lim.hashtag_max).join(" ")}`);
    return out.slice(0, lim.hashtag_max);
  }
  return out;
}

/** The URLs the kit carries, by name: the full video, the notebook, each source. */
function urls(kit) {
  const out = [];
  if (kit.links.full_video?.url) out.push(["Full video", kit.links.full_video.url]);
  if (kit.links.notebook?.colab) out.push(["Run the code", kit.links.notebook.colab]);
  for (const s of kit.links.sources ?? []) if (s.url) out.push([s.name, s.url]);
  return out;
}

const fit = (s, n) => (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)).replace(/\s+\S*$/, "") + "…");

export function shape(platform, kit, channel = {}, overrides = {}) {
  const lim = LIMITS[platform];
  if (!lim) throw new Error(`unknown platform "${platform}" (${PLATFORMS.join(", ")})`);
  const dest = destinationOf(channel, platform);
  const o = { ...(overrides ?? {}) };
  const warnings = [];
  const tags = hashtags(platform, kit, dest, warnings);
  const lead = o.lead ?? kit.thesis ?? kit.title;
  let title = o.title ?? kit.title;
  let text;
  let first_comment = null;
  const links = urls(kit);

  if (platform === "youtube") {
    // what deliver has always written to description.txt, with the YouTube-only #Shorts kept
    text = o.text ?? describe({ ...kit, hashtags: tags });
  } else if (platform === "x") {
    // one line, the link, at most two tags: a link always costs link_chars, whatever its length
    const link = links[0]?.[1] ?? null;
    const tagStr = tags.length ? ` ${tags.join(" ")}` : "";
    const room = lim.text_max - (link ? lim.link_chars + 1 : 0) - tagStr.length;
    const body = fit(lead, room);
    if (body !== lead) warnings.push(`the thesis is cut to fit ${lim.text_max} characters`);
    text = o.text ?? `${body}${link ? ` ${link}` : ""}${tagStr}`;
    title = null;
  } else {
    // the thesis first, inside what the feed shows; then the title when it says more; then the rest
    const parts = [lead];
    if (kit.title && lower(kit.title) !== lower(lead)) parts.push(kit.title);
    if (kit.shape === "long" && kit.chapters.length && platform !== "tiktok") {
      parts.push(["In this video:", ...kit.chapters.map((c) => `· ${c.title}`)].join("\n"));
    }
    if (kit.series?.name && kit.series.part) parts.push(`Part ${kit.series.part}${kit.series.of ? ` of ${kit.series.of}` : ""} of ${kit.series.name}.`);
    if (links.length) {
      if (lim.links_clickable) parts.push(links.map(([n, u]) => `${n}: ${u}`).join("\n"));
      else {
        const where = dest.link === "first_comment" && lim.first_comment ? "first comment" : "bio";
        parts.push(`${links.map(([n]) => n).join(", ")}: link in ${where}.`);
        if (where === "first comment") first_comment = links.map(([n, u]) => `${n}: ${u}`).join("\n");
        warnings.push(`links moved to the ${where}: ${platform} captions do not link`);
      }
    }
    if (!lim.links_clickable && kit.links.sources?.length && !links.some(([n]) => kit.links.sources.some((s) => s.name === n))) {
      parts.push(`Sources: ${kit.links.sources.map((s) => s.name).join(", ")}.`);
    }
    if (kit.music_credit) parts.push(kit.music_credit);
    if (tags.length) parts.push(tags.join(" "));
    text = o.text ?? parts.join("\n\n");
    if (lim.title_max == null) title = null;
  }

  if (title && lim.title_max && title.length > lim.title_max) {
    warnings.push(`title cut to ${lim.title_max} characters`);
    title = fit(title, lim.title_max);
  }
  if (text.length > lim.text_max) {
    warnings.push(`text cut to ${lim.text_max} characters`);
    text = fit(text, lim.text_max);
  }
  const coverOk = lim.cover && lim.cover.shapes.includes(kit.shape) && kit.files.thumbnail;
  return {
    platform,
    title,
    text,
    tags: platform === "youtube" ? (o.tags ?? dest.tags ?? []) : tags,
    first_comment,
    cover: coverOk ? kit.files.thumbnail : null,
    captions: lim.captions === "srt" ? kit.files.captions : null,
    file: kit.files.video,
    warnings,
  };
}
