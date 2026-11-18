// kit.mjs — the kit destination: a folder per platform, to post by hand. Three of the API destinations need app
// review, a business account or a paid tier; this makes "publish anywhere" true on day one.
//
//   chalk publish <out> --to kit [--platforms instagram,tiktok]
//
// Writes <out>/publish/<platform>/: the video (linked, not copied), the cover when the platform takes one,
// caption.txt as that platform's shaping wrote it, first-comment.txt when the links go there, and NOTES.md: what
// to set in the platform's own app (audience, schedule, playlist), the limits it was shaped for, and every warning.
// Which platforms: --platforms, else channel.json destinations.kit.platforms, else every platform but YouTube.

import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Usage, channelOf, manifestOf } from "./lib/destination.mjs";
import { shape, LIMITS, PLATFORMS } from "./lib/shape.mjs";
import { platformEval, readKit } from "./eval.mjs";

export const name = "kit";

const SET_IN_APP = {
  youtube: ["Audience: made for kids or not", "Visibility, or a schedule", "Playlist; end screen and cards", "Test & Compare for the title and thumbnail, if you use it"],
  instagram: ["Share to feed: on", "Cover: pick the frame or upload cover.png", "Put the links from caption.txt's last lines (or first-comment.txt) in your bio or as the first comment", "Audio: original audio (the music is already mixed)"],
  facebook: ["Post as a Reel from the Page", "Schedule in Meta Business Suite if it should not go out now"],
  tiktok: ["Who can watch", "Allow comments, duet and stitch as you prefer", "The AI-generated content label if the voice or visuals are synthetic", "Put the links in your bio"],
  linkedin: ["Post as yourself or as the Page", "Add the captions file in the video's settings if it does not pick up captions.srt"],
  x: ["The text in caption.txt is already within 280 characters", "Video: 2:20 at most"],
};

function platformsFor(out, argv) {
  const i = argv.indexOf("--platforms");
  if (i >= 0) return argv[i + 1].split(",").map((s) => s.trim());
  return channelOf(out).destinations?.kit?.platforms ?? PLATFORMS.filter((p) => p !== "youtube");
}

export function plan(out, argv = []) {
  out = resolve(out);
  const kit = readKit(out);
  if (!kit) throw new Usage(`kit.json is not in ${out}: deliver again (chalk deliver ${out})`);
  const channel = channelOf(out);
  const overrides = manifestOf(out).publish?.overrides ?? {};
  const platforms = platformsFor(out, argv);
  const bad = platforms.filter((p) => !LIMITS[p] || p.startsWith("_"));
  if (bad.length) throw new Usage(`unknown platform ${bad.join(", ")} (${PLATFORMS.join(", ")})`);
  return {
    out, kit, platforms,
    folders: platforms.map((p) => ({ platform: p, dir: join(out, "publish", p), shaped: shape(p, kit, channel, overrides[p]),
      checks: platformEval(out, kit, channel, [p], overrides) })),
  };
}

export const dryRun = (p) => `kit: would write ${p.folders.map((f) => `publish/${f.platform}/`).join(", ")}`;

export async function publish(out, argv, record, save) {
  const p = plan(out, argv);
  for (const f of p.folders) {
    rmSync(f.dir, { recursive: true, force: true });
    mkdirSync(f.dir, { recursive: true });
    const video = join(p.out, f.shaped.file);
    const dest = join(f.dir, f.shaped.file);
    try { linkSync(video, dest); } catch { copyFileSync(video, dest); }
    if (f.shaped.cover && existsSync(join(p.out, f.shaped.cover))) copyFileSync(join(p.out, f.shaped.cover), join(f.dir, "cover.png"));
    if (f.shaped.captions && existsSync(join(p.out, f.shaped.captions))) copyFileSync(join(p.out, f.shaped.captions), join(f.dir, "captions.srt"));
    writeFileSync(join(f.dir, "caption.txt"), (f.shaped.title ? `${f.shaped.title}\n\n` : "") + f.shaped.text + "\n");
    if (f.shaped.first_comment) writeFileSync(join(f.dir, "first-comment.txt"), f.shaped.first_comment + "\n");
    const lim = LIMITS[f.platform];
    const failing = f.checks.filter((c) => c.status === "fail");
    writeFileSync(join(f.dir, "NOTES.md"), [
      `# Posting to ${f.platform}`, "",
      `Shaped for ${f.platform} as checked on ${lim.checked}: text ${f.shaped.text.length}/${lim.text_max} characters, ` +
        `${lim.hashtag_max ?? "any"} hashtags at most, links ${lim.links_clickable ? "clickable" : "not clickable (bio or first comment)"}, ` +
        `${lim.duration_max_s[p.kit.shape]} s at most for a ${p.kit.shape}.`, "",
      "## Set in the app", "", ...(SET_IN_APP[f.platform] ?? []).map((s) => `- ${s}`), "",
      ...(f.shaped.warnings.length ? ["## What the shaping changed", "", ...f.shaped.warnings.map((w) => `- ${w}`), ""] : []),
      ...(failing.length ? ["## Fix before posting", "", ...failing.map((c) => `- ${c.id}: ${c.evidence.join("; ")}`), ""] : []),
    ].join("\n"));
    console.log(`publish: kit: publish/${f.platform}/${failing.length ? ` — ${failing.length} check(s) fail, see NOTES.md` : ""}`);
  }
  Object.assign(record, { platforms: p.platforms, writtenAt: new Date().toISOString() });
  save();
  return 0;
}
