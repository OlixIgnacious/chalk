#!/usr/bin/env node
// tier2.mjs — the Manim gate: a real render, and proof that its alpha actually composites.
//
//   node test/tier2.mjs        (or: npm run test:tier2)
//
// Kept out of `npm test` because it needs manim and takes tens of seconds. It exists because the
// two things that matter about Tier 2 cannot be checked any other way:
//
//   · the clip comes out at exactly the composition's fps and dimensions, with an alpha track
//   · Chrome — which is what Hyperframes renders in — composites that alpha
//
// That second one was an open question in references/manim.md. It is answered here rather than
// assumed, because designing a scene around layering that turns out not to work wastes the render.

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const renderScript = join(root, "scripts/manim-render.mjs");
const template = join(root, "templates/manim/scene_template.py");
const worked = join(root, "templates/manim/example_equation_transform.py");

const haveManim =
  existsSync(join(root, ".venv/bin/manim")) ||
  spawnSync("manim", ["--version"], { stdio: "ignore" }).status === 0;
if (!haveManim) {
  console.log("tier2: skipped — manim is not installed (see references/manim.md)");
  process.exit(0);
}

const tmp = mkdtempSync(join(tmpdir(), "chalk-tier2-"));
copyFileSync(template, join(tmp, "scene_template.py"));

// A geometric construction: one of the four rows Manim earns, and it needs no LaTeX.
writeFileSync(
  join(tmp, "construction.py"),
  `from manim import Circle, Line, ORIGIN, RIGHT\n` +
    `from scene_template import ChalkScene\n\n\n` +
    `class Construction(ChalkScene):\n` +
    `    def construct(self):\n` +
    `        radius = self.styled(Line(ORIGIN, RIGHT * 2), accent=True)\n` +
    `        circle = self.styled(Circle(radius=2))\n` +
    `        self.draw(radius, run_time=0.4)\n` +
    `        self.draw(circle, run_time=0.8)\n` +
    `        self.wait(0.2)\n`,
);

let failed = 0;
let passed = 0;
let skipped = 0;
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

const FPS = "30";
const W = 480;
const H = 270;
const webm = join(tmp, "assets", "construction.webm");

try {
  // ── render ──────────────────────────────────────────────────────────────────────────────────────
  const r = spawnSync(
    process.execPath,
    [renderScript, join(tmp, "construction.py"), "--fps", FPS, "--resolution", `${W}x${H}`,
     "--out", join(tmp, "assets"), "--quality", "l"],
    { encoding: "utf8", cwd: tmp, env: { ...process.env, PYTHONPATH: tmp,
      CHALK_TOKENS: JSON.stringify({ fg: "#e7e9ee", accent: "#8aa7d6" }) } },
  );
  ok("manim-render: a construction scene renders without LaTeX", () => {
    assert.equal(r.status, 0, (r.stderr ?? "").slice(-1500));
    assert.ok(existsSync(webm), "no .webm was produced");
  });

  const probe = () =>
    JSON.parse(
      spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_streams", "-of", "json", webm],
                { encoding: "utf8" }).stdout,
    ).streams?.[0] ?? {};

  // WebM keeps alpha in a SEPARATE track, so pix_fmt reads yuv420p even when the alpha is intact.
  // AlphaMode is the signal; checking pix_fmt here would reject a perfectly good clip.
  ok("the clip carries an alpha track", () => {
    assert.equal(probe().tags?.alpha_mode, "1", "AlphaMode unset — it would composite as a rectangle");
  });

  ok("fps and dimensions are pinned to the composition", () => {
    const p = probe();
    const [num, den] = String(p.r_frame_rate).split("/");
    assert.equal(Number(num) / Number(den || 1), Number(FPS), "a mismatched fps judders");
    assert.equal(Number(p.width), W);
    assert.equal(Number(p.height), H);
  });

  // ── the MathTex path ────────────────────────────────────────────────────────────────────────────
  // The one case Tier 2 clearly earns: an equation visibly becoming another equation. It needs
  // LaTeX, and manim-render exits 3 when there is none, which is the caller's cue to drop to Tier 1.
  copyFileSync(worked, join(tmp, "example_equation_transform.py"));
  const eqWebm = join(tmp, "assets", "example_equation_transform.webm");
  const eq = spawnSync(
    process.execPath,
    [renderScript, join(tmp, "example_equation_transform.py"), "--fps", FPS,
     "--resolution", `${W}x${H}`, "--out", join(tmp, "assets"), "--quality", "l"],
    { encoding: "utf8", cwd: tmp, env: { ...process.env, PYTHONPATH: tmp,
      CHALK_TOKENS: JSON.stringify({ fg: "#e7e9ee", accent: "#8aa7d6" }) } },
  );

  ok("manim-render: the worked equation transform renders", () => {
    if (eq.status === 3) return "no LaTeX, so MathTex cannot render (exit 3 routes to Tier 1)";
    assert.equal(eq.status, 0, (eq.stderr ?? "").slice(-1500));
    assert.ok(existsSync(eqWebm), "no .webm was produced");

    // Matroska carries no per-stream duration, so that comes from the format.
    const probed = JSON.parse(
      spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_streams", "-show_format",
                            "-of", "json", eqWebm], { encoding: "utf8" }).stdout,
    );
    const p = probed.streams?.[0] ?? {};
    assert.equal(p.tags?.alpha_mode, "1", "the equation clip must composite, like any other");
    assert.equal(Number(p.width), W);
    assert.ok(
      Number(probed.format?.duration ?? 0) > 1,
      `the transform needs time to be watched, got ${probed.format?.duration}s`,
    );
  });

  // ── does Chrome composite it? ───────────────────────────────────────────────────────────────────
  const chrome = [
    process.env.CHROME, process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((c) => c && existsSync(c));

  if (!chrome) {
    skipped++;
    console.log("  skip  the alpha composites in Chrome (no Chrome found)");
  } else {
    // Solid red behind the clip: red showing through means the alpha is real.
    writeFileSync(
      join(tmp, "assets", "alpha.html"),
      `<!doctype html><html><body style="margin:0;background:#ff0000">` +
        `<video id="v" src="construction.webm" style="position:absolute;inset:0;width:${W}px;height:${H}px">` +
        `</video></body></html>`,
    );

    const port = 9000 + Math.floor(Math.random() * 900);
    const profile = mkdtempSync(join(tmpdir(), "chalk-tier2-chrome-"));
    const proc = spawn(chrome, ["--headless=new", `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu",
      "--autoplay-policy=no-user-gesture-required"], { stdio: "ignore" });
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120; i++) {
      try { await fetch(base + "/json/version"); break; } catch { await new Promise((x) => setTimeout(x, 100)); }
    }

    try {
      const url = "file://" + join(tmp, "assets", "alpha.html");
      const target = await (await fetch(`${base}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      let id = 0;
      const pending = new Map();
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      };
      const send = (method, params = {}) =>
        new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })); });

      await send("Page.enable");
      await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
      await new Promise((x) => setTimeout(x, 700));

      const state = await send("Runtime.evaluate", {
        expression: `(() => { const v = document.getElementById("v");
          return new Promise((res) => {
            const go = () => { v.currentTime = Math.min(1.2, v.duration - 0.1);
              v.addEventListener("seeked", () => setTimeout(() => res({
                w: v.videoWidth, h: v.videoHeight, err: v.error && v.error.code }), 200), { once: true }); };
            if (v.readyState >= 2) go(); else v.addEventListener("loadeddata", go, { once: true });
            setTimeout(() => res({ w: v.videoWidth, h: v.videoHeight, err: "timeout" }), 8000);
          }); })()`,
        returnByValue: true, awaitPromise: true,
      });
      const v = state.result?.result?.value ?? {};

      ok("Chrome decodes the WebM", () => {
        assert.equal(v.err, null, `video error: ${v.err}`);
        assert.equal(v.w, W, "Chrome could not decode it — qtrle .mov would look like this");
      });

      const shot = await send("Page.captureScreenshot", { format: "png" });
      const png = join(tmp, "shot.png");
      writeFileSync(png, Buffer.from(shot.result.data, "base64"));
      const corner = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", png,
        "-vf", "crop=8:8:2:2,scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        { encoding: "buffer" }).stdout.toString("hex");

      // This is the question references/manim.md left open.
      ok("the alpha composites: the page shows through the clip", () => {
        assert.equal(corner, "ff0000",
          `the corner is ${corner}, not the red behind it — the clip is compositing as opaque`);
      });
    } finally {
      try { proc.kill("SIGKILL"); } catch {}
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log(`\ntier2: ${passed}/${passed + failed} passed` + (skipped ? `, ${skipped} skipped` : ""));
process.exit(failed ? 1 : 0);
