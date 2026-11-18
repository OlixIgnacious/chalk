// destination.mjs — what every destination shares: which platforms a build goes to, the per-platform record of
// what was sent, and the contract each publish/<platform>.mjs keeps:
//
//   name                              "youtube", "instagram", …
//   plan(out, argv) → object          everything that would be sent, sent nowhere (what --dry-run prints)
//   publish(out, argv, record, save)  send it; record what happened in `record` and call save() after each step
//
// published.json holds one entry per platform: { "youtube": { videoId, url, steps }, "linkedin": { … } }, so
// "uploads once" is per platform and a second destination never skips the first. The shape before destinations
// existed ({ videoId, url, steps } at the top) is read as the youtube entry.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { PLATFORMS } from "./shape.mjs";

export class Usage extends Error {}

export const CONFIG = process.env.CHALK_CONFIG ?? join(homedir(), ".config/chalk");
const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));

/** The channel config beside the output dirs: the first channel.json found walking up from `out`. */
export function channelOf(out) {
  for (let d = resolve(out); d !== dirname(d); d = dirname(d)) {
    if (existsSync(join(d, "channel.json"))) return readJson(join(d, "channel.json"));
  }
  return {};
}

export const manifestOf = (out) => {
  const f = ["short.json", "video.json", "lesson.json"].map((n) => join(out, n)).find(existsSync);
  return f ? readJson(f) : {};
};

/**
 * Where a build goes: --to, else the manifest's publish.to, else the destinations channel.json lists for this
 * shape (a destination may say "shapes": ["short"]), plus "kit" when destinations.kit names platforms; else
 * youtube, which is where chalk published before destinations existed.
 */
export function targets(out, argv = []) {
  const i = argv.indexOf("--to");
  const fromArg = i >= 0 ? argv[i + 1]?.split(",").map((s) => s.trim()).filter(Boolean) : null;
  const manifest = manifestOf(out);
  const shape = existsSync(join(out, "short.json")) ? "short" : "long";
  let list = fromArg ?? manifest.publish?.to ?? null;
  if (!list) {
    const dests = channelOf(out).destinations ?? {};
    list = Object.entries(dests).filter(([k, v]) => k !== "kit" && (!v?.shapes || v.shapes.includes(shape))).map(([k]) => k);
    if (dests.kit?.platforms?.length) list.push("kit");
    if (!list.length) list = ["youtube"];
  }
  const bad = list.filter((p) => p !== "kit" && !PLATFORMS.includes(p));
  if (bad.length) throw new Usage(`unknown destination ${bad.join(", ")} (${[...PLATFORMS, "kit"].join(", ")})`);
  return list;
}

/** published.json as one entry per platform; the old single-platform shape is the youtube entry. */
export function readRecord(out) {
  const f = join(out, "published.json");
  if (!existsSync(f)) return {};
  const r = readJson(f);
  if (r.videoId && !r.youtube) {
    const { videoId, url, uploadedAt, title, privacy, publishAt, steps } = r;
    return { youtube: { videoId, url, uploadedAt, title, privacy, publishAt, steps: steps ?? {} } };
  }
  return r;
}

export function writeRecord(out, record) {
  writeFileSync(join(out, "published.json"), JSON.stringify(record, null, 2) + "\n");
}

/** A platform's stored credentials (~/.config/chalk/<platform>.json), or a Usage error saying how to add them. */
export function credentials(platform, needs) {
  const f = join(CONFIG, `${platform}.json`);
  if (!existsSync(f)) throw new Usage(`no ${platform} credentials: run \`chalk publish auth --to ${platform}\` for what to put in ${f}`);
  const c = readJson(f);
  const missing = needs.filter((k) => !c[k]);
  if (missing.length) throw new Usage(`${f} is missing ${missing.join(", ")}`);
  return c;
}

/** One HTTP call that throws with the platform's own error text. */
export async function http(url, init = {}, what = url) {
  const r = await fetch(url, init);
  const text = await r.text();
  if (!r.ok) throw new Error(`${what}: HTTP ${r.status} ${text.slice(0, 300)}`);
  try {
    return { body: text ? JSON.parse(text) : {}, headers: r.headers };
  } catch {
    return { body: text, headers: r.headers };
  }
}
