// kit.mjs — the neutral kit: everything a destination needs to publish one delivered video, said once, in no
// platform's words. Deliver writes it as kit.json; each destination (publish/<platform>.mjs) shapes it into its
// own title, text, tags and cover (shape()), so a platform's rules never reach deliver, a shape or a pack.
//
// The YouTube description deliver has always written (description.txt) is the first shaping of it, and stays
// byte for byte what it was: describe() below.

import { buildDescription, chaptersText } from "../../formats/long/skills/chalk-long/scripts/kit.mjs";

export const KIT_VERSION = 1;

/** Fields every kit has, with their types: the schema test/publish.mjs checks both delivers against. */
export const SCHEMA = {
  version: "number", shape: "string", title: "string", thesis: "string|null", hashtags: "array", chapters: "array",
  series: "object|null", music_credit: "string|null", notebook: "boolean", label: "string|null", pack: "string|null",
  duration: "number", width: "number", height: "number", links: "object", files: "object",
};

/** The kit of a long video, from what its deliver already has. */
export function longKit({ manifest, chapters, notebook, links, duration, width = 1920, height = 1080, pack = null }) {
  return {
    version: KIT_VERSION,
    shape: "long",
    title: manifest.title,
    thesis: manifest.thesis ?? null,
    hashtags: manifest.hashtags ?? [],
    chapters: chapters.map((c) => ({ at: c.at, title: c.title })),
    series: manifest.series ?? null,
    music_credit: manifest.music_credit ?? null,
    notebook: !!notebook,
    label: manifest.label ?? null,
    pack,
    duration: Math.round(duration * 1000) / 1000,
    width,
    height,
    links: { full_video: null, notebook: links ?? null, sources: manifest.sources ?? [] },
    files: { video: "video.mp4", captions: "captions.srt", thumbnail: "thumbnail.png", chapters: "chapters.txt" },
  };
}

/** The kit of a Short. */
export function shortKit({ short, links, duration, width, height, pack = null }) {
  return {
    version: KIT_VERSION,
    shape: "short",
    title: short.title,
    thesis: short.thesis ?? null,
    hashtags: short.hashtags ?? [],
    chapters: [],
    series: null,
    music_credit: short.music_credit ?? null,
    notebook: !!links,
    label: short.label ?? null,
    pack,
    duration: Math.round(duration * 1000) / 1000,
    width,
    height,
    links: { full_video: short.full_video?.title ? short.full_video : null, notebook: links ?? null, sources: short.sources ?? [] },
    files: { video: "short.mp4", captions: "captions.srt", thumbnail: null },
  };
}

/**
 * The references a video rests on: every block its scripts cite that carries a ref (a script's or a research
 * brief's [ref: …]). → [{ block, url?, title?, retrieved?, quote? }]
 */
export function citedRefs(chapter, scriptTexts) {
  const cited = new Set(scriptTexts.flatMap((t) => [...t.matchAll(/^\s*source:\s*\[([^\]]*)\]/gm)].flatMap((m) => m[1].split(",").map((x) => x.trim()))));
  return (chapter?.blocks ?? []).filter((b) => b.ref && cited.has(b.id)).flatMap((b) => b.ref.map((r) => ({ block: b.id, ...r })));
}

/** The references as the description's sources: one per page, named by its title or its site. */
export function refSources(refs) {
  const seen = new Map();
  for (const r of refs) {
    if (!r.url || seen.has(r.url)) continue;
    let name = r.title;
    if (!name) try { name = new URL(r.url).hostname.replace(/^www\./, ""); } catch { name = r.url; }
    seen.set(r.url, { name, url: r.url });
  }
  return [...seen.values()];
}

/** plan.md's references: what each cited block rests on, for the audit trail. */
export function refsSection(refs) {
  if (!refs.length) return [];
  const esc = (s) => String(s ?? "").replace(/\|/g, "\\|");
  return ["## References", "", "| Block | Reference | Retrieved | The sentence it rests on |", "|---|---|---|---|",
    ...refs.map((r) => `| \`${r.block}\` | ${esc(r.url ?? r.title)} | ${r.retrieved ?? "—"} | ${r.quote ? `"${esc(r.quote)}"` : "—"} |`), ""];
}

/** The YouTube description, exactly as deliver has always written description.txt. */
export function describe(kit) {
  if (kit.shape === "long") {
    const text = buildDescription({ title: kit.title, thesis: kit.thesis ?? undefined, chapters: kit.chapters, notebook: kit.notebook,
      links: kit.links.notebook, series: kit.series ?? undefined });
    // a video grounded in references says where they are (a long video with none reads as it always has)
    const src = kit.links.sources ?? [];
    return src.length ? `${text}Sources:\n${src.map((x) => `${x.name}: ${x.url}`).join("\n")}\n` : text;
  }
  const lines = [kit.title, ""];
  if (kit.thesis) lines.push(kit.thesis, "");
  const fv = kit.links.full_video;
  if (fv?.title) lines.push(`Full walkthrough: ${fv.title}`, ...(fv.url ? [fv.url] : []), "");
  if (kit.links.notebook) lines.push("Run the code in your browser:", kit.links.notebook.colab, "");
  if (kit.links.sources?.length) lines.push("Sources:", ...kit.links.sources.map((s) => `${s.name}: ${s.url}`), "");
  if (kit.music_credit) lines.push(kit.music_credit, "");
  if (kit.hashtags?.length) lines.push(kit.hashtags.join(" "), "");
  return lines.join("\n");
}

/** The kit's problems against SCHEMA: [] when it is well formed. */
export function validate(kit) {
  const bad = [];
  const is = (v, t) => t.split("|").some((x) => (x === "null" ? v === null : x === "array" ? Array.isArray(v) : typeof v === x && !Array.isArray(v)));
  for (const [k, t] of Object.entries(SCHEMA)) if (!(k in (kit ?? {})) || !is(kit[k], t)) bad.push(`${k}: expected ${t}, got ${JSON.stringify(kit?.[k])?.slice(0, 40)}`);
  if (kit && !["long", "short"].includes(kit.shape)) bad.push(`shape: "${kit.shape}" is not long or short`);
  for (const c of kit?.chapters ?? []) if (typeof c.at !== "number" || typeof c.title !== "string") bad.push(`chapter ${JSON.stringify(c)}`);
  return bad;
}

export { chaptersText };
