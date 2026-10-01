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

/**
 * Launch a headless Chrome and wait for its DevTools endpoint.
 *
 * `relaxAutoplay` disables the autoplay policy, which most of this file wants: these tests drive
 * the page with JS `.click()`, and a synthetic click grants no user activation, so without the
 * relaxation every play() would be rejected for reasons that have nothing to do with the player.
 *
 * It must NOT be relaxed for the gesture test below — that one is specifically about whether a
 * real click reaches play(), and the relaxation would make it pass no matter what.
 */
async function launch({ relaxAutoplay }) {
  const port = 9000 + Math.floor(Math.random() * 900);
  const profile = mkdtempSync(join(tmpdir(), "chalk-chrome-"));
  const proc = spawn(chrome, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu",
    ...(relaxAutoplay ? ["--autoplay-policy=no-user-gesture-required"] : []),
  ], { stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try { await fetch(base + "/json/version"); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  return { proc, profile, base };
}

const relaxed = await launch({ relaxAutoplay: true });
const proc = relaxed.proc;
const profile = relaxed.profile;
const base = relaxed.base;

async function open(pageUrl, { onNewDocument, base: at = base } = {}) {
  const target = await (await fetch(`${at}/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" })).json();
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
    /**
     * Click an element the way a person does. `element.click()` from script does NOT grant user
     * activation, so it can never exercise the autoplay path; only a dispatched input event can.
     * Scrolls the target into view first — a click at coordinates outside the viewport silently
     * lands on nothing, which looks exactly like a broken handler.
     */
    async click(selector) {
      const box = await send("Runtime.evaluate", {
        expression: `(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return null;
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
          const hit = document.elementFromPoint(x, y);
          return JSON.stringify({ x, y, hits: !!hit && (hit === el || el.contains(hit)) });
        })()`,
        returnByValue: true,
      });
      const v = box.result?.result?.value;
      if (!v) throw new Error(`click: no element matches ${selector}`);
      const { x, y, hits } = JSON.parse(v);
      if (!hits) throw new Error(`click: ${selector} is not the element at (${x}, ${y}) — it is covered or off-screen`);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    },
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
let strict = null; // the second browser, with the autoplay policy left ON

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

  // ── the autoplay gate ───────────────────────────────────────────────────────────────────────
  //
  // Every test above runs with the autoplay policy DISABLED and clicks via JS `.click()`. Neither
  // grants user activation, so between them the one thing that matters most to a real learner —
  // does the video actually start when a human presses the button — was never asserted. A
  // regression that moved play() out of the gesture handler would pass all sixteen and fail for
  // everyone. This browser enforces the real policy and the click is a real input event.
  strict = await launch({ relaxAutoplay: false });
  const real = await open(url, { onNewDocument: wipe, base: strict.base });
  await real.viewport(1100, 900);
  // Capture WHY play() was refused, and WHEN it was called.
  //
  // "when" matters more than it looks. Chrome has STICKY activation: once the page has been
  // clicked at all, a play() deferred to a later task still succeeds, so Chrome alone cannot tell
  // a correct player from one that calls play() outside the gesture turn. Safari has no such
  // forgiveness — it requires play() in the same turn as the gesture, and a deferred call there
  // is simply refused. So the gate asserts the stricter rule that Safari enforces, using a flag
  // that is true only for the duration of the click's own task.
  await real.evaluate(`
    window.__play = "play() was never called";
    window.__inGesture = false;
    window.__calledInGesture = null;
    document.getElementById("start-btn").addEventListener("click", () => {
      window.__inGesture = true;
      setTimeout(() => { window.__inGesture = false; }, 0); // anything deferred lands after this
    }, true);
    const v = document.getElementById("video");
    const orig = v.play.bind(v);
    v.play = function () {
      if (window.__calledInGesture === null) window.__calledInGesture = window.__inGesture;
      const p = orig();
      if (p && p.then) {
        p.then(() => { window.__play = "resolved"; })
         .catch((e) => { window.__play = e.name + ": " + e.message; });
      } else { window.__play = "resolved (no promise)"; }
      return p;
    };
    return true;`);

  await real.click("#start-btn");
  await new Promise((r) => setTimeout(r, 1800));
  const live = await real.evaluate(`
    const v = document.getElementById("video");
    return {
      why: window.__play,
      paused: v.paused,
      currentTime: v.currentTime,
      readyState: v.readyState,
      error: v.error ? v.error.code + " " + v.error.message : null,
      activated: navigator.userActivation ? navigator.userActivation.hasBeenActive : true,
      calledInGesture: window.__calledInGesture,
    };`);

  ok("a real click actually starts playback, under the real autoplay policy", () => {
    assert.equal(live.activated, true, "the dispatched event did not register as user activation");
    assert.equal(live.error, null, `the video element reported an error: ${live.error}`);
    assert.ok(live.readyState >= 2, `the video never loaded (readyState ${live.readyState})`);
    assert.equal(live.paused, false, `play() did not start it — ${live.why}`);
    assert.ok(live.currentTime > 0, `playback did not advance — currentTime ${live.currentTime}, ${live.why}`);
  });
  ok("play() is called inside the gesture's own task, which is what Safari requires", () => {
    assert.notEqual(live.calledInGesture, null, "play() was never called at all");
    assert.equal(
      live.calledInGesture, true,
      "play() ran in a later task than the click. Chrome's sticky activation forgives this and the " +
        "video still starts here, but Safari refuses it outright — call play() synchronously in the handler.",
    );
  });
  ok("no console errors under the real policy", () => assert.deepEqual(real.problems, []));
} finally {
  try { proc.kill("SIGKILL"); } catch {}
  try { strict?.proc.kill("SIGKILL"); } catch {}
  if (strict) rmSync(strict.profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log(
  `\nplayer-browser: ${passed}/${passed + failed} passed` + (skipped ? `, ${skipped} skipped` : ""),
);
process.exit(failed ? 1 : 0);
