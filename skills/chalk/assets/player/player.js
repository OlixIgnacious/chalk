// player.js — drives lesson.html from the embedded manifest.
//
// Inlined by build-lesson-page.mjs, so it runs from file:// with no server and no build step.
// Everything it renders comes from the manifest and is written with textContent: the manifest is
// data, and a chapter's own words must never be able to become markup.
//
// Constraints this file exists to honour (references/step-5-player.md):
//   · audio cannot autoplay — the lesson opens on a click-to-start card
//   · every localStorage touch is wrapped, and the page works with no persistence at all
//   · a checkpoint HOLDS until answered, then reveals the explanation and its source citation
//   · captions are on by default, drawn by us rather than by <track>, which file:// blocks

(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  let manifest;
  try {
    manifest = JSON.parse($("lesson-manifest").textContent);
  } catch (err) {
    document.body.textContent = "This lesson page has a malformed manifest and cannot open.";
    return;
  }
  const segments = Array.isArray(manifest.segments) ? manifest.segments : [];
  if (!segments.length) {
    document.body.textContent = "This lesson page has no segments.";
    return;
  }

  // ── persistence ────────────────────────────────────────────────────────────────────────────────
  // A private window, blocked site data or a thumbnailer can make any of this throw or come back
  // empty. Progress is a convenience; the lesson must work without it.

  const KEY = "chalk:" + (manifest.slug || manifest.title || "lesson");
  const saved = (() => {
    try {
      const raw = localStorage.getItem(KEY);
      const v = raw ? JSON.parse(raw) : null;
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  })();

  const state = {
    unlocked: Number.isInteger(saved.unlocked) ? Math.min(saved.unlocked, segments.length - 1) : 0,
    cleared: Array.isArray(saved.cleared) ? saved.cleared.filter((s) => typeof s === "string") : [],
    answers: saved.answers && typeof saved.answers === "object" ? saved.answers : {},
    captions: saved.captions !== false,
    rate: [0.75, 1, 1.25, 1.5].includes(saved.rate) ? saved.rate : 1,
  };

  const persist = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* no persistence available — carry on */
    }
  };

  // ── elements ───────────────────────────────────────────────────────────────────────────────────

  const video = $("video");
  const frame = $("frame");
  const caption = $("caption");
  const rail = $("rail");
  const startCard = $("start-card");
  const playerPane = $("player-pane");
  const checkpointCard = $("checkpoint-card");
  const doneCard = $("done-card");

  let index = 0; // segment on screen
  let cues = []; // caption cues for that segment
  let cueAt = -1; // which cue is currently shown

  const isCleared = (s) => state.cleared.includes(s.id);
  const clear = (i) => {
    const id = segments[i].id;
    if (!state.cleared.includes(id)) state.cleared.push(id);
    persist();
  };

  // ── header and rail ────────────────────────────────────────────────────────────────────────────

  function renderHead() {
    const done = segments.filter(isCleared).length;
    const pct = Math.round((done / segments.length) * 100);
    $("bar-fill").style.width = pct + "%";
    document.querySelector(".bar").setAttribute("aria-valuenow", String(pct));
    $("progress-text").textContent = `${done} of ${segments.length} segments complete`;

    if (manifest.source) {
      $("lesson-source").textContent = "Source: " + manifest.source;
      $("lesson-source").hidden = false;
    }
  }

  function renderRail() {
    rail.textContent = "";
    segments.forEach((s, i) => {
      const li = el("li");
      const b = el("button");
      b.type = "button";
      b.disabled = i > state.unlocked;
      // Only while a segment is actually on screen — on the start card nothing is current yet.
      if (i === index && startCard.hidden) b.setAttribute("aria-current", "true");

      b.appendChild(el("span", "n", String(i + 1).padStart(2, "0")));
      b.appendChild(el("span", "t", s.title));
      if (isCleared(s)) b.appendChild(el("span", "tick", "✓"));
      else if (b.disabled) b.appendChild(el("span", "lock", "·"));

      b.setAttribute(
        "aria-label",
        b.disabled
          ? `Segment ${i + 1}, ${s.title} — locked until the checkpoint before it is answered`
          : `Segment ${i + 1}, ${s.title}`,
      );
      b.addEventListener("click", () => openSegment(i, true));
      li.appendChild(b);
      rail.appendChild(li);
    });
  }

  // ── captions ───────────────────────────────────────────────────────────────────────────────────

  function applyCaptionState() {
    const btn = $("cap-btn");
    btn.setAttribute("aria-pressed", String(state.captions));
    if (!state.captions) {
      caption.textContent = "";
      cueAt = -1;
    }
  }

  function paintCue() {
    if (!state.captions || !cues.length) return;
    const t = video.currentTime;
    if (cueAt >= 0 && t >= cues[cueAt].start && t < cues[cueAt].end) return;
    const i = cues.findIndex((c) => t >= c.start && t < c.end);
    if (i === cueAt) return;
    cueAt = i;
    caption.textContent = "";
    if (i >= 0) caption.appendChild(el("span", null, cues[i].text));
  }

  // ── panes ──────────────────────────────────────────────────────────────────────────────────────

  function show(pane) {
    for (const p of [startCard, playerPane, checkpointCard, doneCard]) p.hidden = p !== pane;
  }

  function openSegment(i, autoplay) {
    if (i > state.unlocked) return;
    index = i;
    const s = segments[i];

    cues = Array.isArray(s.cues) ? s.cues : [];
    cueAt = -1;
    caption.textContent = "";

    video.src = s.mp4;
    if (s.poster) video.poster = s.poster;
    else video.removeAttribute("poster");
    video.playbackRate = state.rate;

    $("segment-title").textContent = `${String(i + 1).padStart(2, "0")} · ${s.title}`;
    $("segment-objective").textContent = s.objective || "";

    show(playerPane);
    renderRail();
    renderHead();

    if (autoplay) {
      const p = video.play();
      // A rejected play() is normal when a gesture has not reached this document yet; the native
      // controls are right there, so there is nothing to recover.
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  }

  function onEnded() {
    const s = segments[index];
    if (s.checkpoint && state.answers[s.id] === undefined) {
      showCheckpoint(index);
      return;
    }
    clear(index);
    advance();
  }

  function advance() {
    if (index + 1 < segments.length) {
      if (index + 1 > state.unlocked) {
        state.unlocked = index + 1;
        persist();
      }
      openSegment(index + 1, true);
    } else {
      showDone();
    }
  }

  // ── checkpoint ─────────────────────────────────────────────────────────────────────────────────

  function showCheckpoint(i) {
    const s = segments[i];
    const c = s.checkpoint;
    const list = $("checkpoint-options");
    const verdict = $("checkpoint-verdict");
    const cont = $("continue-btn");

    $("checkpoint-eyebrow").textContent = `Checkpoint · after segment ${String(i + 1).padStart(2, "0")}`;
    $("checkpoint-prompt").textContent = c.prompt;
    list.textContent = "";
    verdict.hidden = true;
    cont.hidden = true;

    const buttons = c.options.map((opt, n) => {
      const li = el("li");
      const b = el("button");
      b.type = "button";
      b.appendChild(el("span", "key", String.fromCharCode(65 + n)));
      b.appendChild(el("span", "label", opt));
      b.addEventListener("click", () => answer(i, n, buttons));
      li.appendChild(b);
      list.appendChild(li);
      return b;
    });

    show(checkpointCard);
    renderRail();
    // Move focus into the card, or a keyboard user is left behind on the video.
    $("checkpoint-prompt").setAttribute("tabindex", "-1");
    $("checkpoint-prompt").focus();

    const previous = state.answers[s.id];
    if (previous !== undefined) reveal(i, previous, buttons);
  }

  function answer(i, choice, buttons) {
    const s = segments[i];
    if (state.answers[s.id] !== undefined) return;
    state.answers[s.id] = choice;
    persist();
    reveal(i, choice, buttons);
  }

  function reveal(i, choice, buttons) {
    const s = segments[i];
    const c = s.checkpoint;
    const right = choice === c.answer;

    buttons.forEach((b, n) => {
      b.disabled = true;
      if (n === c.answer) {
        b.classList.add("right");
        b.appendChild(el("span", "mark", "correct"));
      } else if (n === choice) {
        b.classList.add("wrong");
        b.appendChild(el("span", "mark", "chosen"));
      }
    });

    const verdict = $("checkpoint-verdict");
    verdict.className = "verdict " + (right ? "right" : "wrong");
    $("verdict-title").textContent = right ? "That is it" : "Not quite";
    $("verdict-explanation").textContent = c.explanation || "";
    $("verdict-explanation").hidden = !c.explanation;

    // Every answer cites the chapter — this is what makes the grounding claim checkable.
    const cite = $("verdict-cite");
    cite.textContent = "";
    cite.appendChild(document.createTextNode("From the chapter: "));
    (c.source || []).forEach((id, n) => {
      if (n) cite.appendChild(document.createTextNode(" "));
      cite.appendChild(el("code", null, id));
    });
    verdict.hidden = false;

    // The gate has been passed, so unlock here rather than waiting for Continue — otherwise the rail
    // says the next segment is still locked while a Continue button sits right beside it.
    clear(i);
    if (i + 1 < segments.length && i + 1 > state.unlocked) state.unlocked = i + 1;
    persist();
    renderHead();
    renderRail();

    const cont = $("continue-btn");
    cont.textContent =
      i + 1 < segments.length ? "Continue to the next segment" : "Finish the lesson";
    cont.hidden = false;
    cont.focus();
  }

  function showDone() {
    const withCp = segments.filter((s) => s.checkpoint);
    const right = withCp.filter((s) => state.answers[s.id] === s.checkpoint.answer).length;
    $("done-score").textContent = withCp.length
      ? `${right} of ${withCp.length} checkpoints answered correctly on the first try.`
      : "Every segment watched.";
    show(doneCard);
    renderHead();
    renderRail();
    $("done-title").setAttribute("tabindex", "-1");
    $("done-title").focus();
  }

  // ── glossary ───────────────────────────────────────────────────────────────────────────────────

  function renderGlossary() {
    const terms = Array.isArray(manifest.glossary) ? manifest.glossary : [];
    if (!terms.length) return;
    const list = $("terms");
    terms.forEach((t, i) => {
      const li = el("li");
      const b = el("button");
      b.type = "button";
      b.id = "term-" + i;
      b.setAttribute("aria-expanded", "false");
      b.setAttribute("aria-controls", "def-" + i);
      b.appendChild(el("span", "chev", "▸"));
      b.appendChild(el("span", null, t.term));

      const def = el("div", "def");
      def.id = "def-" + i;
      def.hidden = true;
      def.appendChild(el("p", null, t.definition || ""));
      const cite = el("p", "cite");
      cite.appendChild(document.createTextNode("From the chapter: "));
      (t.source || []).forEach((id, n) => {
        if (n) cite.appendChild(document.createTextNode(" "));
        cite.appendChild(el("code", null, id));
      });
      def.appendChild(cite);

      b.addEventListener("click", () => {
        const open = b.getAttribute("aria-expanded") === "true";
        b.setAttribute("aria-expanded", String(!open));
        def.hidden = open;
      });

      li.appendChild(b);
      li.appendChild(def);
      list.appendChild(li);
    });
    $("glossary-pane").hidden = false;
  }

  // ── wiring ─────────────────────────────────────────────────────────────────────────────────────

  video.addEventListener("timeupdate", paintCue);
  video.addEventListener("seeked", paintCue);
  video.addEventListener("ended", onEnded);

  $("start-btn").addEventListener("click", () => openSegment(Math.min(state.unlocked, segments.length - 1), true));

  $("replay-btn").addEventListener("click", () => {
    video.currentTime = 0;
    const p = video.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  });

  $("cap-btn").addEventListener("click", () => {
    state.captions = !state.captions;
    persist();
    applyCaptionState();
    paintCue();
  });

  const rateSelect = $("rate-select");
  rateSelect.value = String(state.rate);
  rateSelect.addEventListener("change", () => {
    state.rate = parseFloat(rateSelect.value);
    video.playbackRate = state.rate;
    persist();
  });

  $("continue-btn").addEventListener("click", advance);

  $("restart-btn").addEventListener("click", () => {
    state.unlocked = 0;
    state.cleared = [];
    state.answers = {};
    persist();
    index = 0;
    renderHead();
    renderRail();
    show(startCard);
    $("start-btn").focus();
  });

  // Keyboard, but never when a control already owns the key.
  document.addEventListener("keydown", (e) => {
    if (playerPane.hidden) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest("button, select, input, textarea, a[href], [contenteditable]")) return;

    const k = e.key.toLowerCase();
    if (k === " " || k === "k") {
      e.preventDefault();
      if (video.paused) video.play().catch(() => {});
      else video.pause();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      video.currentTime = Math.min(video.currentTime + 5, video.duration || Infinity);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      video.currentTime = Math.max(video.currentTime - 5, 0);
    } else if (k === "c") {
      $("cap-btn").click();
    } else if (k === "r") {
      $("replay-btn").click();
    }
  });

  // Keep the caption rail clear of the native control bar while it is showing.
  for (const [ev, on] of [["mouseenter", true], ["mouseleave", false], ["focusin", true]]) {
    frame.addEventListener(ev, () => frame.classList.toggle("controls-visible", on));
  }

  // ── first paint ────────────────────────────────────────────────────────────────────────────────

  const total = segments.reduce((a, s) => a + s.duration, 0);
  const span = total < 90 ? `${Math.round(total)} seconds` : `${Math.round(total / 60)} minutes`;
  const count = segments.length === 1 ? "1 segment" : `${segments.length} segments`;
  const gated = segments.filter((s) => s.checkpoint).length;

  const resuming = state.cleared.length > 0 && state.unlocked > 0;
  $("start-blurb").textContent = resuming
    ? `You are part way through. Picking up at segment ${String(state.unlocked + 1).padStart(2, "0")}.`
    : `${count}, about ${span}` + (gated ? ", with a checkpoint between each." : ".");
  $("start-btn").textContent = resuming ? "Resume the lesson" : "Start the lesson";

  const list = $("start-list");
  segments.forEach((s) => list.appendChild(el("li", null, s.title)));

  $("foot-note").textContent =
    "Every line in this lesson traces to a block id in the source chapter. Each checkpoint cites the paragraphs its answer comes from.";

  applyCaptionState();
  renderHead();
  renderRail();
  renderGlossary();
  show(startCard);
})();
