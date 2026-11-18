// kit.mjs — the pure parts of the YouTube upload kit: chapters, merged captions, description.
//
// Kept separate from deliver.mjs so they can be tested without ffmpeg. Nothing here touches the
// disk or invents a fact: every string comes from the manifest and the probed durations.

/** 65 -> "1:05", 3725 -> "1:02:05". YouTube accepts m:ss and h:mm:ss. */
export function stamp(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * Chapters from segments and their probed durations, in seconds.
 *
 * Offsets are the sum of the durations that came before, which is exact because the segments are
 * concatenated without re-timing. YouTube only treats a description as chapters when the first is
 * 0:00, there are at least three, and each runs at least ten seconds — so those are errors here
 * rather than something found out after upload.
 */
export function buildChapters(segments, durations, { min = 10, count = 3 } = {}) {
  const problems = [];
  let at = 0;
  const chapters = segments.map((s, i) => {
    const c = { at, title: s.title, duration: durations[i] };
    at += durations[i];
    return c;
  });
  if (chapters.length < count) {
    problems.push(`${chapters.length} chapter(s); YouTube needs at least ${count} to show chapters`);
  }
  for (const c of chapters) {
    if (c.duration < min) {
      problems.push(`chapter "${c.title}" is ${c.duration.toFixed(1)}s; YouTube needs at least ${min}s`);
    }
  }
  return { chapters, problems };
}

export const chaptersText = (chapters) => chapters.map((c) => `${stamp(c.at)} ${c.title}`).join("\n") + "\n";

// ── captions ──────────────────────────────────────────────────────────────────────────────────────

/** "00:01.500" or "01:02:03.250" -> seconds. */
function vttTime(s) {
  const parts = s.trim().split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) throw new Error(`bad timestamp "${s}"`);
  return parts.reduce((a, n) => a * 60 + n, 0);
}

export function parseVtt(text) {
  const cues = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    cues.push({
      start: vttTime(a),
      end: vttTime(b.trim().split(/\s+/)[0]),
      text: lines.slice(i + 1).join("\n"),
    });
  }
  return cues;
}

const srtTime = (t) => {
  const ms = Math.round(t * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

/**
 * Per-segment VTTs become one SRT. Each segment's cues are in that segment's own video time, so
 * they are shifted by where the segment starts in the stitched video. A cue that would run past the
 * end of its segment is clamped, and a cue that does not advance is an error: either would put a
 * caption over the wrong narration.
 */
export function mergeCaptions(vtts, offsets, durations) {
  const out = [];
  let last = -1;
  vtts.forEach((vtt, i) => {
    for (const c of parseVtt(vtt)) {
      const start = offsets[i] + c.start;
      const end = Math.min(offsets[i] + c.end, offsets[i] + durations[i]);
      if (!(end > start)) throw new Error(`segment ${i + 1}: a cue does not advance (${c.start}s → ${c.end}s)`);
      if (start < last) throw new Error(`segment ${i + 1}: cues overlap the previous segment at ${stamp(start)}`);
      last = start;
      out.push({ start, end, text: c.text });
    }
  });
  return out.map((c, n) => `${n + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n");
}

// ── description ───────────────────────────────────────────────────────────────────────────────────

/**
 * Built only from the manifest and the chapters, so it cannot add a claim the script did not make.
 * It says nothing about which examples are derived: that is a matter for the logs (plan.md), not for
 * anything a viewer reads or hears. Nor does it name the source: the viewer never saw the book, so the
 * description places the video in its series instead (`series`: { name, part, of, next }). The source
 * stays in plan.md. The timestamps heading avoids the word "chapters" for the same reason.
 */
/**
 * Where a published notebook lives: channel.json `notebooks: { repo: "owner/name", branch }` and video.json
 * `notebook.publish_as` (its path in that repo). Colab opens it straight from GitHub, so one file serves both.
 */
export function notebookLinks(channel, manifest) {
  const repo = channel?.notebooks?.repo;
  const path = manifest?.notebook?.publish_as;
  if (!repo || !path) return null;
  const branch = channel.notebooks.branch ?? "main";
  return {
    github: `https://github.com/${repo}/blob/${branch}/${path}`,
    colab: `https://colab.research.google.com/github/${repo}/blob/${branch}/${path}`,
  };
}

export function buildDescription({ title, thesis, chapters, notebook, series, links }) {
  const lines = [title, ""];
  if (thesis) lines.push(thesis, "");
  if (series?.name && series.part) {
    lines.push(`Part ${series.part}${series.of ? ` of ${series.of}` : ""} in the ${series.name} series.${series.next ? ` Next: ${series.next}.` : ""}`, "");
  }
  lines.push("In this video", chaptersText(chapters).trimEnd(), "");
  if (notebook && links) {
    lines.push("Run the code yourself, in your browser, nothing to install:", links.colab, "", "The notebook on GitHub:", links.github, "");
  } else if (notebook) lines.push("A hands-on Jupyter notebook accompanies this video.", "");
  return lines.join("\n");
}
