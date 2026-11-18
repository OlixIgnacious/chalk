// publish/youtube.mjs — the YouTube destination: upload a finished output dir through the Data API v3.
//
//   chalk publish auth [--client <client_secret.json>]   one-time sign-in; stores a refresh token
//   chalk publish <out> --to youtube [--at "YYYY-MM-DD HH:MM"] [--dry-run] [--made-for-kids yes|no] [--ai yes|no]
//
// It keeps the destination contract (publish/lib/destination.mjs): plan(), dryRun(), publish(). Its settings are
// channel.json destinations.youtube (the old top-level "youtube" block is still read).
//
// A video dir (video.json) uploads video.mp4; a Short dir (short.json) uploads short.mp4. Both send the title, the
// delivered description.txt, tags, category and language, then set thumbnail.png, upload captions.srt and add the
// video to the channel's playlist. Without --at it stays Private; with --at it is scheduled (private until then).
// The declarations (made for kids, altered or synthetic content) are the channel owner's: they are sent only when
// given on the command line. Progress goes to <out>/published.json, so a rerun never uploads twice and only retries
// the steps that failed. Test & Compare (thumbnail and title A/B) has no API: set it up in Studio.

import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { Usage, channelOf } from "./lib/destination.mjs";
import { destinationOf } from "./lib/shape.mjs";

export const name = "youtube";
const CONFIG = process.env.CHALK_CONFIG ?? join(homedir(), ".config/chalk");
const CLIENT = join(CONFIG, "youtube-client.json");
const TOKEN = join(CONFIG, "youtube-token.json");
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"];
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";

const readJson = (f) => JSON.parse(readFileSync(f, "utf8"));
const flag = (argv, name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1];
};

/** "2026-11-06 10:30" in this machine's time zone → an ISO time YouTube accepts; refuses the past. */
export function publishTime(at, now = new Date()) {
  const m = String(at).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) throw new Usage(`--at "${at}": give the local time as "YYYY-MM-DD HH:MM"`);
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!(t > now)) throw new Usage(`--at "${at}" is not in the future`);
  return t.toISOString();
}

const yesNo = (v, name) => {
  if (v === null) return undefined;
  if (v !== "yes" && v !== "no") throw new Usage(`${name} takes yes or no`);
  return v === "yes";
};

/**
 * Everything that would be sent for `out`, without sending it: the upload's metadata and the follow-up steps.
 * Throws Usage when a file the upload needs is missing.
 */
export function plan(out, argv = []) {
  out = resolve(out);
  const short = existsSync(join(out, "short.json"));
  const manifest = readJson(join(out, short ? "short.json" : "video.json"));
  const yt = destinationOf(channelOf(out), "youtube");
  const need = (f) => {
    const p = join(out, f);
    if (!existsSync(p)) throw new Usage(`${f} is not in ${out}: deliver it first (chalk pipeline ${out})`);
    return p;
  };
  const video = need(short ? "short.mp4" : "video.mp4");
  const description = readFileSync(need("description.txt"), "utf8").trim();
  const title = manifest.publish?.title ?? manifest.title;
  if (!title || title.length > 100) throw new Usage(`the title must be 1–100 characters (it is ${title?.length ?? 0})`);
  const tags = manifest.publish?.tags ?? manifest.tags ?? yt.tags ?? [];
  const at = flag(argv, "--at");
  const status = { privacyStatus: "private", embeddable: true, license: "youtube" };
  if (at) status.publishAt = publishTime(at);
  const kids = yesNo(flag(argv, "--made-for-kids"), "--made-for-kids");
  if (kids !== undefined) status.selfDeclaredMadeForKids = kids;
  const ai = yesNo(flag(argv, "--ai"), "--ai");
  if (ai !== undefined) status.containsSyntheticMedia = ai;
  const opt = (f) => (existsSync(join(out, f)) ? join(out, f) : null);
  return {
    out,
    kind: short ? "short" : "video",
    video,
    bytes: statSync(video).size,
    snippet: {
      title,
      description,
      tags,
      categoryId: String(yt.category ?? "27"), // Education
      defaultLanguage: yt.language ?? "en",
      defaultAudioLanguage: yt.language ?? "en",
    },
    status,
    thumbnail: opt("thumbnail.png"),
    captions: opt("captions.srt"),
    playlist: manifest.publish?.playlist ?? (short ? yt.shorts_playlist : yt.playlist) ?? null,
    declared: { madeForKids: kids, syntheticMedia: ai },
  };
}

// ── OAuth (installed app, loopback redirect, PKCE) ────────────────────────────────────────────────

function client(path = CLIENT) {
  if (!existsSync(path)) {
    throw new Usage(`no OAuth client at ${path}. In Google Cloud Console: enable "YouTube Data API v3", create an ` +
      `OAuth client of type "Desktop app", download its JSON, then run: chalk publish auth --client <that file>`);
  }
  const c = readJson(path);
  const k = c.installed ?? c.web;
  if (!k?.client_id || !k?.client_secret) throw new Usage(`${path} is not an OAuth client file (no client_id)`);
  return { id: k.client_id, secret: k.client_secret };
}

async function auth(argv) {
  const from = flag(argv, "--client");
  mkdirSync(CONFIG, { recursive: true });
  if (from) {
    writeFileSync(CLIENT, readFileSync(from));
    chmodSync(CLIENT, 0o600);
  }
  const c = client();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");
  // a one-shot server on a free local port receives Google's redirect with the code
  let gotCode;
  const codeArrived = new Promise((done, fail) => (gotCode = { done, fail }));
  const server = createServer((req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    if (u.searchParams.get("state") !== state) return res.end("Unexpected request.");
    const code = u.searchParams.get("code");
    res.end(code ? "Signed in. You can close this tab and go back to the terminal." : "Sign-in was not completed.");
    code ? gotCode.done(code) : gotCode.fail(new Error(u.searchParams.get("error") ?? "no code"));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const redirect = `http://127.0.0.1:${server.address().port}`;
  const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
    client_id: c.id, redirect_uri: redirect, response_type: "code", scope: SCOPES.join(" "),
    access_type: "offline", prompt: "consent", state, code_challenge: challenge, code_challenge_method: "S256",
  });
  console.log(`Open this link, choose the channel's Google account and allow access:\n\n${url}\n`);
  if (process.platform === "darwin") spawnSync("open", [url]);
  let code;
  try {
    code = await codeArrived;
  } finally {
    server.close();
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, code_verifier: verifier,
      grant_type: "authorization_code", redirect_uri: redirect }),
  });
  const t = await r.json();
  if (!t.refresh_token) throw new Error(`Google sent no refresh token (${t.error ?? r.status}: ${t.error_description ?? ""})`);
  writeFileSync(TOKEN, JSON.stringify({ refresh_token: t.refresh_token, scope: t.scope }, null, 2));
  chmodSync(TOKEN, 0o600);
  console.log(`publish: signed in; the token is in ${TOKEN} (only you can read it)`);
}

async function accessToken() {
  if (!existsSync(TOKEN)) throw new Usage("not signed in: run chalk publish auth first");
  const c = client();
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: readJson(TOKEN).refresh_token, client_id: c.id, client_secret: c.secret,
      grant_type: "refresh_token" }),
  });
  const t = await r.json();
  if (!t.access_token) throw new Error(`could not refresh the sign-in (${t.error ?? r.status}); run chalk publish auth again`);
  return t.access_token;
}

// ── the upload and its follow-up steps ────────────────────────────────────────────────────────────

async function api(token, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } });
  const text = await r.text();
  const body = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${url.split("?")[0]} → ${r.status}: ${body?.error?.message ?? text.slice(0, 300)}`);
  return { r, body };
}

async function uploadVideo(token, p) {
  const init = await api(token, `${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=UTF-8", "x-upload-content-type": "video/mp4",
      "x-upload-content-length": String(p.bytes) },
    body: JSON.stringify({ snippet: p.snippet, status: p.status }),
  });
  const session = init.r.headers.get("location");
  if (!session) throw new Error("YouTube did not open an upload session");
  console.log(`publish: uploading ${basename(p.video)} (${(p.bytes / 1e6).toFixed(1)} MB)…`);
  const { body } = await api(token, session, { method: "PUT", headers: { "content-type": "video/mp4" }, body: readFileSync(p.video) });
  return body.id;
}

async function setThumbnail(token, id, png) {
  if (statSync(png).size > 2e6) throw new Error("thumbnail.png is over YouTube's 2 MB limit");
  await api(token, `${UPLOAD}/thumbnails/set?videoId=${id}&uploadType=media`, {
    method: "POST", headers: { "content-type": "image/png" }, body: readFileSync(png),
  });
}

async function addCaptions(token, id, srt, language) {
  const boundary = "chalk" + randomBytes(8).toString("hex");
  const meta = JSON.stringify({ snippet: { videoId: id, language, name: "", isDraft: false } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\ncontent-type: application/octet-stream\r\n\r\n`),
    readFileSync(srt),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  await api(token, `${UPLOAD}/captions?uploadType=multipart&part=snippet`, {
    method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body,
  });
}

async function addToPlaylist(token, id, name) {
  let playlistId = /^PL[\w-]{10,}$/.test(name) ? name : null;
  for (let page = ""; !playlistId; ) {
    const { body } = await api(token, `${API}/playlists?part=snippet&mine=true&maxResults=50${page ? `&pageToken=${page}` : ""}`);
    playlistId = body.items?.find((p) => p.snippet.title === name)?.id ?? null;
    if (playlistId || !body.nextPageToken) break;
    page = body.nextPageToken;
  }
  if (!playlistId) throw new Error(`no playlist named "${name}" on the channel`);
  await api(token, `${API}/playlistItems?part=snippet`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ snippet: { playlistId, resourceId: { kind: "youtube#video", videoId: id } } }),
  });
}

/** What --dry-run says for this destination. */
export function dryRun(p, record) {
  const steps = [["thumbnail", p.thumbnail], ["captions", p.captions], ["playlist", p.playlist]];
  return `would upload ${p.kind} "${p.snippet.title}" ${p.status.publishAt ? `scheduled for ${p.status.publishAt}` : "as Private"}` +
    (record?.videoId ? ` — already uploaded as ${record.videoId}; would retry: ${steps.filter(([n, have]) => have && record.steps?.[n] !== "ok").map(([n]) => n).join(", ") || "nothing"}` : "");
}

/** Upload once, then finish the follow-up steps; `record` is this platform's entry in published.json. */
export async function publish(out, argv, record, save) {
  const p = plan(out, argv);
  record.steps ??= {};
  if (!channelOf(out).destinations?.youtube && channelOf(out).youtube) {
    console.log('publish: channel.json\'s top-level "youtube" block is read as destinations.youtube; move it there when convenient');
  }
  const steps = [
    ["thumbnail", p.thumbnail, (t, id) => setThumbnail(t, id, p.thumbnail)],
    ["captions", p.captions, (t, id) => addCaptions(t, id, p.captions, p.snippet.defaultLanguage)],
    ["playlist", p.playlist, (t, id) => addToPlaylist(t, id, p.playlist)],
  ];
  const token = await accessToken();
  if (!record.videoId) {
    record.videoId = await uploadVideo(token, p);
    Object.assign(record, { url: `https://youtu.be/${record.videoId}`, uploadedAt: new Date().toISOString(),
      title: p.snippet.title, privacy: p.status.privacyStatus, publishAt: p.status.publishAt ?? null });
    save();
    console.log(`publish: youtube: uploaded ${record.url}`);
  } else console.log(`publish: youtube: already uploaded as ${record.url}; finishing the remaining steps`);
  let failed = 0;
  for (const [step, have, fn] of steps) {
    if (!have || record.steps[step] === "ok") continue;
    try {
      await fn(token, record.videoId);
      record.steps[step] = "ok";
      console.log(`publish: youtube: ${step} ✓`);
    } catch (e) {
      record.steps[step] = e.message;
      failed++;
      console.error(`publish: youtube: ${step} failed — ${e.message}`);
    }
    save();
  }
  console.log(`publish: ${record.url} — ${p.status.publishAt ? `scheduled for ${new Date(p.status.publishAt).toString()}` : "Private"}` +
    (p.declared.madeForKids === undefined ? '; set "made for kids" in Studio' : "") +
    (failed ? `; ${failed} step(s) failed, rerun to retry them` : ""));
  return failed ? 1 : 0;
}

export { auth };

