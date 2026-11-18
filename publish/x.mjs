// x.mjs — the X destination: a post with the video, through the v2 media upload and posts endpoints. Needs a paid
// API tier and a user access token with media.write and tweet.write: ~/.config/chalk/x.json { "access_token" }.
// 2:20 at most (P1 checks it), 280 characters (the shaping fits it). A post is public at once: --public-now.
//
// Built against X's documented request shapes; checked offline (test/publish.mjs), not yet against the live API.

import { readFileSync } from "node:fs";
import { basePlan, dryRunText } from "./lib/social.mjs";
import { credentials, http } from "./lib/destination.mjs";

export const name = "x";
const API = "https://api.x.com/2";
const CHUNK = 4 * 1024 * 1024;

export function plan(out, argv = []) {
  const p = basePlan(name, out, argv);
  return {
    ...p,
    requests: [
      { method: "POST", url: `${API}/media/upload/initialize`, body: { media_type: "video/mp4", total_bytes: p.bytes, media_category: "tweet_video" } },
      { method: "POST", url: `${API}/media/upload/<media id>/append`, body: `<${Math.ceil(p.bytes / CHUNK)} segment(s)>` },
      { method: "POST", url: `${API}/media/upload/<media id>/finalize`, body: {} },
      { method: "POST", url: `${API}/tweets`, body: { text: p.shaped.text, media: { media_ids: ["<media id>"] } } },
    ],
  };
}

export const dryRun = (p, record) => dryRunText(p, record, `post (public at once): "${p.shaped.text}"`);

export async function publish(out, argv, record, save) {
  if (record.id) return console.log(`publish: x: already posted (${record.id})`), 0;
  const p = plan(out, argv);
  const c = credentials(name, ["access_token"]);
  const auth = { Authorization: `Bearer ${c.access_token}` };
  const json = { ...auth, "Content-Type": "application/json" };
  record.media ??= (await http(`${API}/media/upload/initialize`, { method: "POST", headers: json, body: JSON.stringify(p.requests[0].body) }, "x init")).body.data.id;
  save();
  const bytes = readFileSync(p.file);
  for (let i = 0, k = 0; i < bytes.length; i += CHUNK, k++) {
    const form = new FormData();
    form.append("segment_index", String(k));
    form.append("media", new Blob([bytes.subarray(i, i + CHUNK)]));
    await http(`${API}/media/upload/${record.media}/append`, { method: "POST", headers: auth, body: form }, "x append");
  }
  await http(`${API}/media/upload/${record.media}/finalize`, { method: "POST", headers: auth }, "x finalize");
  record.id = (await http(`${API}/tweets`, { method: "POST", headers: json, body: JSON.stringify({ text: p.shaped.text, media: { media_ids: [record.media] } }) }, "x post")).body.data.id;
  Object.assign(record, { url: `https://x.com/i/status/${record.id}`, postedAt: new Date().toISOString() });
  save();
  console.log(`publish: x: posted ${record.url}`);
  return 0;
}
