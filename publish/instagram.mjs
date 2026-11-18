// instagram.mjs — the Instagram destination: a Reel through the Instagram Graph API (content publishing).
// Needs a Professional account linked to a Meta app with instagram_content_publish, and ~/.config/chalk/
// instagram.json { "access_token", "ig_user_id" }. The API fetches the mp4 from a public URL, so channel.json
// destinations.instagram.host names a command that uploads a file and prints its URL ("rclone copyto {file} r2:v/{name}
// && echo https://…/{name}", "aws s3 cp …"): {file} and {name} are filled in. No host, no publish: use --to kit.
// A Reel is public once published: it needs --public-now. Captions are burned in (Shorts already are).
//
// Built against Meta's documented request shapes; checked offline (test/publish.mjs), not yet against the live API.

import { spawnSync } from "node:child_process";
import { basename } from "node:path";
import { basePlan, dryRunText } from "./lib/social.mjs";
import { credentials, http, Usage } from "./lib/destination.mjs";

export const name = "instagram";
export const GRAPH = "https://graph.facebook.com/v21.0";

/** Run the channel's host command for a file and return the public URL it prints. */
export function host(cmd, file) {
  if (!cmd) throw new Usage(`${name} fetches the video from a public URL: set channel.json destinations.${name}.host to a command that uploads {file} and prints its URL, or use --to kit`);
  const line = cmd.replaceAll("{file}", JSON.stringify(file)).replaceAll("{name}", basename(file));
  const r = spawnSync("bash", ["-c", line], { encoding: "utf8" });
  const url = r.stdout.trim().split("\n").at(-1);
  if (r.status !== 0 || !/^https:\/\//.test(url)) throw new Error(`host command failed or printed no https URL: ${r.stderr.slice(-200)}`);
  return url;
}

export function plan(out, argv = []) {
  const p = basePlan(name, out, argv);
  if (!p.dest.host && !argv.includes("--dry-run")) host(null);
  return {
    ...p,
    requests: [
      { method: "RUN", url: p.dest.host ?? "<destinations.instagram.host>", body: "<video.mp4 → a public https URL>" },
      { method: "POST", url: `${GRAPH}/<ig_user_id>/media`, body: { media_type: "REELS", video_url: "<the public URL>", caption: p.shaped.text, share_to_feed: true } },
      { method: "GET", url: `${GRAPH}/<container id>?fields=status_code`, body: "until FINISHED" },
      { method: "POST", url: `${GRAPH}/<ig_user_id>/media_publish`, body: { creation_id: "<container id>" } },
      ...(p.shaped.first_comment ? [{ method: "POST", url: `${GRAPH}/<media id>/comments`, body: { message: p.shaped.first_comment } }] : []),
    ],
  };
}

export const dryRun = (p, record) => dryRunText(p, record, `publish a Reel (public at once)${p.shaped.first_comment ? " with the links as the first comment" : ""}`);

export async function publish(out, argv, record, save) {
  if (record.id) return console.log(`publish: instagram: already published (${record.id})`), 0;
  const p = plan(out, argv);
  const c = credentials(name, ["access_token", "ig_user_id"]);
  record.video_url ??= host(p.dest.host, p.file);
  save();
  const q = (o) => new URLSearchParams({ ...o, access_token: c.access_token });
  record.container ??= (await http(`${GRAPH}/${c.ig_user_id}/media?${q({ media_type: "REELS", video_url: record.video_url, caption: p.shaped.text, share_to_feed: "true" })}`,
    { method: "POST" }, "instagram media")).body.id;
  save();
  for (let i = 0; ; i++) {
    const st = (await http(`${GRAPH}/${record.container}?${q({ fields: "status_code" })}`, {}, "instagram status")).body.status_code;
    if (st === "FINISHED") break;
    if (st === "ERROR" || i > 60) throw new Error(`instagram: the container did not finish (${st})`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  record.id = (await http(`${GRAPH}/${c.ig_user_id}/media_publish?${q({ creation_id: record.container })}`, { method: "POST" }, "instagram publish")).body.id;
  save();
  if (p.shaped.first_comment) {
    await http(`${GRAPH}/${record.id}/comments?${q({ message: p.shaped.first_comment })}`, { method: "POST" }, "instagram first comment");
    record.first_comment = "ok";
    save();
  }
  console.log(`publish: instagram: published ${record.id}`);
  return 0;
}
