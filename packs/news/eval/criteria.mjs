// criteria.mjs — the news pack: reporting, long or short. Every fact is said with who reports it, the sources are
// listed for the description, the piece carries its date, and it never sells harder than the reporting does.
// Whether the reporting is right is the source check's (G7); here, that the viewer can see where each fact is from.

import { pass, fail, skip } from "../../../evals/lib/kit.mjs";
import { linesOf, quotedSpans, manifest } from "../../lib.mjs";

export const ABOUT = "reporting: every fact attributed in the line, sources listed, a dated label, no hype";
export const SHAPES = ["long", "short"];
export const WAIVES = { E2: "news has no running example (the news pack)" };

/** Who says so: "Apple says", "according to Reuters", "MacRumors reports", "per the filing". */
const ATTRIBUTION = /\b(?:says?|said|reports?|reported|according to|announced|announces|told|wrote|writes|per(?!\s*cent)|confirmed|confirms|stated|states|estimates?|estimated|claims?|claimed|filed|filing|statement|data from|figures from)\b/i;
const MONTH = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i;
const ISO = /\b\d{4}-\d{2}-\d{2}\b/;
/** Words that sell harder than any report does. A manifest may set "breaking": true for real breaking news. */
export const HYPE = ["shocking", "insane", "unbelievable", "you won't believe", "mind-blowing", "mind blowing", "game-changer",
  "game changer", "destroys", "destroyed", "slams", "slammed", "jaw-dropping", "bombshell", "breaking"];

const news = [
  {
    id: "W1",
    group: "news",
    title: "The sources are listed in the manifest, each with a name and a link, for the description",
    weight: 2,
    run(ctx) {
      const src = manifest(ctx).sources;
      if (!Array.isArray(src) || !src.length) return fail(["the manifest has no sources: [{ \"name\": …, \"url\": \"https://…\" }]"]);
      const bad = src.filter((s) => !s?.name || !/^https?:\/\//.test(s?.url ?? "")).map((s) => `source ${JSON.stringify(s)} needs a name and an http(s) url`);
      return bad.length ? fail(bad) : pass(src.map((s) => s.name));
    },
  },
  {
    id: "W2",
    group: "news",
    title: "It carries its date: the manifest's label (or date) names a day, so a viewer knows how old the news is",
    weight: 1,
    run(ctx) {
      const m = manifest(ctx);
      const d = [m.label, m.date].filter(Boolean).join(" ");
      return MONTH.test(d) || ISO.test(d) ? pass([d]) : fail([`no date in the label or date: "${d || "none"}"; e.g. "TECH NEWS · NOV 18, 2026"`]);
    },
  },
  {
    id: "W3",
    group: "news",
    title: "Every fact is said with who reports it: a line with a number or a quotation names its source in that line or the one before",
    weight: 3,
    run(ctx) {
      const lines = linesOf(ctx);
      if (!lines.length) return skip("no scripts");
      const bad = [];
      lines.forEach((l, i) => {
        if (l.entry.source?.includes("pipeline")) return; // a line about the video itself
        const fact = /\d/.test(l.display) || quotedSpans(l.display).length;
        if (!fact) return;
        const prev = i > 0 && lines[i - 1].sc === l.sc ? lines[i - 1].display : "";
        if (!ATTRIBUTION.test(l.display) && !ATTRIBUTION.test(prev)) bad.push(`${l.at}: "${l.display.slice(0, 90)}" says who reports it nowhere near`);
      });
      return bad.length ? fail(bad) : pass();
    },
  },
  {
    id: "W4",
    group: "news",
    title: "No hype: nothing sells harder than the reporting (shocking, insane, slams, bombshell…)",
    weight: 2,
    run(ctx) {
      const lines = linesOf(ctx);
      if (!lines.length) return skip("no scripts");
      const words = manifest(ctx).breaking ? HYPE.filter((w) => w !== "breaking") : HYPE;
      const re = new RegExp(`\\b(${words.map((w) => w.replace(/[-]/g, "[- ]")).join("|")})\\b`, "i");
      const bad = [];
      for (const l of lines) for (const t of [l.display, l.spoken]) if (re.test(t)) bad.push(`${l.at}: "${t.match(re)[0]}"`);
      const title = manifest(ctx).title ?? "";
      if (re.test(title)) bad.push(`title: "${title.match(re)[0]}"`);
      return bad.length ? fail([...new Set(bad)]) : pass();
    },
  },
  {
    id: "W5",
    group: "news",
    title: "It ends by pointing to the sources",
    weight: 1,
    run(ctx) {
      const last = linesOf(ctx).at(-1);
      if (!last) return skip("no scripts");
      return /\bsources?\b/i.test(last.display) ? pass([`"${last.display}"`]) : fail([`${last.at}: the last line does not point to the sources: "${last.display.slice(0, 90)}"`]);
    },
  },
];

export const CRITERIA = news;
export const GROUPS = ["news"];
