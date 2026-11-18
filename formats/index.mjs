// index.mjs — the shapes a build can take and the genre pack it is judged by, decided in one place.
//
// A shape (long, short, lesson) owns the stage list, the deliver and the orientation. A pack (packs/<name>/)
// owns a genre's rules: its criteria and the skill's outline and script references. The channel or the
// manifest names the pack; the shape never does. "youtube" is the long shape's old name, read for as long as
// a build or a command still says it.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const SHAPES = ["long", "lesson", "short"];
export const ALIASES = { youtube: "long" };

/** The shape a name means, or null: "youtube" is "long". */
export const shapeOf = (name) => {
  const s = ALIASES[name] ?? name;
  return SHAPES.includes(s) ? s : null;
};

/** The shape of an output dir from its manifest: short.json is a Short, lesson.json a lesson, anything else long. */
export const detectShape = (out) =>
  out && existsSync(join(out, "short.json")) ? "short" : out && existsSync(join(out, "lesson.json")) ? "lesson" : "long";

/** The pack a shape is judged by when nothing names one: what each shape was judged by before packs existed. */
export const DEFAULT_PACK = { long: "coding-lesson", lesson: null, short: null };

const readJson = (p) => {
  try {
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  } catch {
    return null;
  }
};

/**
 * The pack for a build: an explicit name, then the manifest's "pack", then channel.json's ("pack": "essay", or
 * per shape: { "long": "coding-lesson", "short": "news" }), then the shape's default. null means shared and
 * shape criteria only.
 */
export function packOf(shape, { pack, manifest, channel } = {}) {
  const fromChannel = typeof channel?.pack === "string" ? channel.pack : channel?.pack?.[shape];
  const named = pack ?? manifest?.pack ?? fromChannel;
  return named === undefined ? DEFAULT_PACK[shape] ?? null : named || null;
}

/** The manifest of an output dir (video.json, short.json or lesson.json), or null. */
export const manifestOf = (out) =>
  readJson(join(out, "short.json")) ?? readJson(join(out, "lesson.json")) ?? readJson(join(out, "video.json"));

/**
 * Where fonts and GSAP are staged once per machine: $CHALK_ASSETS, else ~/.cache/chalk/assets, else the old
 * ~/.cache/chalk-youtube/assets when only that one has been staged.
 */
export function assetsDir(home = process.env.HOME ?? "") {
  if (process.env.CHALK_ASSETS) return process.env.CHALK_ASSETS;
  const now = join(home, ".cache/chalk/assets");
  const old = join(home, ".cache/chalk-youtube/assets");
  return !existsSync(now) && existsSync(old) ? old : now;
}
