// index.mjs — chalk publish: one delivered build to every destination it names.
//
//   chalk publish auth [--to youtube|instagram|facebook|tiktok|linkedin|x]   sign in, or say what credentials to add
//   chalk publish <out> [--to youtube,instagram,kit] [--plan] [--dry-run] [--at "YYYY-MM-DD HH:MM"] [--public-now]
//
// --to, else the manifest's publish.to, else channel.json's destinations, else youtube. --plan runs the
// destination pack (P1–P6, publish/eval.mjs) for each platform and sends nothing; --dry-run prints what each
// destination would send. Each platform keeps its own entry in published.json, so one never skips another, and
// a rerun only retries what failed. Nothing goes public at once unless the person says --public-now.

import { join, resolve } from "node:path";
import { Usage, targets, readRecord, writeRecord, channelOf, manifestOf, CONFIG } from "./lib/destination.mjs";
import { PLATFORMS } from "./lib/shape.mjs";
import { platformEval, readKit } from "./eval.mjs";
import * as youtube from "./youtube.mjs";
import * as instagram from "./instagram.mjs";
import * as facebook from "./facebook.mjs";
import * as tiktok from "./tiktok.mjs";
import * as linkedin from "./linkedin.mjs";
import * as x from "./x.mjs";
import * as kit from "./kit.mjs";

export const DESTINATIONS = { youtube, instagram, facebook, tiktok, linkedin, x, kit };

const NEEDS = {
  instagram: '{ "access_token": "…", "ig_user_id": "…" } — a Professional account linked to a Meta app with instagram_content_publish; plus channel.json destinations.instagram.host',
  facebook: '{ "access_token": "<a Page token>", "page_id": "…" } — pages_manage_posts; plus channel.json destinations.facebook.host',
  tiktok: '{ "access_token": "…" } — a developer app with video.publish (unaudited apps post SELF_ONLY)',
  linkedin: '{ "access_token": "…", "author": "urn:li:person:…" } — a developer app with w_member_social',
  x: '{ "access_token": "…" } — a paid API tier, a user token with media.write and tweet.write',
};

async function main_(argv) {
  if (argv[0] === "auth") {
    const i = argv.indexOf("--to");
    const p = i >= 0 ? argv[i + 1] : "youtube";
    if (p === "youtube") return youtube.auth(argv.slice(1)).then(() => 0);
    if (!NEEDS[p]) throw new Usage(`no sign-in for "${p}" (${Object.keys(NEEDS).concat("youtube").join(", ")})`);
    console.log(`publish: ${p} signs in with a token you create in its developer portal. Put this in ${join(CONFIG, `${p}.json`)}:\n  ${NEEDS[p]}`);
    return 0;
  }
  const out = argv.find((a, i) => !a.startsWith("-") && !["--to", "--at", "--platforms", "--made-for-kids", "--ai"].includes(argv[i - 1]));
  if (!out) throw new Usage('usage: chalk publish <out> [--to youtube,instagram,kit] [--plan] [--dry-run] [--at "YYYY-MM-DD HH:MM"] [--public-now]');
  const dir = resolve(out);
  const list = targets(dir, argv);

  if (argv.includes("--plan")) {
    const k = readKit(dir);
    if (!k) throw new Usage(`kit.json is not in ${dir}: deliver again`);
    const results = platformEval(dir, k, channelOf(dir), list.filter((p) => p !== "kit"), manifestOf(dir).publish?.overrides ?? {});
    for (const r of results) console.log(`${r.status === "pass" ? "ok  " : r.status === "skip" ? "skip" : "FAIL"}  ${r.id.padEnd(14)} ${r.evidence.join("; ").slice(0, 140)}`);
    return results.some((r) => r.status === "fail") ? 1 : 0;
  }

  const record = readRecord(dir);
  if (argv.includes("--dry-run")) {
    for (const p of list) {
      const d = DESTINATIONS[p];
      const pl = d.plan(dir, argv);
      if (p === "youtube") console.log(JSON.stringify({ ...pl, description: `${pl.snippet.description.length} characters` }, null, 2));
      console.log(`publish: dry run — ${d.dryRun(pl, record[p])}`);
    }
    return 0;
  }
  let failed = 0;
  for (const p of list) {
    record[p] ??= {};
    const save = () => writeRecord(dir, record);
    try {
      failed += (await DESTINATIONS[p].publish(dir, argv, record[p], save)) ? 1 : 0;
    } catch (e) {
      if (e instanceof Usage && list.length === 1) throw e;
      failed++;
      console.error(`publish: ${p}: ${e.message}`);
    }
  }
  return failed ? 1 : 0;
}

export async function main(argv) {
  try {
    return await main_(argv);
  } catch (e) {
    console.error(`publish: ${e.message}`);
    return e instanceof Usage ? 2 : 1;
  }
}

export { PLATFORMS };
