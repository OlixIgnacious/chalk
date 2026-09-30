#!/usr/bin/env node
// player-browser.mjs — the step-5 gate, driven in a real browser.
//
//   node test/player-browser.mjs        (or: npm run test:player)
//
// The step-5 gate is about behaviour no node test can reach: the page has to open from file://,
// hold at every checkpoint, survive localStorage being taken away, and work by keyboard at phone
// width. So this builds a real lesson — real MP4s, real VTTs — and drives the built page over the
// DevTools protocol with node's own WebSocket. No test framework, no browser automation dependency.
//
// It SKIPS rather than fails when Chrome is not installed, so `npm test` stays the everyday gate
// and this stays the one you run before shipping a player change.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildScript = join(root, "skills/chalk/scripts/build-lesson-page.mjs");

// ── find a browser ────────────────────────────────────────────────────────────────────────────────

function findChrome() {
  const candidates = [
    process.env.CHROME,
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  for (const c of ["google-chrome", "chromium", "chromium-browser"]) {
    const r = spawnSync("which", [c], { encoding: "utf8" });
    if (r.status === 0) return r.stdout.trim();
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log("player-browser: skipped — no Chrome found (set CHROME to its path)");
  process.exit(0);
}

// ── a real lesson to drive ────────────────────────────────────────────────────────────────────────

const tmp = mkdtempSync(join(tmpdir(), "chalk-player-"));
const out = join(tmp, "lesson");
mkdirSync(join(out, "segments/01"), { recursive: true });
mkdirSync(join(out, "segments/02"), { recursive: true });

const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;
for (const n of ["01", "02"]) {
  if (hasFfmpeg) {
    spawnSync(
      "ffmpeg",
      ["-loglevel", "error", "-y", "-f", "lavfi", "-i", "color=c=0x0e0f12:s=640x360:d=3",
       "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-c:v", "libx264", "-pix_fmt", "yuv420p",
       "-r", "30", "-c:a", "aac", "-shortest", join(out, `segments/${n}/segment.mp4`)],
      { stdio: "ignore" },
    );
  }
  writeFileSync(
    join(out, `segments/${n}/segment.vtt`),
    "WEBVTT\n\n1\n00:00:00.030 --> 00:00:01.080\nAs the price goes up,\n\n2\n00:00:01.330 --> 00:00:02.280\npeople buy less.\n",
  );
}

writeFileSync(
  join(out, "lesson.json"),
  JSON.stringify({
    title: "A Candle: the Flame",
    source: "fixtures/gutenberg-chapter.md",
    segments: [
      { id: "01", title: "Why a candle needs a wick",
        objective: "Explain what the wick does that the wax cannot do alone.",
        mp4: "segments/01/segment.mp4", captions: "segments/01/segment.vtt", duration: 3,
        checkpoint: { prompt: "A candle burns steadily for an hour. What is the wick doing?",
          options: ["Burning as fuel itself", "Drawing liquid wax up to the flame", "Cooling the flame"],
          answer: 1, explanation: "The wick carries melted wax upward to where the flame can consume it.",
          source: ["p010", "p011"] } },
      { id: "02", title: "The structure of the flame",
        mp4: "segments/02/segment.mp4", captions: "segments/02/segment.vtt", duration: 3,
        checkpoint: { prompt: "Where does the brightest light come from?",
          options: ["The dark core", "The outer edge, where air reaches it"],
          answer: 1, explanation: "Combustion is brightest where the flame meets fresh air.",
          source: ["p021"] } },
    ],
    glossary: [{ term: "combustion", definition: "Fuel reacting with oxygen.", source: ["p021"] }],
  }, null, 2),
);

const built = spawnSync(process.execPath, [buildScript, join(out, "lesson.json")], { encoding: "utf8" });
if (built.status !== 0) {
  console.error("player-browser: build-lesson-page failed\n" + built.stderr);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
const url = "file://" + join(out, "lesson.html");

// ── a minimal DevTools-protocol driver ────────────────────────────────────────────────────────────

const port = 9000 + Math.floor(Math.random() * 900);
const profile = mkdtempSync(join(tmpdir(), "chalk-chrome-"));
const proc = spawn(chrome, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-gpu",
  "--autoplay-policy=no-user-gesture-required",
], { stdio: "ignore" });

const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 120; i++) {
  try { await fetch(base + "/json/version"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}

async function open(pageUrl, { onNewDocument } = {}) {
  const target = await (await fetch(`${base}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const problems = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    const d = m.params?.exceptionDetails;
    if (m.method === "Runtime.exceptionThrown") problems.push("exception: " + (d?.exception?.description ?? d?.text));
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      problems.push("console.error: " + m.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  const send = (method, params = {}) =>
    new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

  await send("Runtime.enable");
  await send("Page.enable");
  if (onNewDocument) await send("Page.addScriptToEvaluateOnNewDocument", { source: onNewDocument });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 120; i++) {
    const r = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (r.result?.result?.value === "complete") break;
    await new Promise((r2) => setTimeout(r2, 50));
  }

  return {
    problems,
    async evaluate(expr) {
      const r = await send("Runtime.evaluate", {
        expression: `(() => { ${expr} })()`, returnByValue: true, awaitPromise: true,
      });
      const ex = r.result?.exceptionDetails;
      if (ex) throw new Error("page threw: " + (ex.exception?.description ?? ex.text));
      return r.result?.result?.value;
    },
    viewport: (width, height) =>
      send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }),
    key: (key, code, vk) =>
      send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk })
        .then(() => send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk })),
  };
}

// ── the gate ──────────────────────────────────────────────────────────────────────────────────────

let failed = 0;
let skipped = 0;
let passed = 0;
const ok = (name, fn) => {
  try {
    const note = fn();
    if (typeof note === "string") { skipped++; console.log(`  skip  ${name} (${note})`); }
    else { passed++; console.log(`  ok    ${name}`); }
  } catch (e) {
    failed++;
    console.error(`  FAIL  ${name}\n        ${String(e.message).split("\n").join("\n        ")}`);
  }
};
const wipe = "try { localStorage.clear(); } catch {}";

try {
  const p = await open(url, { onNewDocument: wipe });
  await p.viewport(1100, 900);

  const first = await p.evaluate(`return {
    railCount: document.querySelectorAll("#rail button").length,
    secondLocked: document.querySelectorAll("#rail button")[1].disabled,
    startVisible: !document.getElementById("start-card").hidden,
    terms: document.querySelectorAll("#terms button").length,
    progress: document.getElementById("progress-text").textContent,
  };`);

  ok("opens from file:// with no console errors", () => assert.deepEqual(p.problems, []));
  ok("opens on a click-to-start card, because audio cannot autoplay", () =>
    assert.equal(first.startVisible, true));
  ok("the next segment starts locked", () => {
    assert.equal(first.railCount, 2);
    assert.equal(first.secondLocked, true);
    assert.equal(first.progress, "0 of 2 segments complete");
  });
  ok("the glossary renders", () => assert.equal(first.terms, 1));

  const started = await p.evaluate(`
    document.getElementById("start-btn").click();
    const v = document.getElementById("video");
    return new Promise((res) => {
      const done = () => res({ src: v.getAttribute("src"), readyState: v.readyState,
        paneVisible: !document.getElementById("player-pane").hidden });
      if (v.readyState >= 1) return done();
      v.addEventListener("loadedmetadata", done, { once: true });
      setTimeout(done, 5000);
    });`);
  ok("starting opens the first segment", () => {
    assert.equal(started.paneVisible, true);
    assert.equal(started.src, "segments/01/segment.mp4");
  });
  ok("the MP4 resolves from its relative path", () => {
    if (!hasFfmpeg) return "no ffmpeg, so there is no media to load";
    assert.ok(started.readyState >= 1, `readyState ${started.readyState} — metadata never loaded`);
  });

  const caps = await p.evaluate(`
    const v = document.getElementById("video");
    const at = (t) => { v.currentTime = t; v.dispatchEvent(new Event("timeupdate"));
                        return document.getElementById("caption").textContent; };
    const a = at(0.5), b = at(1.6);
    document.getElementById("cap-btn").click();
    const off = at(0.5);
    document.getElementById("cap-btn").click();
    return { a, b, off, backOn: at(0.5) };`);
  ok("captions render inline and toggle, without <track>", () => {
    assert.equal(caps.a, "As the price goes up,");
    assert.equal(caps.b, "people buy less.");
    assert.equal(caps.off, "");
    assert.equal(caps.backOn, "As the price goes up,");
  });

  const cp = await p.evaluate(`
    document.getElementById("video").dispatchEvent(new Event("ended"));
    return {
      cardVisible: !document.getElementById("checkpoint-card").hidden,
      continueHidden: document.getElementById("continue-btn").hidden,
      verdictHidden: document.getElementById("checkpoint-verdict").hidden,
      stillLocked: document.querySelectorAll("#rail button")[1].disabled,
      focused: document.activeElement.id,
    };`);
  ok("the checkpoint HOLDS: nothing advances until it is answered", () => {
    assert.equal(cp.cardVisible, true);
    assert.equal(cp.continueHidden, true, "there must be no way past an unanswered checkpoint");
    assert.equal(cp.verdictHidden, true);
    assert.equal(cp.stillLocked, true, "the next segment must stay locked");
  });
  ok("focus moves into the checkpoint card", () => assert.equal(cp.focused, "checkpoint-prompt"));

  const wrong = await p.evaluate(`
    document.querySelectorAll("#checkpoint-options button")[0].click();
    const btns = [...document.querySelectorAll("#checkpoint-options button")];
    return {
      title: document.getElementById("verdict-title").textContent,
      explanation: document.getElementById("verdict-explanation").textContent,
      codes: [...document.querySelectorAll("#verdict-cite code")].map(c => c.textContent),
      marks: btns.map(b => b.className),
      allDisabled: btns.every(b => b.disabled),
      unlocked: !document.querySelectorAll("#rail button")[1].disabled,
    };`);
  ok("a wrong answer reveals the correct one and cites the chapter", () => {
    assert.equal(wrong.title, "Not quite");
    assert.match(wrong.explanation, /carries melted wax/);
    assert.deepEqual(wrong.codes, ["p010", "p011"], "every answer cites its block ids");
    assert.ok(wrong.marks[1].includes("right"));
    assert.ok(wrong.marks[0].includes("wrong"));
    assert.equal(wrong.allDisabled, true, "an answer must not be changeable after the reveal");
  });
  ok("answering unlocks the next segment", () => assert.equal(wrong.unlocked, true));

  const finish = await p.evaluate(`
    document.getElementById("continue-btn").click();
    const src2 = document.getElementById("video").getAttribute("src");
    document.getElementById("video").dispatchEvent(new Event("ended"));
    document.querySelectorAll("#checkpoint-options button")[1].click();
    const verdict2 = document.getElementById("verdict-title").textContent;
    document.getElementById("continue-btn").click();
    return { src2, verdict2,
      doneVisible: !document.getElementById("done-card").hidden,
      score: document.getElementById("done-score").textContent,
      progress: document.getElementById("progress-text").textContent };`);
  ok("it plays on into the next segment and finishes", () => {
    assert.equal(finish.src2, "segments/02/segment.mp4");
    assert.equal(finish.verdict2, "That is it");
    assert.equal(finish.doneVisible, true);
    assert.equal(finish.score, "1 of 2 checkpoints answered correctly on the first try.");
    assert.equal(finish.progress, "2 of 2 segments complete");
  });

  const resumed = await (await open(url)).evaluate(`return {
    startBtn: document.getElementById("start-btn").textContent,
    progress: document.getElementById("progress-text").textContent };`);
  ok("progress survives a reload", () => {
    assert.equal(resumed.startBtn, "Resume the lesson");
    assert.equal(resumed.progress, "2 of 2 segments complete");
  });

  // The page must work with no persistence at all: private windows and blocked site data are normal.
  const noStore = await open(url, {
    onNewDocument: `Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });`,
  });
  const blocked = await noStore.evaluate(`
    document.getElementById("start-btn").click();
    document.getElementById("video").dispatchEvent(new Event("ended"));
    document.querySelectorAll("#checkpoint-options button")[1].click();
    return { verdict: document.getElementById("verdict-title").textContent,
             unlocked: !document.querySelectorAll("#rail button")[1].disabled,
             progress: document.getElementById("progress-text").textContent };`);
  ok("the lesson works with localStorage blocked", () => {
    assert.deepEqual(noStore.problems, [], "a blocked store must not surface an error");
    assert.equal(blocked.verdict, "That is it");
    assert.equal(blocked.unlocked, true);
    assert.equal(blocked.progress, "1 of 2 segments complete");
  });

  const kb = await open(url, { onNewDocument: wipe });
  await kb.evaluate(`document.getElementById("start-btn").click(); document.body.focus();`);
  await kb.key("c", "KeyC", 67);
  const pressed = await kb.evaluate(`return document.getElementById("cap-btn").getAttribute("aria-pressed");`);
  ok("pressing c toggles captions", () => assert.equal(pressed, "false"));

  const phone = await open(url, { onNewDocument: wipe });
  await phone.viewport(390, 780);
  const overflow = await phone.evaluate(`
    document.getElementById("start-btn").click();
    return { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };`);
  ok("no horizontal scroll at phone width", () =>
    assert.ok(overflow.scrollW <= overflow.clientW + 1,
      `scrollWidth ${overflow.scrollW} exceeds clientWidth ${overflow.clientW}`));
} finally {
  try { proc.kill("SIGKILL"); } catch {}
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log(
  `\nplayer-browser: ${passed}/${passed + failed} passed` + (skipped ? `, ${skipped} skipped` : ""),
);
process.exit(failed ? 1 : 0);
