// facebook.mjs — the Facebook destination: a Reel on a Page through the Graph API's video_reels edge. Needs a
// Page access token with pages_manage_posts: ~/.config/chalk/facebook.json { "access_token", "page_id" }, and,
// like Instagram, a host command for a public URL (channel.json destinations.facebook.host). It posts a DRAFT by
// default, SCHEDULED with --at, and PUBLISHED only with --public-now. Reels are 90 s at most; a long video goes
// through the kit folder for now.
//
// Built against Meta's documented request shapes; checked offline (test/publish.mjs), not yet against the live API.

import { basePlan, dryRunText, unixAt } from "./lib/social.mjs";
import { credentials, http } from "./lib/destination.mjs";
import { GRAPH, host } from "./instagram.mjs";

export const name = "facebook";

export function plan(out, argv = []) {
  const p = basePlan(name, out, argv, { canSchedule: true, privateByDefault: true });
  const state = p.publicNow ? "PUBLISHED" : p.at ? "SCHEDULED" : "DRAFT";
  return {
    ...p,
    state,
    requests: [
      { method: "RUN", url: p.dest.host ?? "<destinations.facebook.host>", body: "<short.mp4 → a public https URL>" },
      { method: "POST", url: `${GRAPH}/<page_id>/video_reels`, body: { upload_phase: "start" } },
      { method: "POST", url: "https://rupload.facebook.com/video-upload/v21.0/<video_id>", body: "header file_url: <the public URL>" },
      { method: "POST", url: `${GRAPH}/<page_id>/video_reels`, body: { upload_phase: "finish", video_id: "<video_id>", video_state: state,
        description: p.shaped.text, ...(p.at ? { scheduled_publish_time: unixAt(p.at) } : {}) } },
    ],
  };
}

export const dryRun = (p, record) => dryRunText(p, record, `post a Reel as ${p.state}${p.at ? ` for ${p.at}` : ""}`);

export async function publish(out, argv, record, save) {
  if (record.id) return console.log(`publish: facebook: already posted (${record.id})`), 0;
  const p = plan(out, argv);
  const c = credentials(name, ["access_token", "page_id"]);
  record.video_url ??= host(p.dest.host, p.file);
  save();
  const q = (o) => new URLSearchParams({ ...o, access_token: c.access_token });
  const start = (await http(`${GRAPH}/${c.page_id}/video_reels?${q({ upload_phase: "start" })}`, { method: "POST" }, "facebook start")).body;
  await http(start.upload_url ?? `https://rupload.facebook.com/video-upload/v21.0/${start.video_id}`,
    { method: "POST", headers: { Authorization: `OAuth ${c.access_token}`, file_url: record.video_url } }, "facebook upload");
  const finish = { upload_phase: "finish", video_id: start.video_id, video_state: p.state, description: p.shaped.text,
    ...(p.at ? { scheduled_publish_time: String(unixAt(p.at)) } : {}) };
  await http(`${GRAPH}/${c.page_id}/video_reels?${q(finish)}`, { method: "POST" }, "facebook finish");
  Object.assign(record, { id: start.video_id, state: p.state, postedAt: new Date().toISOString() });
  save();
  console.log(`publish: facebook: ${p.state.toLowerCase()} Reel ${record.id}`);
  return 0;
}
