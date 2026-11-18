// linkedin.mjs — the LinkedIn destination: a video post on a member's or an organisation's feed, through the
// Videos and Posts REST APIs (versioned; LINKEDIN_VERSION below). Needs a developer app with w_member_social (or
// w_organization_social) and an access token: ~/.config/chalk/linkedin.json { "access_token", "author" } where
// author is "urn:li:person:…" or "urn:li:organization:…" (or channel.json destinations.linkedin.author).
// LinkedIn has no draft post in its API, so a post is public at once: it needs --public-now.
//
// Built against LinkedIn's documented request shapes; checked offline (test/publish.mjs), not yet against the
// live API.

import { readFileSync } from "node:fs";
import { basePlan, dryRunText } from "./lib/social.mjs";
import { credentials, http, Usage } from "./lib/destination.mjs";

export const name = "linkedin";
export const LINKEDIN_VERSION = "202410";
const API = "https://api.linkedin.com/rest";

export function plan(out, argv = []) {
  const p = basePlan(name, out, argv);
  const author = p.dest.author ?? "<author from ~/.config/chalk/linkedin.json>";
  return {
    ...p,
    author,
    requests: [
      { method: "POST", url: `${API}/videos?action=initializeUpload`, body: { initializeUploadRequest: { owner: author, fileSizeBytes: p.bytes, uploadCaptions: !!p.captions, uploadThumbnail: !!p.cover } } },
      { method: "PUT", url: "<each uploadInstructions[].uploadUrl>", body: "<the file's bytes, in the ranges LinkedIn gives>" },
      ...(p.captions ? [{ method: "PUT", url: "<captionsUploadUrl>", body: "<captions.srt>" }] : []),
      ...(p.cover ? [{ method: "PUT", url: "<thumbnailUploadUrl>", body: "<thumbnail.png>" }] : []),
      { method: "POST", url: `${API}/videos?action=finalizeUpload`, body: { finalizeUploadRequest: { video: "<video urn>", uploadToken: "", uploadedPartIds: ["<etags>"] } } },
      { method: "POST", url: `${API}/posts`, body: { author, commentary: p.shaped.text, visibility: "PUBLIC",
        distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
        content: { media: { title: p.shaped.title ?? p.kit.title, id: "<video urn>" } }, lifecycleState: "PUBLISHED", isReshareDisabledByAuthor: false } },
    ],
  };
}

export const dryRun = (p, record) => dryRunText(p, record, `post a ${p.kit.shape} video to LinkedIn as ${p.author}, public at once`);

export async function publish(out, argv, record, save) {
  if (record.id) return console.log(`publish: linkedin: already posted (${record.id})`), 0;
  const p = plan(out, argv);
  const c = credentials(name, ["access_token"]);
  const author = p.dest.author ?? c.author;
  if (!author) throw new Usage("linkedin needs an author urn: destinations.linkedin.author in channel.json, or author in ~/.config/chalk/linkedin.json");
  const h = { Authorization: `Bearer ${c.access_token}`, "LinkedIn-Version": LINKEDIN_VERSION, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json" };
  const init = (await http(`${API}/videos?action=initializeUpload`, { method: "POST", headers: h,
    body: JSON.stringify({ initializeUploadRequest: { owner: author, fileSizeBytes: p.bytes, uploadCaptions: !!p.captions, uploadThumbnail: !!p.cover } }) }, "linkedin initializeUpload")).body.value;
  const bytes = readFileSync(p.file);
  const etags = [];
  for (const u of init.uploadInstructions) {
    const r = await fetch(u.uploadUrl, { method: "PUT", body: bytes.subarray(u.firstByte, u.lastByte + 1), headers: { "Content-Type": "application/octet-stream" } });
    if (!r.ok) throw new Error(`linkedin upload: HTTP ${r.status}`);
    etags.push(r.headers.get("etag"));
  }
  if (p.captions && init.captionsUploadUrl) await http(init.captionsUploadUrl, { method: "PUT", body: readFileSync(p.captions) }, "linkedin captions");
  if (p.cover && init.thumbnailUploadUrl) await http(init.thumbnailUploadUrl, { method: "PUT", body: readFileSync(p.cover), headers: { "Content-Type": "image/png" } }, "linkedin thumbnail");
  await http(`${API}/videos?action=finalizeUpload`, { method: "POST", headers: h,
    body: JSON.stringify({ finalizeUploadRequest: { video: init.video, uploadToken: init.uploadToken ?? "", uploadedPartIds: etags } }) }, "linkedin finalizeUpload");
  record.video = init.video;
  save();
  const post = await http(`${API}/posts`, { method: "POST", headers: h, body: JSON.stringify({ ...plan(out, argv).requests.at(-1).body, author,
    content: { media: { title: p.shaped.title ?? p.kit.title, id: init.video } } }) }, "linkedin post");
  record.id = post.headers.get("x-restli-id") ?? post.headers.get("x-linkedin-id") ?? "posted";
  Object.assign(record, { postedAt: new Date().toISOString() });
  save();
  console.log(`publish: linkedin: posted ${record.id}`);
  return 0;
}
