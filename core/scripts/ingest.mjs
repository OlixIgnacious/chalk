#!/usr/bin/env node
// ingest.mjs — normalize a chapter into chapter.json: paragraph-addressed blocks with stable ids.
//
//   node ingest.mjs <input> [--out chapter.json] [--chapter N|title] [--assets work/] [--list]
//
// .md and .txt are a single chapter each. EPUB splits on the spine and nav/ncx; PDF splits on
// detected chapter headings, because poppler exposes no bookmark listing. --list prints the splits
// and stops, which is what to do when a whole book arrives with no chapter named.
//
// Those block ids are the grounding currency for the whole pipeline: every narration line and every
// piece of on-screen text cites them. They must be stable across re-runs of the same input.
//
// Supported: .md, .txt, .epub, .pdf (text layer or OCR). See references/step-1-ingest.md.

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { basename, extname, dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const die = (m) => {
  console.error("ingest:", m);
  process.exit(2);
};

const FLAGS = ["out", "chapter", "assets"];
const flag = (n, d) => {
  const i = argv.indexOf("--" + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) die(`--${n} needs a value`);
  return v;
};
// Positional args only. Matching on "the token before this one is not a flag" instead breaks on a
// repeated string, because indexOf finds the first occurrence rather than this one.
const flagValueIndexes = new Set(
  FLAGS.map((n) => argv.indexOf("--" + n))
    .filter((i) => i >= 0)
    .map((i) => i + 1),
);
const positional = argv.filter((a, i) => !a.startsWith("--") && !flagValueIndexes.has(i));

const input = positional[0];
if (!input) die("usage: ingest.mjs <input> [--out chapter.json]");

const outFile = flag("out", "chapter.json");
const chapterWanted = flag("chapter", null);
const assetsDir = flag("assets", join(dirname(outFile), "work"));
const listOnly = argv.includes("--list");
const ext = extname(input).toLowerCase();

if (!existsSync(input)) die(`cannot read ${input} — no such file`);

/** Run a tool, returning stdout. `null` when the tool is missing or fails. */
function tool(bin, args, opts = {}) {
  try {
    return execFileSync(bin, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
  } catch {
    return null;
  }
}
const haveTool = (bin, args = ["-v"]) =>
  spawnSync(bin, args, { stdio: "ignore" }).error === undefined;

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch (err) {
    die(`cannot read ${p} — ${err.message}`);
  }
};

/** Pad a counter into a stable id, e.g. p012. */
const id = (prefix, n) => `${prefix}${String(n).padStart(3, "0")}`;

const PREFIX = { heading: "h", equation: "e", figure: "f", exercise: "x", footnote: "n", code: "c" };

/**
 * Ids are assigned in one place, over blocks in reading order, from one counter. Every format goes
 * through here so that "p012" means the same thing whatever the input was, and so that re-running
 * the same input cannot renumber anything.
 */
function assignIds(raw) {
  let n = 0;
  return raw.map((b) => ({ id: id(PREFIX[b.kind] ?? "p", ++n), ...b }));
}

/**
 * Markdown / plain text. Blocks split on blank lines; headings, quotes and lists detected by prefix.
 * Deliberately simple — this is the path everything else is tested against.
 */
// A whole block that is nothing but $$...$$ or \\[...\\]. Unlike a PDF's notation, this came through
// verbatim from the source, so the LaTeX is known-good and goes on the block for step 3 to use.
// Inline maths inside a sentence is left alone — that is prose that mentions a symbol.
const DISPLAY_MATH = /^(?:\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\])$/;

/**
 * Split text into fenced code and the prose around it. Code is cut out first because it may hold
 * blank lines, and splitting on those would shred a function into several "paragraphs". Its text is
 * kept verbatim: indentation is meaning in Python, and a notebook reproduces it as written.
 */
function splitFences(text) {
  const parts = [];
  let prose = [];
  let fence = null;
  const flush = () => {
    if (prose.length) parts.push({ prose: prose.join("\n") });
    prose = [];
  };
  for (const line of text.split("\n")) {
    if (!fence) {
      const open = line.match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)/);
      if (open) {
        flush();
        fence = { mark: open[1], lang: open[2].toLowerCase() || null, lines: [] };
      } else prose.push(line);
      continue;
    }
    const close = line.trim();
    if (close.startsWith(fence.mark) && close.replace(/[`~]/g, "") === "") {
      parts.push({ code: fence.lines.join("\n"), lang: fence.lang });
      fence = null;
    } else fence.lines.push(line);
  }
  // An unclosed fence is still code: dropping it silently would lose text.
  if (fence) parts.push({ code: fence.lines.join("\n"), lang: fence.lang });
  flush();
  return parts;
}

function ingestMarkdown(text) {
  const blocks = [];
  for (const part of splitFences(text)) {
    if (part.code !== undefined) {
      // Trailing blank lines are noise; leading indentation on the first line is not.
      const text = part.code.replace(/^\n+/, "").replace(/\s+$/, "");
      if (text.trim()) blocks.push({ kind: "code", lang: part.lang, text });
      continue;
    }
    ingestProse(part.prose, blocks);
  }
  return { blocks: assignIds(blocks), quality: "clean" };
}

function ingestProse(text, blocks) {
  for (const raw of text.split(/\n\s*\n/)) {
    const t = raw.trim();
    if (!t) continue;

    const math = t.match(DISPLAY_MATH);
    if (math) {
      blocks.push({
        kind: "equation",
        text: t,
        latex: (math[1] ?? math[2]).trim(),
      });
      continue;
    }

    let kind = "para";
    if (/^(exercise|problem|question)s?\b/i.test(t) && t.length < 400) kind = "exercise";
    else if (/^#{1,6}\s/.test(t)) kind = "heading";
    else if (/^>/.test(t)) kind = "quote";
    else if (/^([-*+]|\d+\.)\s/m.test(t)) kind = "list";
    blocks.push({ kind, text: t.replace(/^#{1,6}\s*/, "").replace(/^>\s?/gm, "") });
  }
}

// ── HTML, shared by EPUB and anything else tag-shaped ──────────────────────────────────────────────

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–",
  hellip: "…", lsquo: "\u2018", rsquo: "\u2019", ldquo: "\u201c", rdquo: "\u201d",
};
const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);

const strip = (html) => decode(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

/**
 * XHTML → blocks. A real DOM parser would be a dependency for one job; this walks the block-level
 * tags in document order, which is all the schema needs. Anything it cannot classify becomes a
 * paragraph rather than being dropped — losing text silently is the one thing it must not do.
 */
function htmlToBlocks(html) {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const cleaned = body
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const blocks = [];
  const re =
    /<(h[1-6]|p|blockquote|ul|ol|figure|aside|div|pre|table)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    const [, tag, attrs, inner] = m;
    const t = tag.toLowerCase();

    // A div is only a block if it holds no block of its own; otherwise let the inner ones match.
    if ((t === "div" || t === "table") && /<(p|h[1-6]|blockquote|ul|ol|figure)\b/i.test(inner)) continue;

    if (/epub:type="[^"]*(footnote|rearnote)/i.test(attrs) || /role="doc-(foot|end)note"/i.test(attrs)) {
      const text = strip(inner);
      if (text) blocks.push({ kind: "footnote", text });
      continue;
    }
    if (t === "figure") {
      const src = inner.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? null;
      const caption = strip(inner.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] ?? "");
      blocks.push({ kind: "figure", text: caption, caption, asset: src });
      continue;
    }
    if (t === "aside") continue;
    if (/^h[1-6]$/.test(t)) {
      const text = strip(inner);
      if (text) blocks.push({ kind: "heading", text });
      continue;
    }
    if (t === "blockquote") {
      const text = strip(inner);
      if (text) blocks.push({ kind: "quote", text });
      continue;
    }
    if (t === "ul" || t === "ol") {
      const items = [...inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((i) => strip(i[1]));
      const text = items.filter(Boolean).join("\n");
      if (text) blocks.push({ kind: "list", text });
      continue;
    }
    if (t === "pre") {
      // Whitespace is kept: strip() would flatten the indentation Python depends on.
      const text = decode(inner.replace(/<[^>]*>/g, "")).replace(/^\n+|\s+$/g, "");
      const lang = (attrs + " " + inner).match(/language-([\w+#-]+)/i)?.[1]?.toLowerCase() ?? null;
      if (text.trim()) blocks.push({ kind: "code", lang, text });
      continue;
    }
    const text = strip(inner);
    if (text) blocks.push({ kind: "para", text });
  }
  return blocks;
}

// ── EPUB ───────────────────────────────────────────────────────────────────────────────────────────

/** Read one member of the zip without unpacking the whole book. */
const unzipOne = (epub, member) =>
  tool("unzip", ["-p", epub, member], { encoding: "utf8" });

const resolveHref = (fromDir, href) =>
  join(fromDir, decodeURIComponent(href.split("#")[0])).replace(/^\.\//, "");

function ingestEpub(file) {
  if (!haveTool("unzip", ["-v"])) die("EPUB needs `unzip`, which is not on PATH.");

  const listing = tool("unzip", ["-Z1", file]);
  if (listing === null) {
    die(`${basename(file)} will not open as a zip — if it is DRM'd, that is the end of the road.`);
  }
  const names = listing.split("\n").filter(Boolean);
  // DRM is a stop, not a puzzle to solve.
  if (names.some((n) => /^META-INF\/(encryption|rights)\.xml$/i.test(n))) {
    die(
      `${basename(file)} is DRM-protected (META-INF/encryption.xml). chalk will not try to get ` +
        `around that.\n  Use a DRM-free copy, or export the chapter to Markdown yourself.`,
    );
  }

  const container = unzipOne(file, "META-INF/container.xml");
  const opfPath = container?.match(/full-path="([^"]+)"/i)?.[1];
  if (!opfPath) die("EPUB has no META-INF/container.xml rootfile — it is not a readable EPUB.");
  const opfDir = dirname(opfPath) === "." ? "" : dirname(opfPath);
  const opf = unzipOne(file, opfPath);
  if (!opf) die(`EPUB is missing its package document (${opfPath}).`);

  const bookTitle = strip(opf.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i)?.[1] ?? "");
  const lang = strip(opf.match(/<dc:language[^>]*>([\s\S]*?)<\/dc:language>/i)?.[1] ?? "en") || "en";

  const manifest = new Map();
  for (const m of opf.matchAll(/<item\b([^>]*)\/?>/gi)) {
    const attrs = m[1];
    const itemId = attrs.match(/\bid="([^"]+)"/i)?.[1];
    const href = attrs.match(/\bhref="([^"]+)"/i)?.[1];
    if (itemId && href) manifest.set(itemId, { href, props: attrs.match(/properties="([^"]*)"/i)?.[1] ?? "" });
  }
  const spine = [...opf.matchAll(/<itemref\b([^>]*)\/?>/gi)]
    .map((m) => m[1].match(/idref="([^"]+)"/i)?.[1])
    .filter((ref) => ref && manifest.has(ref))
    .map((ref) => ({ ref, href: manifest.get(ref).href }));
  if (!spine.length) die("EPUB spine is empty — nothing to read.");

  // Titles come from the nav or the ncx when there is one; a spine item's own <h1> otherwise.
  const titles = new Map();
  const navItem = [...manifest.values()].find((i) => /\bnav\b/.test(i.props));
  if (navItem) {
    const nav = unzipOne(file, resolveHref(opfDir, navItem.href));
    for (const a of nav?.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi) ?? []) {
      titles.set(decodeURIComponent(a[1].split("#")[0]), strip(a[2]));
    }
  } else {
    const ncxHref = [...manifest.values()].find((i) => /\.ncx$/i.test(i.href))?.href;
    const ncx = ncxHref ? unzipOne(file, resolveHref(opfDir, ncxHref)) : null;
    for (const np of ncx?.matchAll(/<navPoint[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?src="([^"]+)"/gi) ?? []) {
      titles.set(decodeURIComponent(np[2].split("#")[0]), strip(np[1]));
    }
  }

  const chapters = spine.map((item, i) => ({
    n: i + 1,
    href: item.href,
    title: titles.get(item.href) || titles.get(basename(item.href)) || `Spine item ${i + 1}`,
  }));

  return {
    bookTitle,
    lang,
    chapters,
    load: (chapter) => {
      const xhtml = unzipOne(file, resolveHref(opfDir, chapter.href));
      if (!xhtml) die(`EPUB is missing ${chapter.href}.`);
      return htmlToBlocks(xhtml);
    },
  };
}

// ── PDF ────────────────────────────────────────────────────────────────────────────────────────────

/** A line that repeats at the same place on many pages is furniture, not prose. */
function stripFurniture(pages) {
  const seen = new Map();
  for (const page of pages) {
    const lines = page.split("\n").map((l) => l.trim());
    for (const l of [lines[0], lines[lines.length - 1]].filter(Boolean)) {
      seen.set(l, (seen.get(l) ?? 0) + 1);
    }
  }
  const furniture = new Set(
    [...seen].filter(([l, n]) => n >= Math.max(3, pages.length * 0.5) && l.length < 90).map(([l]) => l),
  );
  return pages.map((page) =>
    page
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        if (furniture.has(t)) return false;
        if (/^[ivxlcdm]{1,7}$/i.test(t)) return false; // roman page number
        if (/^\d{1,4}$/.test(t)) return false; // arabic page number
        return true;
      })
      .join("\n"),
  );
}

/** Side-by-side columns leave wide gaps inside lines; -layout preserves them, so they are findable. */
const looksMultiColumn = (text) => {
  const lines = text.split("\n").filter((l) => l.trim().length > 40);
  if (lines.length < 20) return false;
  const gapped = lines.filter((l) => /\S {4,}\S/.test(l)).length;
  return gapped / lines.length > 0.3;
};

// Detecting notation matters more than detecting it precisely: a missed equation flows on as
// ordinary prose and gets retyped into a slide, which is the worst failure this tool can produce.
// So these lean towards catching too much — a false positive costs a human glance, a false negative
// costs a wrong formula in a stats lesson.
const MATH_SYMBOL = /[∫∑∏√≈≠≤≥±∞∂∇∆×÷·⋅→←↔⇒⇔αβγδθλμνρσφψωΓΘΛΣΦΨΩ]/;
// U+00B2/B3/B9 are the Latin-1 superscripts ² ³ ¹ and sit outside the U+2070 superscript block —
// missing them is exactly how "x² + 3x − 5" slipped through as prose.
const SUPER_SUB = /[\u00B2\u00B3\u00B9\u2070-\u209F]/;
const RELATION = /[=≈≠≤≥]|(?<![<])<(?![<])|(?<![>])>(?![>])/;

const looksLikeEquation = (t) => {
  if (t.length > 240) return false;
  if (MATH_SYMBOL.test(t)) return true;
  // Real words are what separates "x = 5" from "Let x be the starting value of the run".
  const proseWords = (t.match(/\b[A-Za-z]{3,}\b/g) ?? []).length;
  if (RELATION.test(t) && proseWords <= 2) return true;
  if (SUPER_SUB.test(t) && (RELATION.test(t) || proseWords <= 4)) return true;
  if (/[\^_]\{?\w/.test(t) && RELATION.test(t)) return true;
  return false;
};

function pdfPages(file, first, last) {
  const args = ["-layout"];
  if (first) args.push("-f", String(first));
  if (last) args.push("-l", String(last));
  const text = tool("pdftotext", [...args, file, "-"]);
  return text === null ? null : text.split("\f");
}

function ingestPdf(file) {
  if (!haveTool("pdftotext", ["-v"])) {
    die("PDF needs `pdftotext` (poppler): brew install poppler");
  }
  const info = tool("pdfinfo", [file]) ?? "";
  const pageCount = Number(info.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
  const bookTitle = info.match(/^Title:\s+(.+)$/m)?.[1]?.trim() ?? "";

  let pages = pdfPages(file);
  if (pages === null) die(`pdftotext could not read ${basename(file)} — is it a PDF?`);

  // A scanned book has a page count but almost no characters. OCR is the only way in.
  const chars = pages.join("").replace(/\s/g, "").length;
  let quality = "clean";
  if (pageCount && chars / pageCount < 100) {
    if (!haveTool("tesseract", ["--version"]) || !haveTool("pdftoppm", ["-v"])) {
      die(
        `${basename(file)} has no text layer (${Math.round(chars / pageCount)} chars/page) and OCR ` +
          `is unavailable.\n  brew install tesseract poppler, then re-run.`,
      );
    }
    console.warn(
      `ingest: no text layer (${Math.round(chars / pageCount)} chars/page) — running OCR, which is slow.`,
    );
    pages = ocrPdf(file, pageCount);
    quality = "ocr";
  }

  pages = stripFurniture(pages);
  const joined = pages.join("\n");
  if (quality === "clean" && looksMultiColumn(joined)) {
    console.warn(
      "ingest: this looks multi-column — pdftotext -layout interleaves columns into nonsense.\n" +
        "  Marked needs-review: read chapter.json before step 2, and re-extract per column if it is wrong.",
    );
    quality = "needs-review";
  }

  // Headings are the only chapter split poppler gives us — it exposes no bookmark listing.
  const chapters = [];
  pages.forEach((page, pageIndex) => {
    for (const line of page.split("\n")) {
      const t = line.trim();
      if (/^(chapter|lecture|part|section)\s+([0-9]+|[ivxlcdm]+)\b/i.test(t) && t.length < 90) {
        chapters.push({ n: chapters.length + 1, title: t, page: pageIndex + 1 });
      }
    }
  });

  return {
    bookTitle,
    lang: "en",
    quality,
    pageCount,
    chapters: chapters.length ? chapters : [{ n: 1, title: bookTitle || basename(file), page: 1 }],
    load: (chapter, next) => {
      const from = (chapter.page ?? 1) - 1;
      const to = next ? next.page - 1 : pages.length;
      return pdfTextToBlocks(pages.slice(from, to), from + 1, file);
    },
  };
}

function ocrPdf(file, pageCount) {
  const dir = mkdtempSync(join(tmpdir(), "chalk-ocr-"));
  try {
    execFileSync("pdftoppm", ["-r", "300", "-png", file, join(dir, "page")], { stdio: "ignore" });
    const images = readdirSync(dir).filter((f) => f.endsWith(".png")).sort();
    if (!images.length) die("OCR produced no page images.");
    return images.map((img, i) => {
      if (i % 5 === 0) console.warn(`ingest: OCR page ${i + 1}/${images.length}…`);
      return tool("tesseract", [join(dir, img), "stdout"], { stdio: ["ignore", "pipe", "ignore"] }) ?? "";
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Extracted page text → blocks, rejoining lines that a PDF broke mid-sentence. */
function pdfTextToBlocks(pages, firstPage, file) {
  const blocks = [];
  const pageImages = new Map();
  const pageImage = (pageNo) => {
    if (pageImages.has(pageNo)) return pageImages.get(pageNo);
    let asset = null;
    if (haveTool("pdftoppm", ["-v"])) {
      try {
        mkdirSync(assetsDir, { recursive: true });
        const stem = join(assetsDir, `page-${String(pageNo).padStart(3, "0")}`);
        execFileSync("pdftoppm", ["-r", "150", "-png", "-f", String(pageNo), "-l", String(pageNo), file, stem], { stdio: "ignore" });
        const hit = readdirSync(assetsDir).find((f) => f.startsWith(basename(stem)) && f.endsWith(".png"));
        if (hit) asset = join(assetsDir, hit);
      } catch {
        asset = null;
      }
    }
    pageImages.set(pageNo, asset);
    return asset;
  };
  pages.forEach((page, i) => {
    const pageNo = firstPage + i;
    for (const raw of page.split(/\n\s*\n/)) {
      const t = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/(\w)-\s+(\w)/g, "$1$2") // hyphen broken across a line
        .replace(/\s+/g, " ")
        .trim();
      if (!t) continue;

      if (looksLikeEquation(t)) {
        // Never retype notation the extractor may have mangled. Keep what it read, say it is not
        // trustworthy, and hand over the rendered page so the source can be shown instead.
        blocks.push({
          kind: "equation", text: t, latex: null, confidence: "low",
          page: pageNo, asset: pageImage(pageNo),
        });
        continue;
      }
      let kind = "para";
      if (/^(chapter|lecture|part|section)\s+([0-9]+|[ivxlcdm]+)\b/i.test(t) && t.length < 90) kind = "heading";
      else if (/^(exercise|problem|question)s?\b/i.test(t) && t.length < 400) kind = "exercise";
      else if (/^\[?\d{1,3}[.)\]]\s/.test(t) && t.length < 400) kind = "footnote";
      blocks.push({ kind, text: t, page: pageNo });
    }
  });
  return blocks;
}

/** Pick the chapter the user asked for, or show the splits and stop. */
function pickChapter(chapters, wanted, what) {
  if (chapters.length === 1) return chapters[0];
  if (wanted === null) {
    const lines = chapters.map((c) => `  ${String(c.n).padStart(3)}  ${c.title}`).join("\n");
    die(
      `${what} holds ${chapters.length} chapters and none was named.\n${lines}\n` +
        `  Re-run with --chapter <number or title>.`,
    );
  }
  if (/^\d+$/.test(wanted)) {
    const hit = chapters.find((c) => c.n === Number(wanted));
    if (!hit) die(`no chapter ${wanted} — there are ${chapters.length}.`);
    return hit;
  }
  const needle = wanted.toLowerCase();
  const matches = chapters.filter((c) => c.title.toLowerCase().includes(needle));
  if (!matches.length) die(`no chapter title contains "${wanted}".`);
  if (matches.length > 1) {
    die(
      `"${wanted}" matches ${matches.length} chapters:\n` +
        matches.map((c) => `  ${c.n}  ${c.title}`).join("\n"),
    );
  }
  return matches[0];
}

let blocks;
let quality = "clean";
let lang = "en";
let sourceRef = basename(input);
let title = null;

switch (ext) {
  case ".md":
  case ".markdown":
  case ".txt": {
    const r = ingestMarkdown(read(input));
    blocks = r.blocks;
    quality = r.quality;
    if (chapterWanted) {
      console.warn("ingest: --chapter is ignored for .md and .txt — one file is one chapter.");
    }
    break;
  }
  case ".epub": {
    const book = ingestEpub(input);
    if (listOnly) {
      console.log(book.chapters.map((c) => `${String(c.n).padStart(3)}  ${c.title}`).join("\n"));
      process.exit(0);
    }
    const chosen = pickChapter(book.chapters, chapterWanted, basename(input));
    blocks = assignIds(book.load(chosen));
    lang = book.lang;
    title = book.chapters.length > 1 ? chosen.title : book.bookTitle || chosen.title;
    sourceRef = `${basename(input)}#${chosen.href}`;
    break;
  }
  case ".pdf": {
    const book = ingestPdf(input);
    if (listOnly) {
      console.log(book.chapters.map((c) => `${String(c.n).padStart(3)}  p${c.page}  ${c.title}`).join("\n"));
      process.exit(0);
    }
    const chosen = pickChapter(book.chapters, chapterWanted, basename(input));
    const next = book.chapters[book.chapters.indexOf(chosen) + 1];
    blocks = assignIds(book.load(chosen, next));
    quality = book.quality;
    title = book.chapters.length > 1 ? chosen.title : book.bookTitle || basename(input, ext);
    sourceRef = `${basename(input)}#p${chosen.page}`;
    break;
  }
  default:
    die(`unrecognized extension "${ext}" — chalk reads .md, .txt, .epub and .pdf`);
}

if (!blocks.length) die("no blocks extracted — is the input empty?");

// Anything the extractor was unsure of drags the whole chapter down to needs-review: one silently
// mangled equation is worse than a slow read-through.
const shaky = blocks.filter((b) => b.confidence === "low").length;
if (shaky && quality === "clean") quality = "needs-review";

const chapter = {
  title: title || blocks.find((b) => b.kind === "heading")?.text || basename(input, ext),
  source: sourceRef,
  lang,
  quality,
  has_code: blocks.some((b) => b.kind === "code"),
  blocks,
};

try {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(chapter, null, 2) + "\n");
} catch (err) {
  die(`cannot write ${outFile} — ${err.message}`);
}

const words = blocks.reduce((a, b) => a + (b.text ?? "").split(/\s+/).filter(Boolean).length, 0);
console.log(`ingest: ${blocks.length} blocks, ~${words} words, quality=${quality} → ${outFile}`);
if (shaky) {
  console.warn(
    `ingest: ${shaky} block(s) hold notation the extractor could not read cleanly, marked ` +
      `confidence=low.\n  Show the source crop or ask for the LaTeX. Do not retype them — ` +
      "see references/fidelity.md.",
  );
}
if (quality !== "clean") {
  console.warn(`ingest: quality=${quality} — read chapter.json before planning anything.`);
}
if (chapter.has_code) {
  const n = blocks.filter((b) => b.kind === "code").length;
  console.log(`ingest: ${n} code block(s) — a hands-on notebook is possible.`);
}
if (words > 10000) console.warn("ingest: over 10k words — this is a course, not one lesson. Split it.");
if (words < 400) console.warn("ingest: under 400 words — one segment. Do not pad.");
