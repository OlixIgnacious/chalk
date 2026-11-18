// social.mjs — what the API destinations share: the plan every one starts from, and the privacy rule.
//
// chalk never makes a video public by accident. YouTube uploads Private or scheduled; Facebook posts a draft or a
// scheduled Reel; TikTok posts SELF_ONLY. Instagram, LinkedIn and X have no private or draft state in their APIs,
// so they refuse unless the person says --public-now. A platform that cannot schedule refuses --at.

import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Usage, channelOf, manifestOf } from "./destination.mjs";
import { shape, destinationOf, LIMITS } from "./shape.mjs";
import { platformEval, readKit } from "../eval.mjs";

const flag = (argv, n) => (argv.indexOf(n) >= 0 ? argv[argv.indexOf(n) + 1] : null);

/**
 * Everything a platform would be sent, from kit.json: the shaped text, the file, the cover, the destination's
 * settings, when, and the P criteria for this platform. Refuses (Usage) when a P criterion fails, a file is
 * missing, or the privacy rule is not met.
 */
export function basePlan(platform, out, argv = [], { canSchedule = false, privateByDefault = false } = {}) {
  out = resolve(out);
  const kit = readKit(out);
  if (!kit) throw new Usage(`kit.json is not in ${out}: deliver again (chalk deliver ${out}) — it is what every destination reads`);
  const channel = channelOf(out);
  const manifest = manifestOf(out);
  const overrides = manifest.publish?.overrides ?? {};
  const s = shape(platform, kit, channel, overrides[platform]);
  const file = join(out, s.file);
  if (!existsSync(file)) throw new Usage(`${s.file} is not in ${out}: deliver it first`);
  const failing = platformEval(out, kit, channel, [platform], overrides).filter((r) => r.status === "fail");
  if (failing.length) throw new Usage(`${platform} would not take this as it is:\n  ${failing.map((r) => `${r.id}: ${r.evidence.join("; ")}`).join("\n  ")}`);
  const at = flag(argv, "--at");
  if (at && !canSchedule) throw new Usage(`${platform} cannot schedule through its API: post at that time with --public-now, or use the kit folder (--to kit)`);
  const publicNow = argv.includes("--public-now");
  if (!privateByDefault && !publicNow && !argv.includes("--dry-run")) {
    throw new Usage(`${platform} has no private or draft post in its API: anything sent is public at once. Say --public-now to go ahead, or use --to kit to post it yourself`);
  }
  return {
    platform, out, kit, shaped: s, dest: destinationOf(channel, platform), limits: LIMITS[platform],
    file, bytes: statSync(file).size, cover: s.cover ? join(out, s.cover) : null, captions: s.captions && existsSync(join(out, s.captions)) ? join(out, s.captions) : null,
    at, publicNow, warnings: s.warnings,
  };
}

/** A local time "YYYY-MM-DD HH:MM" → Unix seconds; refuses the past. */
export function unixAt(at, now = new Date()) {
  const m = String(at).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) throw new Usage(`--at "${at}": give the local time as "YYYY-MM-DD HH:MM"`);
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!(t > now)) throw new Usage(`--at "${at}" is not in the future`);
  return Math.floor(t.getTime() / 1000);
}

/** The summary --dry-run prints for an API destination. */
export const dryRunText = (p, record, what) =>
  `${p.platform}: would ${what}${record?.id ? ` — already posted as ${record.id}` : ""}${p.warnings.length ? `\n    ${p.warnings.join("\n    ")}` : ""}`;
