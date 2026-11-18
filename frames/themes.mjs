// themes.mjs — which themes exist and which one a build uses.
//
//   chalk themes                       every theme: the person's own (~/.config/chalk/themes) first, then the repo's
//   chalk themes --show <name>         a theme's THEME.md: essence, colour, type, motion, pitfalls
//   chalk themes --for <out>           the theme a build uses, and why
//   chalk themes --poster <name>       render the theme's poster.png from a fixture frame (frames/poster.mjs)
//
// The theme is the channel's or the video's choice, never the repo's: the manifest's "theme" (video.json,
// short.json, lesson.json), else channel.json's "theme", else broadside, only because something has to be.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const HERE = dirname(new URL(import.meta.url).pathname);
export const FALLBACK = "broadside";

export const themeDirs = () =>
  [process.env.CHALK_THEMES || join(homedir(), ".config/chalk/themes"), join(HERE, "themes")].filter((d) => existsSync(d));

/** Every theme: { name, dir, own (the person's), json } — a person's theme shadows a repo theme of the same name. */
export function listThemes() {
  const seen = new Map();
  themeDirs().forEach((root, i) => {
    for (const n of readdirSync(root).sort()) {
      const f = join(root, n, "theme.json");
      if (!existsSync(f) || seen.has(n)) continue;
      seen.set(n, { name: n, dir: join(root, n), own: i === 0 && root !== join(HERE, "themes"), json: JSON.parse(readFileSync(f, "utf8")) });
    }
  });
  return [...seen.values()];
}

const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);

function channelOf(out) {
  if (process.env.CHALK_CHANNEL && existsSync(process.env.CHALK_CHANNEL)) return readJson(process.env.CHALK_CHANNEL);
  for (let d = resolve(out); d !== dirname(d); d = dirname(d)) if (existsSync(join(d, "channel.json"))) return readJson(join(d, "channel.json"));
  return null;
}

/** The theme a build uses → { name, from: "manifest" | "channel" | "fallback", dir, captions } */
export function themeFor(out) {
  const manifest = ["short.json", "video.json", "lesson.json"].map((m) => readJson(join(out, m))).find(Boolean) ?? {};
  const ch = channelOf(out);
  const [name, from] = manifest.theme ? [manifest.theme, "manifest"] : ch?.theme ? [ch.theme, "channel"] : [FALLBACK, "fallback"];
  const t = listThemes().find((x) => x.name === name);
  if (!t) throw new Error(`theme "${name}" (from the ${from}) is not one of: ${listThemes().map((x) => x.name).join(", ")}`);
  const captions = join(t.dir, t.json.captions ?? "captions.css");
  return { name, from, dir: t.dir, captions: existsSync(captions) ? captions : null, json: t.json };
}

export async function main(argv) {
  const val = (n) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : null);
  try {
    if (val("--show")) {
      const t = listThemes().find((x) => x.name === val("--show"));
      if (!t) throw new Error(`no theme "${val("--show")}"`);
      console.log(readFileSync(join(t.dir, "THEME.md"), "utf8"));
      return 0;
    }
    if (val("--for")) {
      const t = themeFor(val("--for"));
      console.log(`${t.name}\t(from the ${t.from})\t${t.dir}`);
      return 0;
    }
    if (val("--poster")) {
      const { poster } = await import(join(HERE, "poster.mjs"));
      return poster(val("--poster"), { orientation: argv.includes("--portrait") ? "portrait" : "landscape" });
    }
    for (const t of listThemes()) {
      console.log(`${t.name.padEnd(13)} ${(t.json.for ?? []).join(", ").padEnd(26)} ${t.own ? "yours" : "chalk"}  reveal: ${t.json.reveal ?? "rise"}${t.json.finish ? `, finish: ${t.json.finish}` : ""}`);
    }
    return 0;
  } catch (e) {
    console.error(`themes: ${e.message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) process.exit(await main(process.argv.slice(2)));
