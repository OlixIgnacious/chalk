// tiktok.mjs — the TikTok destination: Content Posting API, direct post with a file upload. Needs a developer app
// with video.publish and a user access token: ~/.config/chalk/tiktok.json { "access_token" }. Posts SELF_ONLY
// (only you see it) unless channel.json destinations.tiktok.privacy says otherwise or --public-now is given;
// unaudited apps can only post SELF_ONLY anyway. Captions are burned in.
//
// Built against TikTok's documented request shapes; checked offline (test/publish.mjs), not yet against the live API.

import { readFileSync } from "node:fs";
import { basePlan, dryRunText } from "./lib/social.mjs";
import { credentials, http } from "./lib/destination.mjs";

export const name = "tiktok";
const API = "https://open.tiktokapis.com/v2";
const CHUNK = 10 * 1024 * 1024;

export function plan(out, argv = []) {
  const p = basePlan(name, out, argv, { privateByDefault: true });
  const privacy = p.publicNow ? "PUBLIC_TO_EVERYONE" : p.dest.privacy ?? "SELF_ONLY";
  const chunks = Math.max(1, Math.floor(p.bytes / CHUNK));
  const chunk = chunks === 1 ? p.bytes : CHUNK;
  return {
    ...p,
    privacy,
    requests: [
      { method: "POST", url: `${API}/post/publish/video/init/`, body: { post_info: { title: p.shaped.text, privacy_level: privacy, disable_comment: false,
        disable_duet: false, disable_stitch: false }, source_info: { source: "FILE_UPLOAD", video_size: p.bytes, chunk_size: chunk, total_chunk_count: chunks } } },
      { method: "PUT", url: "<upload_url>", body: `<${chunks} chunk(s), Content-Range bytes>` },
      { method: "POST", url: `${API}/post/publish/status/fetch/`, body: { publish_id: "<publish_id>" } },
    ],
  };
}

export const dryRun = (p, record) => dryRunText(p, record, `post as ${p.privacy}`);

export async function publish(out, argv, record, save) {
  if (record.id) return console.log(`publish: tiktok: already posted (${record.id})`), 0;
  const p = plan(out, argv);
  const c = credentials(name, ["access_token"]);
  const h = { Authorization: `Bearer ${c.access_token}`, "Content-Type": "application/json; charset=UTF-8" };
  const init = (await http(`${API}/post/publish/video/init/`, { method: "POST", headers: h, body: JSON.stringify(p.requests[0].body) }, "tiktok init")).body.data;
  const bytes = readFileSync(p.file);
  const { chunk_size: size, total_chunk_count: n } = p.requests[0].body.source_info;
  for (let i = 0; i < n; i++) {
    const a = i * size, b = i === n - 1 ? bytes.length : a + size;
    const r = await fetch(init.upload_url, { method: "PUT", body: bytes.subarray(a, b),
      headers: { "Content-Type": "video/mp4", "Content-Range": `bytes ${a}-${b - 1}/${bytes.length}` } });
    if (!r.ok) throw new Error(`tiktok upload chunk ${i + 1}/${n}: HTTP ${r.status}`);
  }
  Object.assign(record, { id: init.publish_id, privacy: p.privacy, postedAt: new Date().toISOString() });
  save();
  console.log(`publish: tiktok: sent as ${p.privacy} (publish id ${record.id}); TikTok processes it before it appears`);
  return 0;
}
