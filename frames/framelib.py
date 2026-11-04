"""framelib — Broadside (dark register) frame builder for chalk-youtube series videos.

Each frame is one bare <template> fragment: a #root carrying data-composition-id, a full-bleed ground on a
class="clip" layer, content above the 83% caption keep-out (y <= 900), and one paused GSAP timeline
registered at window.__timelines[frame_id]. Every reveal lands on a word's start time from the segment's
audio_meta.json (display words after apply-display), so reveals follow the voice.

Orientation is automatic: every frame carries the series chrome and the progress strip of this video's
stages (current one lit), and the first frame of a part carries its stage card (except the hook, which
opens on its example). Nothing here names the
source book: the chrome shows the series, the part and the stage.

Markers the evals read (evals/shared.mjs, formats/*/eval/criteria.mjs): data-role="stage-card" | "progress-strip" | "roadmap";
code panels carry data-code="<block id>", one data-codeline span per line, and end with <!--/code-->.
Code shown on screen is passed in verbatim from chapter.json; nothing here retypes it.
"""

import html
import json
import re
from pathlib import Path

W, H, KEEP_OUT = 1920, 1080, 900
PORTRAIT = False


def set_canvas(orientation):
    """Landscape (a YouTube video, a lesson) or portrait (a Short or Reel, 1080x1920). In portrait, content
    stays above y=1320: the burned-in captions sit just under it (1350-1550), and the bottom ~20% and the right
    edge are where Shorts and Reels draw their own title and buttons."""
    global W, H, KEEP_OUT, PORTRAIT
    PORTRAIT = orientation == "portrait"
    W, H, KEEP_OUT = (1080, 1920, 1320) if PORTRAIT else (1920, 1080, 900)
INK, INK_ALT, ORANGE, CREAM = "#111111", "#1A1A18", "#E85D26", "#F0ECE5"
MUTED, HINT, BORDER = "#888880", "#505048", "#282826"
LABEL_FLOOR = 28  # px: what a phone can read at 1080p (hyperframes check text_below_floor)

DISPLAY = "Barlow"   # the theme's display face; set_theme changes it
GRADIENT = None      # a theme's accent gradient for key words (text(..., gradient=True))
MARK_FILL = "rgba(232,93,38,0.18)"  # the accent at low alpha: the fill of a marked cell

# Broadside is the channel's own look. "apple" is a keynote look: black, near-white type, Apple's greys,
# a blue-to-purple accent and Inter (the closest open face to SF Pro, which only Apple's platforms may use).
# "midnight" is a newsroom look for tech and security news: deep navy, cool white type, an electric-cyan accent
# and a cyan-to-violet gradient. (ORANGE is the name of the accent slot in every theme, whatever its colour.)
THEMES = {
    "broadside": dict(INK="#111111", INK_ALT="#1A1A18", ORANGE="#E85D26", CREAM="#F0ECE5", MUTED="#888880", HINT="#505048",
                      BORDER="#282826", DISPLAY="Barlow", GRADIENT=None, MARK_FILL="rgba(232,93,38,0.18)"),
    "apple": dict(INK="#000000", INK_ALT="#1D1D1F", ORANGE="#2997FF", CREAM="#F5F5F7", MUTED="#86868B", HINT="#424245",
                  BORDER="#2D2D2F", DISPLAY="Inter", GRADIENT="linear-gradient(90deg, #2997FF 0%, #A970FF 55%, #FF6EB4 100%)",
                  MARK_FILL="rgba(41,151,255,0.18)"),
    "midnight": dict(INK="#0A1024", INK_ALT="#121B36", ORANGE="#22D3EE", CREAM="#EEF2FF", MUTED="#8B95B5", HINT="#4A5578",
                     BORDER="#1F2A4A", DISPLAY="Inter", GRADIENT="linear-gradient(90deg, #22D3EE 0%, #818CF8 55%, #C084FC 100%)",
                     MARK_FILL="rgba(34,211,238,0.18)"),
    # the yellow template (formats/youtube/templates/yellow/README.md): white and #FFD60A on near-black, Barlow
    "yellow": dict(INK="#0D0D0D", INK_ALT="#1D1D1D", ORANGE="#FFD60A", CREAM="#FFFFFF", MUTED="#8A8A8A", HINT="#3A3A3A",
                   BORDER="#2A2A2A", DISPLAY="Barlow", GRADIENT=None, MARK_FILL="rgba(255,214,10,0.18)"),
}


def set_theme(name):
    """Colours, display face and accent of every component drawn after this call."""
    g = globals()
    for k, v in THEMES[name or "broadside"].items():
        g[k] = v


FONTS = [("Barlow", w, f"barlow-latin-{w}-normal.woff2") for w in (400, 600, 700, 800, 900)] + [
    ("Inter", w, f"inter-latin-{w}-normal.woff2") for w in (400, 600, 700, 800, 900)] + [
    ("IBM Plex Mono", w, f"ibm-plex-mono-latin-{w}-normal.woff2") for w in (400, 500, 600)
]

# viewer-facing names of the arc stages (step-2-outline.md § The teaching arc)
STAGE_NAMES = {
    "hook": "Intro", "spot": "Spot it", "problem": "Problem", "think": "Think", "insight": "The idea", "plan": "Plan",
    "write": "Code", "trace": "Trace", "why-fast": "Why fast", "bug": "The bug", "other-ways": "Other ways",
    "interview": "Interview", "bonus": "Bonus", "practice": "Practice", "recap": "Recap",
}

esc = html.escape


def norm(s):
    return re.sub(r"[^a-z0-9.]", "", s.lower().replace("’", "'"))


def show_value(v):
    """A variable as Python would print it, so a learner copies what they see: an empty set is set(), never {}
    (which is an empty dict). JSON has no sets, so a trace script writes one as {"set": [...]}; it is shown as
    a set here, not as the list or dict it travelled as."""
    if isinstance(v, dict) and set(v) == {"set"}:
        v = set(v["set"])
    if isinstance(v, (set, frozenset)):
        return "{" + ", ".join(map(str, sorted(v))) + "}" if v else "set()"
    return repr(v) if isinstance(v, str) else str(v)


class Frame:
    """One storyboard frame. `cue(phrase)` returns the start of the phrase's first word in frame time.

    `video` is the per-video context gen.py builds: series/part labels, the ordered stage strip, this
    segment's stage and number, and the output dir (for chapter.json and example scripts).
    """

    def __init__(self, project, frame_no, frame_id, video):
        self.project = Path(project)
        self.id = frame_id
        self.no = frame_no
        self.video = video
        meta = json.loads((self.project / "audio_meta.json").read_text())
        voice = next(v for v in meta["voices"] if int(v.get("frame", v.get("id"))) == frame_no)
        self.words = voice["words"]
        self.duration = self._storyboard_duration(frame_no)
        self.html, self.css, self.tweens = [], [], []
        self._n = 0

    def _storyboard_duration(self, n):
        sb = (self.project / "STORYBOARD.md").read_text()
        block = re.split(r"(?m)^## Frame ", sb)[n]
        return float(re.search(r"- duration: ([\d.]+)s", block).group(1))

    # ── timing ────────────────────────────────────────────────────────────────────────────────
    def cue(self, phrase, offset=0.0, nth=1):
        # compare characters, not words: a lexicon phrase ("1, 2, 3, 1") is one caption word
        want = "".join(norm(p) for p in phrase.split())
        toks = [norm(w["text"]) for w in self.words]
        seen = 0
        for i in range(len(toks)):
            acc, k = "", i
            while k < len(toks) and len(acc) < len(want):
                acc += toks[k]
                k += 1
            if acc.startswith(want):
                seen += 1
                if seen == nth:
                    return max(0.0, round(self.words[i]["start"] + offset, 3))
        raise KeyError(f"{self.id}: phrase not in narration: {phrase!r} (have: {' '.join(w['text'] for w in self.words)})")

    def at(self, t):
        return t if isinstance(t, (int, float)) else self.cue(t)

    def uid(self, kind):
        self._n += 1
        return f"{self.id}-{kind}{self._n}"

    def block(self, bid):
        return chapter_block(self.video["out_dir"], bid)

    def example_output(self, rel):
        """stdout of a segment's example script (run once, cached) — numbers on screen come from here."""
        import subprocess
        import sys
        key = ("_ex", rel)
        if key not in self.video.setdefault("_cache", {}):
            path = self.project.parent / rel
            r = subprocess.run([sys.executable, "-I", str(path)], capture_output=True, text=True, check=True)
            self.video["_cache"][key] = r.stdout
        return self.video["_cache"][key]

    # ── motion ────────────────────────────────────────────────────────────────────────────────
    def rise(self, sel, t, dy=36, dur=0.6):
        self.tweens.append(f'tl.fromTo("{sel}", {{opacity: 0, y: {dy}}}, {{opacity: 1, y: 0, duration: {dur}, ease: "power3.out"}}, {self.at(t)});')

    def fade(self, sel, t, dur=0.5, to=1):
        self.tweens.append(f'tl.fromTo("{sel}", {{opacity: 0}}, {{opacity: {to}, duration: {dur}, ease: "power2.out"}}, {self.at(t)});')

    def pop(self, sel, t, dur=0.5):
        self.tweens.append(f'tl.fromTo("{sel}", {{opacity: 0, scale: 0.86}}, {{opacity: 1, scale: 1, duration: {dur}, ease: "back.out(1.6)"}}, {self.at(t)});')

    def wipe(self, sel, t, dur=0.6):
        self.tweens.append(f'tl.fromTo("{sel}", {{scaleX: 0, transformOrigin: "left center"}}, {{scaleX: 1, duration: {dur}, ease: "power3.inOut"}}, {self.at(t)});')

    def to(self, sel, t, props, dur=0.4):
        self.tweens.append(f'tl.to("{sel}", {{{props}, duration: {dur}, ease: "power2.out"}}, {self.at(t)});')

    def set(self, sel, t, props):
        self.tweens.append(f'tl.set("{sel}", {{{props}}}, {self.at(t)});')

    def draw(self, sel, t, dur=0.8):
        self.tweens.append(f'tl.fromTo("{sel}", {{strokeDashoffset: 1, opacity: 0}}, {{strokeDashoffset: 0, opacity: 1, duration: {dur}, ease: "power2.inOut"}}, {self.at(t)});')

    def dim(self, sel, t, to=0.32):
        self.to(sel, t, f"opacity: {to}", dur=0.4)

    def mark(self, sel, t, color=None, fill=None):
        color = color or ORANGE
        fill = fill or MARK_FILL
        self.to(sel, t, f'borderColor: "{color}", backgroundColor: "{fill}"', dur=0.3)

    # ── layout primitives ─────────────────────────────────────────────────────────────────────
    def add(self, markup, css=""):
        self.html.append(markup)
        if css:
            self.css.append(css)

    def box(self, inner, x, y, w=None, h=None, cls="", eid=None, style="", attrs=""):
        eid = eid or self.uid("b")
        dims = (f"width:{w}px;" if w else "") + (f"height:{h}px;" if h else "")
        self.add(f'<div id="{eid}" class="{cls}" {attrs} style="position:absolute;left:{x}px;top:{y}px;{dims}{style}">{inner}</div>')
        return f"#{eid}"

    def text(self, s, x, y, size=86, weight=700, color=None, font=None, w=None, align="left", tracking="-0.02em",
             lower=False, upper=False, lh=1.05, eid=None, raw=False, attrs="", gradient=False):
        color = color or CREAM
        font = font or DISPLAY
        # the theme's accent gradient painted through the letters (Apple's keynote look); flat accent without one
        paint = (f"background:{GRADIENT};-webkit-background-clip:text;background-clip:text;color:transparent;"
                 if gradient and GRADIENT else f"color:{ORANGE if gradient else color};")
        st = (f"font-family:'{font}';font-size:{size}px;font-weight:{weight};{paint}line-height:{lh};"
              f"letter-spacing:{tracking};text-align:{align};white-space:pre-wrap;"
              + ("text-transform:lowercase;" if lower else "") + ("text-transform:uppercase;" if upper else ""))
        return self.box(s if raw else esc(s), x, y, w=w, style=st, eid=eid, attrs=attrs)

    def label(self, s, x, y, color=None, size=LABEL_FLOOR, w=None, align="left", eid=None, attrs=""):
        color = color or ORANGE
        size = size if "data-layout-ignore" in attrs else max(size, LABEL_FLOOR)
        eid = eid or self.uid("lbl")
        self._labels = getattr(self, "_labels", set()) | {f"#{eid}"}
        return self.text(s, x, y, size=size, weight=500, color=color, font="IBM Plex Mono", tracking="0.12em",
                         upper=True, w=w, align=align, eid=eid, attrs=attrs)

    def headline(self, s, t, y=156, size=60, color=None, w=None):
        """The scene's question or subject, on screen from the words that say it."""
        color = color or CREAM
        sel = self.text(s, 104, y, size=size, weight=800, color=color, w=w or W - 208, lh=1.0, eid=f"{self.id}-hd{self._n}")
        self.rise(sel, t, dy=20)
        return sel

    def rule(self, x, y, w=36, h=2, color=None, eid=None):
        color = color or ORANGE
        return self.box("", x, y, w=w, h=h, style=f"background:{color};", eid=eid)

    # ── orientation (automatic) ───────────────────────────────────────────────────────────────
    def chrome(self):
        """Series and part top-left, this part's title top-right, hairline, then the progress strip."""
        v = self.video
        ign = "data-layout-ignore"
        if PORTRAIT:  # a Short has one part: the series and part only, no strip, nothing at the platform's edges
            # below the platform's own top bar (~ the top 200 px of a phone's Shorts / Reels screen)
            self.label(v["series_label"], 104, 230, size=30, w=W - 208, align="center", eid=f"{self.id}-kicker")
            self.box("", 104, 282, w=W - 208, h=1, style=f"background:{BORDER};", eid=f"{self.id}-hair")
            self.fade(f"#{self.id}-kicker, #{self.id}-hair", 0.0, dur=0.4)
            return
        self.label(v["series_label"], 104, 52, size=22, eid=f"{self.id}-kicker", attrs=ign)
        self.label(v["part_title"], 104, 52, size=22, color=MUTED, w=W - 208, align="right", eid=f"{self.id}-chap", attrs=ign)
        self.box("", 104, 92, w=W - 208, h=1, style=f"background:{BORDER};", eid=f"{self.id}-hair")
        self.fade(f"#{self.id}-kicker, #{self.id}-chap, #{self.id}-hair", 0.0, dur=0.4)
        self.progress_strip()

    def progress_strip(self):
        stages, cur = self.video["strip"], self.video["stage_index"]
        gap, x0, y = 10, 104, 104
        wseg = (W - 208 - gap * (len(stages) - 1)) / max(1, len(stages))
        cells = []
        for i, name in enumerate(stages):
            lit = i == cur
            done = i < cur
            col = ORANGE if lit else (MUTED if done else HINT)
            cells.append(
                f'<div style="position:absolute;left:{round(x0 + i * (wseg + gap) - x0)}px;top:0;width:{round(wseg)}px;">'
                f'<div style="height:3px;background:{col};"></div>'
                f'<div data-layout-ignore style="margin-top:6px;font-family:\'IBM Plex Mono\';font-size:16px;letter-spacing:0.1em;'
                f'text-transform:uppercase;color:{CREAM if lit else MUTED};white-space:nowrap;overflow:hidden;">{esc(name)}</div></div>'
            )
        self.add(f'<div id="{self.id}-strip" data-role="progress-strip" style="position:absolute;left:{x0}px;top:{y}px;width:{W - 208}px;height:34px;">{"".join(cells)}</div>')
        self.fade(f"#{self.id}-strip", 0.0, dur=0.4)

    def stage_card(self):
        """Part number and stage name over the start of a part's first frame, held for its reading time
        (hyperframes check line_unread: about 0.25 s a word). It sits outside the content layer, which
        fades in once the card has gone, so nothing is drawn under it. Returns the time the content starts."""
        v = self.video
        sid = f"{self.id}-stagecard"
        words = len(v["segment_title"].split()) + 3
        lift = round(max(1.25, 0.3 + 0.27 * words), 2)
        self.card_html = (
            f'<div id="{sid}" data-role="stage-card" style="position:absolute;inset:0;background:{INK};z-index:5;">'
            f'<div style="position:absolute;left:104px;top:330px;font-family:\'IBM Plex Mono\';font-size:30px;font-weight:500;'
            f'letter-spacing:0.12em;color:{ORANGE};">{v["part_no"]:02d} / {v["part_count"]:02d} · {esc(v["stage_name"].upper())}</div>'
            f'<div style="position:absolute;left:96px;top:380px;width:1700px;font-family:\'{DISPLAY}\';font-size:120px;font-weight:900;'
            f'letter-spacing:-0.04em;line-height:0.95;color:{CREAM};">{esc(broadside_case(v["segment_title"]))}</div>'
            f'<div style="position:absolute;left:104px;top:640px;width:120px;height:4px;background:{ORANGE};"></div></div>'
        )
        # the content starts once the card has gone: a crossfade puts two titles on top of each other
        self.tweens.append(f'tl.fromTo("#{sid}", {{opacity: 1}}, {{opacity: 0, duration: 0.3, ease: "power2.in"}}, {lift});')
        lift = round(lift + 0.3, 2)
        self.tweens.append(f'tl.fromTo("#{self.id}-stage", {{opacity: 0}}, {{opacity: 1, duration: 0.35, ease: "power2.out"}}, {lift});')
        return lift

    def roadmap(self, stages, t, x=104, y=420, eid=None):
        """This video's stages, left to right, landing in order from t."""
        rid = eid or f"{self.id}-roadmap"
        gap = 16
        wcell = (W - 208 - gap * (len(stages) - 1)) / len(stages)
        cells = "".join(
            f'<div id="{rid}-s{i}" style="position:absolute;left:{round(i * (wcell + gap))}px;top:0;width:{round(wcell)}px;height:150px;'
            f'border-top:4px solid {ORANGE if i == 0 else HINT};padding-top:18px;box-sizing:border-box;">'
            f'<div style="font-family:\'IBM Plex Mono\';font-size:{LABEL_FLOOR}px;color:{MUTED};">{i + 1:02d}</div>'
            f'<div style="font-family:\'{DISPLAY}\';font-size:40px;font-weight:800;color:{CREAM};line-height:1.05;margin-top:8px;">{esc(s)}</div></div>'
            for i, s in enumerate(stages)
        )
        self.add(f'<div id="{rid}" data-role="roadmap" style="position:absolute;left:{x}px;top:{y}px;width:{W - 208}px;height:150px;">{cells}</div>')
        t0 = self.at(t)
        for i in range(len(stages)):
            self.rise(f"#{rid}-s{i}", round(t0 + i * 0.22, 3), dy=20, dur=0.45)
        return rid

    # ── teaching components ───────────────────────────────────────────────────────────────────
    def code(self, src, x, y, w, size=30, title=None, lh=1.5, block_id=None, gutter=True, only=None, comments="inline"):
        """A verbatim code panel. Returns (panel, [highlight sels], [line sels], [tag slot sels]).

        only: 1-based line numbers to show, unchanged and keeping their own numbers (a portrait screen fits a
        function's body, not its commented signature). Selectors stay indexed by the block's line, so a step's
        lines mean the same thing either way; a line not shown has no selector.
        comments="above": a trailing comment (two or more spaces, then #) is drawn on its own row just above its
        code, at the code's indent, so a narrow portrait panel keeps code at the phone floor. Every character is
        kept; the line still carries its whole text in data-codeline for the eval's verbatim check (G2)."""
        pid = self.uid("code")
        all_lines = src.split("\n")
        keep = [i for i in range(len(all_lines)) if only is None or i + 1 in only]
        lines = [all_lines[i] for i in keep]
        split = {}
        if comments == "above":
            for i, ln in zip(keep, lines):
                m = re.match(r"^(\s*)(\S[^#'\"]*?)\s{2,}(#.*)$", ln)
                if m:
                    split[i] = (m.group(1) + m.group(3), m.group(1) + m.group(2))
        rendered = [r for i, ln in zip(keep, lines) for r in (split[i] if i in split else (ln,))]
        # IBM Plex Mono advances 0.6em per glyph. Keep code at the phone floor: widen the panel (up to the
        # content edge) before shrinking the type, and only then shrink to fit — recorded as a warning.
        longest = max(len(l) for l in rendered)
        pad = 92 + (56 if gutter else 0)
        size = min(size, int((w - pad) / (0.6 * longest)))
        if size < LABEL_FLOOR:
            room = W - 104 - x
            if gutter and 0.6 * LABEL_FLOOR * longest + pad > room:
                gutter, pad = False, 92  # the line numbers are the last thing to give up before the type shrinks
            w = min(room, int(0.6 * LABEL_FLOOR * longest + pad) + 2)
            size = min(LABEL_FLOOR, int((w - pad) / (0.6 * longest)))
            if size < LABEL_FLOOR:
                self.video.setdefault("warnings", []).append(f"{self.id}: {block_id or 'code'} set at {size}px, below the {LABEL_FLOOR}px floor")
        self._last_code_w = w
        self._last_code_h = round(len(rendered) * size * lh + 60 + (LABEL_FLOOR + 10 if title else 0))
        rows = []
        for i, ln in zip(keep, lines):
            num = f'<span class="{self.id}-num">{i + 1}</span>' if gutter else ""
            blank = f'<span class="{self.id}-num"></span>' if gutter else ""
            if i in split:
                note, body = split[i]
                rows.append(f'<div class="{self.id}-cl {self.id}-cm" id="{pid}-c{i}">{blank}<span class="{self.id}-ct">{esc(note)}</span></div>')
                rows.append(
                    f'<div class="{self.id}-cl" id="{pid}-l{i}"><span class="{self.id}-hl" id="{pid}-h{i}"></span>{num}'
                    f'<span class="{self.id}-ct" data-codeline="{esc(ln)}">{esc(body)}</span></div>'
                )
                continue
            rows.append(
                f'<div class="{self.id}-cl" id="{pid}-l{i}"><span class="{self.id}-hl" id="{pid}-h{i}"></span>{num}'
                f'<span class="{self.id}-ct" data-codeline>{esc(ln) if ln else "&#8203;"}</span></div>'
            )
        head = f'<div class="{self.id}-chead">{esc(title)}</div>' if title else ""
        data = f' data-code="{block_id}"' if block_id else ""
        self.add(
            f'<div id="{pid}" class="{self.id}-code"{data} style="left:{x}px;top:{y}px;width:{w}px;font-size:{size}px;">{head}{"".join(rows)}<!--/code--></div>',
            f"""
#{pid} {{ position:absolute; background:{INK_ALT}; border:1px solid {BORDER}; padding:30px 44px; box-sizing:border-box;
  font-family:'IBM Plex Mono'; font-weight:400; color:{CREAM}; line-height:{lh}; }}
.{self.id}-chead {{ font-size:{LABEL_FLOOR}px; letter-spacing:0.12em; text-transform:uppercase; color:{MUTED}; font-weight:500; margin:-4px 0 14px; }}
.{self.id}-cl {{ position:relative; white-space:pre; }}
.{self.id}-hl {{ position:absolute; left:-44px; right:-44px; top:0; bottom:0; background:{MARK_FILL};
  border-left:4px solid {ORANGE}; opacity:0; }}
.{self.id}-num {{ position:relative; display:inline-block; width:56px; color:{MUTED}; }}  /* HINT is under 3:1 on the panel */
.{self.id}-ct {{ position:relative; }}
.{self.id}-cm {{ color:{MUTED}; }}""",
        )
        hl = [f"#{pid}-h{i}" if i in keep else None for i in range(len(all_lines))]
        # a line moved under its own comment row: the line's selector takes both rows, so they show together
        ln = [(f"#{pid}-c{i}, #{pid}-l{i}" if i in split else f"#{pid}-l{i}") if i in keep else None for i in range(len(all_lines))]
        return f"#{pid}", hl, ln, size

    def highlight(self, hl_sels, t):
        t0 = self.at(t)
        for s in hl_sels:
            self.tweens.append(f'tl.to("{s}", {{opacity: 1, duration: 0.35, ease: "power2.out"}}, {t0});')

    def unhighlight(self, hl_sels, t):
        t0 = self.at(t)
        for s in hl_sels:
            self.tweens.append(f'tl.to("{s}", {{opacity: 0, duration: 0.3, ease: "power2.out"}}, {t0});')

    def code_show(self, block_id, x=104, y=170, w=1712, size=34, title=None, t=0.0, lh=1.5, only=None, comments="inline"):
        """A whole block, for reference (not for teaching how to write it — use code_build)."""
        p, hl, ln, _ = self.code(self.block(block_id), x, y, w, size=size, title=title, lh=lh, block_id=block_id, only=only,
                                 comments=comments)
        self.fade(p, t, dur=0.3)
        for i, s in enumerate(x for x in ln if x):
            self.tweens.append(f'tl.fromTo("{s}", {{opacity: 0, x: -14}}, {{opacity: 1, x: 0, duration: 0.3, ease: "power2.out"}}, {round(self.at(t) + i * 0.08, 3)});')
        return p, hl, ln

    def code_build(self, block_id, steps, x=104, y=170, w=1240, size=36, tags_x=None, lh=1.55, only=None, comments="inline"):
        """Write the code line by line. steps: [(lines (1-based list), cue, tag or None)].

        Lines appear on their cue, the newest lit, earlier ones settled; the tag (the plan step the lines
        serve) lands in the margin beside them. Lines not in any step never appear — check-readability
        --chapter already requires every line to be narrated.
        """
        p, hl, ln, fs = self.code(self.block(block_id), x, y, w, size=size, lh=lh, block_id=block_id, only=only, comments=comments)
        self.fade(p, steps[0][1], dur=0.3)
        line_h = fs * lh
        shown = [i for i, s in enumerate(ln) if s]
        w = self._last_code_w
        tags_x = tags_x if tags_x is not None else x + w + 36
        show_tags = W - 104 - tags_x >= 220  # no room beside a panel widened for readability: drop the tags
        prev = []
        for k, (lines, cue, tag) in enumerate(steps):
            t0 = self.at(cue)
            idx = [n - 1 for n in lines]
            for j, i in enumerate(idx):
                self.tweens.append(f'tl.fromTo("{ln[i]}", {{opacity: 0, x: -18}}, {{opacity: 1, x: 0, duration: 0.35, ease: "power2.out"}}, {round(t0 + j * 0.1, 3)});')
            if prev:
                self.unhighlight(prev, t0)
            self.highlight([hl[i] for i in idx], t0)
            prev = [hl[i] for i in idx]
            if tag and show_tags:
                ty = round(y + 30 + shown.index(idx[0]) * line_h + (line_h - 34) / 2)
                tid = f"{self.id}-tag{k}"
                self.label(tag, tags_x, ty, color=ORANGE, w=W - 104 - tags_x, eid=tid)
                self.fade(f"#{tid}", t0)
        for i in shown:
            if not any(i + 1 in s[0] for s in steps):
                self.set(ln[i], 0, "opacity: 0")
        return p, hl, ln

    def code_trace(self, block_id, trace_rel, steps, show_vars, x=104, y=170, w=1000, size=34,
                   fmt=None, result_cue=None, title=None, lh=1.5, only=None):
        """Run the code on screen: the executing line lit, variables updating. Steps come from a trace JSON.

        trace_rel: the segment's examples/<trace>.py (its stdout is {"result", "steps": [{line, locals}]}; a set
        local is written {"set": sorted(v)} so it is shown as a set — see show_value).
        steps: [(trace step index, cue)] — the moments that teach; show_vars: variable names, in order.
        The variables sit beside the code, or in a row under it when the panel was widened for readability.
        Returns (trace, bottom y of what it drew).
        """
        trace = json.loads(self.example_output(trace_rel))
        fmt = fmt or show_value
        p, hl, ln, _ = self.code(self.block(block_id), x, y, w, size=size, block_id=block_id, title=title, lh=lh, only=only)
        self.fade(p, steps[0][1], dur=0.3)
        w = self._last_code_w
        below = W - 104 - (x + w + 48) < 480
        if below:
            vx, vy, vw = x, y + self._last_code_h + 28, min(1100, W - 208)
            # no room for the result beside the variables on a portrait screen: it goes under them
            rx, ry = (x, vy + 46 + 60 + 24) if PORTRAIT else (x + 1160, vy)
        else:
            vx, vy, vw = x + w + 48, y, W - 104 - (x + w + 48)
            rx, ry = vx, y + 470
        self.label("variables", vx, vy, color=MUTED, eid=f"{self.id}-vl")
        self.fade(f"#{self.id}-vl", steps[0][1])
        times = [self.at(c) for _, c in steps]
        back = [(steps[i][1], steps[i + 1][1]) for i in range(len(times) - 1) if times[i + 1] < times[i]]
        if back:  # a cue that matched an earlier sentence shows the states out of order
            raise ValueError(f"{self.id}: trace cues run backwards: {back} (use nth= for a repeated phrase)")
        hidden = sorted({trace["steps"][si]["line"] for si, _ in steps if not hl[trace["steps"][si]["line"] - 1]})
        if hidden:
            raise ValueError(f"{self.id}: the trace lights line(s) {hidden}, which `only` does not show")
        prev_line, prev_state = None, None
        row_css = "display:flex;gap:48px;" if below else ""
        for k, (si, cue) in enumerate(steps):
            st = trace["steps"][si]
            t0 = self.at(cue)
            if prev_line != st["line"] - 1:  # a line that stays lit gets no off/on pair (overlapping tweens)
                if prev_line is not None:
                    self.unhighlight([hl[prev_line]], t0)
                self.highlight([hl[st["line"] - 1]], t0)
            prev_line = st["line"] - 1
            rows = "".join(
                f'<div style="display:flex;gap:24px;align-items:baseline;margin-bottom:{0 if below else 22}px;">'
                f'<div style="{"" if below else "width:150px;"}font-family:\'IBM Plex Mono\';font-size:34px;color:{MUTED};">{esc(n)}</div>'
                f'<div style="font-family:\'IBM Plex Mono\';font-size:44px;font-weight:600;color:{CREAM};white-space:nowrap;">'
                f'{esc(fmt(st["locals"][n])) if n in st["locals"] else "—"}</div></div>'
                for n in show_vars
            )
            sid = f"{self.id}-vs{k}"
            self.add(f'<div id="{sid}" style="position:absolute;left:{vx}px;top:{vy + 46}px;width:{vw}px;opacity:0;{row_css}">{rows}</div>')
            if prev_state:
                self.set(prev_state, t0, "opacity: 0")
            self.set(f"#{sid}", t0, "opacity: 1")
            prev_state = f"#{sid}"
        bottom = vy + 46 + (60 if below else 66 * len(show_vars))
        if result_cue is not None:
            self.label("returns", rx, ry, color=MUTED, eid=f"{self.id}-rl")
            self.text(str(trace["result"]), rx, ry + 40, size=72 if below else 96, weight=900, color=ORANGE, eid=f"{self.id}-res")
            self.fade(f"#{self.id}-rl", result_cue)
            self.pop(f"#{self.id}-res", result_cue)
            bottom = max(bottom, ry + 40 + (80 if below else 110))
        if bottom > KEEP_OUT:
            self.video.setdefault("warnings", []).append(f"{self.id}: trace for {block_id} reaches y={bottom}, into the caption band")
        return trace, bottom

    RUN_BUSY = 0.9  # seconds "running…" stays up, so it can be read (hyperframes check wants ~0.8 s)

    def code_run(self, script_rel, runs, x=104, y=170, w=1100, size=40, start=1, title="notebook"):
        """Run code the way a notebook does: each call sits in an `In [ ]:` cell, the ▶ run button lights on its
        cue, a moment of "running…", then `In [n]:` and `Out[n]:` with the result. Nothing on screen is typed by
        hand: the results come from the segment's example script (`script_rel`), which runs the source's code
        and prints {"calls": {"<call>": "<repr of its result>"}}. runs: [(call, cue)] or [(call, cue, out_cue)], top
        to bottom: the button lights on `cue`; "running…" stays at least RUN_BUSY seconds, until `out_cue` when the
        narration names the result later, so `Out[n]` lands on the words that read it. Returns the bottom y."""
        out = json.loads(self.example_output(script_rel))["calls"]
        runs = [r if len(r) > 2 else (r[0], r[1], None) for r in runs]
        missing = [r[0] for r in runs if r[0] not in out]
        if missing:
            raise KeyError(f"{self.id}: {script_rel} prints no result for {missing} (it printed: {list(out)})")
        pid = self.uid("run")
        row_h = round(size * 1.5)
        cell_h = row_h * 2 + 44
        head = 64
        cells = []
        for k, (call, cue, _) in enumerate(runs):
            n, cy = start + k, head + k * (cell_h + 18)
            cells.append(
                f'<div id="{pid}-c{k}" style="position:absolute;left:24px;right:24px;top:{cy}px;height:{cell_h}px;opacity:0;'
                f'border-radius:12px;background:{INK};border:1px solid {BORDER};">'
                f'<div id="{pid}-in{k}" style="position:absolute;left:20px;top:18px;width:150px;font-family:\'IBM Plex Mono\';'
                f'font-size:{LABEL_FLOOR}px;color:{MUTED};">In [ ]:</div>'
                f'<div style="position:absolute;left:170px;top:14px;font-family:\'IBM Plex Mono\';font-size:{size}px;color:{CREAM};'
                f'white-space:pre;">{esc(call)}</div>'
                f'<div id="{pid}-btn{k}" style="position:absolute;right:20px;top:14px;height:{row_h - 6}px;padding:0 18px;border-radius:10px;'
                f'border:2px solid {HINT};display:flex;align-items:center;font-family:\'IBM Plex Mono\';font-size:{LABEL_FLOOR}px;'
                f'color:{MUTED};">▶ run</div>'
                f'<div id="{pid}-busy{k}" style="position:absolute;left:170px;top:{row_h + 26}px;font-family:\'IBM Plex Mono\';'
                f'font-size:{LABEL_FLOOR}px;color:{MUTED};opacity:0;">running…</div>'
                f'<div id="{pid}-out{k}" style="position:absolute;left:20px;top:{row_h + 22}px;opacity:0;display:flex;gap:0;">'
                f'<span style="width:150px;font-family:\'IBM Plex Mono\';font-size:{LABEL_FLOOR}px;color:{ORANGE};padding-top:{max(0, (size - LABEL_FLOOR) // 2)}px;">'
                f'Out[{n}]:</span><span style="font-family:\'IBM Plex Mono\';font-size:{size}px;font-weight:600;color:{ORANGE};white-space:pre;">'
                f'{esc(out[call])}</span></div></div>')
        height = head + len(runs) * (cell_h + 18) + 10
        self.add(f'<div id="{pid}" data-run="{esc(script_rel)}" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{height}px;'
                 f'background:{INK_ALT};border:1px solid {BORDER};border-radius:16px;">'
                 f'<div style="position:absolute;left:24px;top:18px;font-family:\'IBM Plex Mono\';font-size:{LABEL_FLOOR}px;'
                 f'letter-spacing:0.12em;text-transform:uppercase;color:{MUTED};">{esc(title)}</div>{"".join(cells)}</div>')
        self.fade(f"#{pid}", max(0.0, self.at(runs[0][1]) - 1.0), dur=0.3)
        for k, (call, cue, out_cue) in enumerate(runs):
            t = self.at(cue)
            done = round(max(t + self.RUN_BUSY, self.at(out_cue) if out_cue else 0.0), 3)
            self.rise(f"#{pid}-c{k}", max(0.0, round(t - 0.8, 3)), dy=14, dur=0.3)
            self.to(f"#{pid}-btn{k}", t, f'borderColor: "{ORANGE}", color: "{ORANGE}"', dur=0.15)
            self.tweens.append(f'tl.fromTo("#{pid}-busy{k}", {{opacity: 0}}, {{opacity: 1, duration: 0.1, immediateRender: false}}, {round(t + 0.05, 3)});')
            self.set(f"#{pid}-busy{k}", done, "opacity: 0")
            self.set(f"#{pid}-in{k}", done, f'textContent: "In [{start + k}]:"')
            self.rise(f"#{pid}-out{k}", done, dy=10, dur=0.25)
            self.to(f"#{pid}-btn{k}", round(done + 0.15, 3), f'borderColor: "{HINT}", color: "{MUTED}"', dur=0.3)
        bottom = y + height
        if bottom > KEEP_OUT:
            self.video.setdefault("warnings", []).append(f"{self.id}: run panel reaches y={bottom}, into the caption band")
        return bottom

    def plan_card(self, steps, x=104, y=170, size=58, why_size=40):
        """steps: [(text, cue)] or [(text, cue, why, why_cue)]. Numbered plain-word steps, one per clause.
        A step's `why` is the reason the narration gives for it, drawn under the step in cream at 40px —
        the reason is what the viewer came for, so it is never chrome-sized (the eval's R5 checks it)."""
        gap = 150 + (why_size + 24 if any(len(s) > 2 for s in steps) else 0)
        for i, step in enumerate(steps):
            s, cue = step[0], step[1]
            ny = y + i * gap
            self.label(f"{i + 1:02d}", x, ny + 8, color=ORANGE, eid=f"{self.id}-pn{i}")
            self.text(s, x + 110, ny, size=size, weight=800, w=W - 208 - 110, lh=1.05, eid=f"{self.id}-ps{i}")
            self.rise(f"#{self.id}-pn{i}, #{self.id}-ps{i}", cue, dy=24)
            if len(step) > 2:
                why, why_cue = step[2], step[3] if len(step) > 3 else cue
                self.text(why, x + 110, ny + size + 18, size=why_size, weight=500, color=CREAM, w=W - 208 - 110, lh=1.1,
                          eid=f"{self.id}-pw{i}")
                self.fade(f"#{self.id}-pw{i}", why_cue)

    def cells(self, values, x, y, size=120, gap=18, font_size=60, label_idx=False, color=None, eid=None):
        color = color or CREAM
        base = eid or self.uid("arr")
        out, idx = [], []
        for i, v in enumerate(values):
            cx = x + i * (size + gap)
            cid = f"{base}-c{i}"
            self.add(f'<div id="{cid}" class="{self.id}-cell" style="left:{cx}px;top:{y}px;width:{size}px;height:{size}px;'
                     f'font-size:{font_size}px;color:{color};">{esc(str(v))}</div>')
            out.append(f"#{cid}")
            if label_idx:
                lid = f"{base}-i{i}"
                self.add(f'<div id="{lid}" class="{self.id}-idx" style="left:{cx}px;top:{y + size + 12}px;width:{size}px;">{i}</div>')
                idx.append(f"#{lid}")
        self.css.append(f"""
.{self.id}-cell {{ position:absolute; box-sizing:border-box; border:1px solid {HINT}; background:{INK_ALT};
  display:flex; align-items:center; justify-content:center; font-family:'{DISPLAY}'; font-weight:800; font-variant-numeric:tabular-nums; }}
.{self.id}-idx {{ position:absolute; text-align:center; font-family:'IBM Plex Mono'; font-size:{LABEL_FLOOR}px; color:{MUTED}; letter-spacing:0.1em; }}""")
        return (out, idx) if label_idx else out

    def setbox(self, x, y, w, h, title="seen", eid=None):
        sid = eid or self.uid("set")
        self.add(f'<div id="{sid}" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;border:2px solid {HINT};box-sizing:border-box;"></div>')
        self.label(title, x, y - 46, color=MUTED, eid=f"{sid}-t")
        return f"#{sid}", f"#{sid}-t"

    def chip(self, v, x, y, size=96, font_size=52, color=None, eid=None):
        color = color or CREAM
        cid = eid or self.uid("chip")
        self.add(f'<div id="{cid}" style="position:absolute;left:{x}px;top:{y}px;width:{size}px;height:{size}px;'
                 f'background:{INK_ALT};border:1px solid {MUTED};display:flex;align-items:center;justify-content:center;'
                 f"font-family:'{DISPLAY}';font-weight:800;font-size:{font_size}px;color:{color};\">{esc(str(v))}</div>")
        return f"#{cid}"

    def table(self, header, rows, x, y, widths, size=30, row_h=64, mono_cols=(), header_at=0.0):
        """header_at: the time or cue the header fades in on (default: the frame's start)."""
        tid = self.uid("tab")
        cells, out, hx = {}, [], x
        for c, (hd, w) in enumerate(zip(header, widths)):
            self.label(hd, hx, y, color=MUTED, w=w - 16, eid=f"{tid}-h{c}")
            hx += w
        self.box("", x, y + 46, w=sum(widths), h=1, style=f"background:{HINT};", eid=f"{tid}-hr")
        for r, row in enumerate(rows):
            ry = y + 62 + r * row_h
            rid = f"{tid}-r{r}"
            inner, cx = [], 0
            for c, (val, w) in enumerate(zip(row, widths)):
                fam = "IBM Plex Mono" if c in mono_cols else DISPLAY
                pad = 16 if c == 0 else 0   # clear of the highlight tint's 4px left border
                inner.append(f'<div id="{rid}-c{c}" style="position:absolute;left:{cx + pad}px;top:0;width:{w - 16 - pad}px;height:{row_h}px;'
                             f"display:flex;align-items:center;font-family:'{fam}';font-size:{size}px;font-weight:{500 if fam != DISPLAY else 600};"
                             f'color:{CREAM};white-space:nowrap;">{esc(str(val))}</div>')
                cells[(r, c)] = f"#{rid}-c{c}"
                cx += w
            self.add(f'<div id="{rid}" style="position:absolute;left:{x}px;top:{ry}px;width:{sum(widths)}px;height:{row_h}px;'
                     f'border-bottom:1px solid {BORDER};">{"".join(inner)}<div id="{rid}-tint" style="position:absolute;inset:0;'
                     f'background:{MARK_FILL};border-left:4px solid {ORANGE};opacity:0;"></div></div>')
            out.append(f"#{rid}")
        self.fade(f"[id^={tid}-h]", header_at, dur=0.4)
        return out, cells

    def node(self, s, x, y, w, h=120, size=40, accent=False, eid=None):
        nid = eid or self.uid("node")
        bc = ORANGE if accent else HINT
        self.add(f'<div id="{nid}" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;box-sizing:border-box;'
                 f'border:2px solid {bc};background:{INK_ALT};display:flex;align-items:center;justify-content:center;text-align:center;'
                 f"font-family:'{DISPLAY}';font-weight:700;font-size:{size}px;color:{CREAM};padding:0 20px;line-height:1.1;\">{esc(s)}</div>")
        return f"#{nid}"

    def bar(self, x, y, w, h=56, color=None, eid=None):
        color = color or ORANGE
        bid = eid or self.uid("bar")
        self.box("", x, y, w=w, h=h, style=f"background:{color};", eid=bid)
        return f"#{bid}"

    def svg(self, inner, eid=None):
        sid = eid or self.uid("svg")
        self.add(f'<svg id="{sid}" width="{W}" height="{KEEP_OUT}" viewBox="0 0 {W} {KEEP_OUT}" style="position:absolute;left:0;top:0;overflow:visible;">{inner}</svg>')
        return f"#{sid}"

    def arrow(self, x1, y1, x2, y2, eid, color=None, width=3, curve=0):
        color = color or MUTED
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2 - curve
        mid = f"{eid}-m"
        return (f'<defs><marker id="{mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                f'<path d="M0,0 L10,5 L0,10 z" fill="{color}"/></marker></defs>'
                f'<path id="{eid}" d="M{x1},{y1} Q{mx},{my} {x2},{y2}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0" fill="none" '
                f'stroke="{color}" stroke-width="{width}" marker-end="url(#{mid})"/>')

    def ground(self):
        return (f'<div id="{self.id}-ground" class="clip" data-start="0" data-duration="{self.duration}" data-track-index="0" '
                f'style="position:absolute;inset:0;background:{getattr(self, "_board", INK)};"></div>')

    # ── the skit stage (two characters on one chalkboard) ─────────────────────────────────────
    # The stage bible, enforced here so no skit can break it:
    #   one set per video: the board, one floor line, one key light behind the cast — none of it changes;
    #   fixed staging: the first cast member stands left, the second right, on the floor line, never crossing;
    #   three shots only: "two" (the wide two-shot) and a close-up on each character; a change of shot is a cut,
    #   or a short eased push from the two-shot; the lens (vignette, grain) sits outside the camera and never moves;
    #   a pose changes with a quick crossfade and a small squash; the speaker bobs while talking, both breathe.
    FLOOR = 1240          # the floor line, in world px (the content keep-out is 1320)
    CLOSE = 1.6           # close-up magnification
    PARALLAX = 0.25       # how much of the camera's move the board's writing makes

    def stage(self, cast=("penguin", "bear"), poses=None, heights=None, board=None):
        """Draw the set and both characters in their first pose. `poses` is {char: [pose, …]}: every pose the
        scene uses (the first is the opening pose). Images come from <workspace>/cast/<char>/<pose>.png
        (frames/slice-cast.py). Turns come from the take's turns.json (narrate --cast)."""
        import shutil
        src = next((d / "cast" for d in [Path(self.video["out_dir"]), *Path(self.video["out_dir"]).parents]
                    if (d / "cast" / "cast-meta.json").exists()), None)
        if not src:
            raise FileNotFoundError("stage: no cast/cast-meta.json in the workspace — run frames/slice-cast.py")
        meta = json.loads((src / "cast-meta.json").read_text())
        self._board = board or meta["board"]
        self._skit = True
        left, right = cast
        heights = heights or {left: 330, right: 380}  # displayed px; the bear is the bigger animal
        self.cast, self.actor = list(cast), {}
        world = []
        for side, ch in (("L", left), ("R", right)):
            m = meta["chars"][ch]
            h = heights[ch]
            w = round(m["w"] * h / m["h"])
            x = 40 if side == "L" else W - w + 40  # the right one may bleed off the edge: it is the big one
            self.actor[ch] = dict(x=x, w=w, h=h, cx=x + w / 2, top=self.FLOOR - h, pose=None)
            imgs = []
            for p in (poses or {}).get(ch, ["neutral"]):
                if p not in m["poses"]:
                    raise KeyError(f"stage: {ch} has no pose {p!r} (has: {', '.join(m['poses'])})")
                dest = self.project / "assets" / "cast" / ch / f"{p}.png"
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(src / ch / f"{p}.png", dest)
                op = 1 if not imgs else 0
                imgs.append(f'<img id="{self.id}-{ch}-{p}" src="assets/cast/{ch}/{p}.png" '
                            f'style="position:absolute;left:0;top:0;width:{w}px;height:{h}px;opacity:{op};" />')
            self.actor[ch]["pose"] = (poses or {}).get(ch, ["neutral"])[0]
            world.append(
                f'<div id="{self.id}-{ch}" style="position:absolute;left:{x}px;top:{self.FLOOR - h}px;width:{w}px;height:{h}px;'
                f'transform-origin:50% 100%;"><div id="{self.id}-{ch}-body" style="position:absolute;inset:0;transform-origin:50% 100%;">'
                + "".join(imgs) + "</div></div>")
        # the key light: one warm pool behind the cast, part of the world, so it moves with the camera like a real lamp
        light = (f'<div style="position:absolute;left:-200px;top:{self.FLOOR - 760}px;width:{W + 400}px;height:900px;'
                 f'background:radial-gradient(ellipse 50% 48% at 50% 62%, rgba(255,236,200,0.10), rgba(255,236,200,0) 70%);"></div>')
        floor = (f'<svg style="position:absolute;left:0;top:{self.FLOOR - 6}px;overflow:visible" width="{W}" height="20">'
                 f'<path d="M24,8 C200,4 420,11 560,7 S900,4 {W - 24},9" stroke="{CREAM}" stroke-opacity="0.42" stroke-width="4" '
                 f'fill="none" stroke-linecap="round"/></svg>')
        # the board's writing hangs behind the cast on its own layer: the camera moves it a quarter as much (parallax),
        # so a close-up keeps it readable instead of cropping it at the top of the screen
        self.add(f'<div id="{self.id}-board" style="position:absolute;left:0;top:0;width:{W}px;height:{KEEP_OUT}px;transform-origin:0 0;"></div>')
        self.add(f'<div id="{self.id}-cam" style="position:absolute;left:0;top:0;width:{W}px;height:{KEEP_OUT}px;'
                 f'transform-origin:0 0;">{light}{floor}{"".join(world)}</div>')
        # the lens: grain and vignette over everything, fixed — the light never changes between shots
        self._lens = (f'<svg style="position:absolute;inset:0;pointer-events:none;opacity:0.10;mix-blend-mode:screen" '
                      f'width="{W}" height="{H}"><filter id="{self.id}-grain"><feTurbulence type="fractalNoise" '
                      f'baseFrequency="0.9" numOctaves="2" seed="7"/><feColorMatrix type="saturate" values="0"/></filter>'
                      f'<rect width="100%" height="100%" filter="url(#{self.id}-grain)"/></svg>'
                      f'<div style="position:absolute;inset:0;pointer-events:none;'
                      f'background:radial-gradient(ellipse 80% 70% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%);"></div>')
        self._idle()
        self._talk()

    def _turns(self):
        p = self.project / "turns.json"
        if not p.exists():
            return []
        return [t for t in json.loads(p.read_text()) if int(t["frame"]) == self.no]

    def _idle(self):
        """Both characters breathe, slowly and out of phase, for the whole scene."""
        for ch in self.cast:  # the resting state every later tween starts from, at any seek
            self.tweens.append(f'tl.set("#{self.id}-{ch}-body", {{y: 0, scaleX: 1, scaleY: 1}}, 0);')
        for i, ch in enumerate(self.cast):
            period = 1.9 + 0.35 * i
            reps = int(self.duration / period) + 1
            self.tweens.append(f'tl.fromTo("#{self.id}-{ch}", {{scaleY: 1, scaleX: 1}}, {{scaleY: 1.018, scaleX: 0.994, '
                               f'duration: {period / 2:.3f}, ease: "sine.inOut", yoyo: true, repeat: {reps * 2 - 1}}}, {0.2 + 0.6 * i:.2f});')

    def _talk(self):
        """The speaker bobs on its syllables while its line plays; the listener only breathes."""
        for t in self._turns():
            ch = t.get("speaker")
            if ch not in self.actor:
                continue
            dur = t["end"] - t["start"]
            beat = 0.17
            n = max(1, int(dur / (2 * beat)))
            self.tweens.append(f'tl.to("#{self.id}-{ch}-body", {{y: -9, duration: {beat}, ease: "sine.inOut", '
                               f'yoyo: true, repeat: {2 * n - 1}}}, {t["start"]:.3f});')

    def line_start(self, speaker, nth=1):
        """When the nth line of a speaker starts, in frame time."""
        ts = [t for t in self._turns() if t.get("speaker") == speaker]
        return round(ts[nth - 1]["start"], 3)

    def pose(self, ch, name, t):
        """Swap a character's pose: a 0.12 s crossfade and a small squash, standing on the same spot."""
        a = self.actor[ch]
        t = self.at(t)
        old, a["pose"] = a["pose"], name
        if old == name:
            return
        self.tweens.append(f'tl.to("#{self.id}-{ch}-{old}", {{opacity: 0, duration: 0.12, ease: "none"}}, {t});')
        self.tweens.append(f'tl.to("#{self.id}-{ch}-{name}", {{opacity: 1, duration: 0.12, ease: "none"}}, {t});')
        self.tweens.append(f'tl.set("#{self.id}-{ch}-body", {{scaleY: 0.94, scaleX: 1.04}}, {t});')
        self.tweens.append(f'tl.to("#{self.id}-{ch}-body", {{scaleY: 1, scaleX: 1, duration: 0.35, ease: "back.out(2.5)"}}, {t});')

    def _shot_props(self, name):
        if name == "two":
            return 1, 0, 0
        a = self.actor[name]
        s = self.CLOSE
        x = W / 2 - a["cx"] * s
        y = (KEEP_OUT - 30) - self.FLOOR * s  # the floor stays just above the caption band
        x = min(0, max(W - W * s, x))  # never show past the set's edges
        return s, round(x, 1), round(y, 1)

    def shot(self, name, t, push=False):
        """Change shot: "two", or a cast member's name for their close-up. A cut unless push=True (0.5 s ease)."""
        if name != "two" and name not in self.actor:
            raise KeyError(f"shot: {name!r} is not a shot (two, {', '.join(self.cast)})")
        s, x, y = self._shot_props(name)
        k = self.PARALLAX
        for el, props in ((f"#{self.id}-cam", f"scale: {s}, x: {x}, y: {y}"),
                          (f"#{self.id}-board", f"scale: {round(1 + (s - 1) * k, 3)}, x: {round(x * k, 1)}, y: {round(y * k, 1)}")):
            if push:
                self.tweens.append(f'tl.to("{el}", {{{props}, duration: 0.5, ease: "power2.inOut"}}, {self.at(t)});')
            else:
                self.set(el, t, props)

    def chalk(self, s, x, y, t, size=72, color=None, w=None, align="center", eid=None):
        """Chalk writing on the board behind the cast, in board px (the two-shot shows it as placed)."""
        eid = eid or self.uid("chalk")
        st = (f"position:absolute;left:{x}px;top:{y}px;{f'width:{w}px;' if w else ''}font-family:'{DISPLAY}';"
              f"font-size:{size}px;font-weight:800;color:{color or CREAM};text-align:{align};line-height:1.05;"
              f"white-space:pre-wrap;opacity:0.92;text-shadow:0 0 2px rgba(240,236,229,0.35);")
        self._board_html = getattr(self, "_board_html", []) + [f'<div id="{eid}" style="{st}">{esc(s)}</div>']  # on the board layer
        self.tweens.append(f'tl.fromTo("#{eid}", {{opacity: 0, clipPath: "inset(0 100% 0 0)"}}, '
                           f'{{opacity: 0.92, clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "power1.inOut"}}, {self.at(t)});')
        return f"#{eid}"

    # ── output ────────────────────────────────────────────────────────────────────────────────
    def write(self, drift=True):
        self.chrome()
        self.card_html = ""
        # the hook opens on its example (step-2-outline.md § The hook): a title card would hide it
        if self.no == 1 and self.video.get("stage") != "hook":
            lift = self.lift = self.stage_card()
            # nothing shows under the card, so reveals cued before it lifts start as it lifts
            clamp = lambda m: f", {max(float(m.group(1)), lift)});"
            self.tweens = [tw if "-stagecard" in tw or "-stage\"" in tw else re.sub(r", ([\d.]+)\);$", clamp, tw)
                           for tw in self.tweens]
        # the scene's subject is on screen from its first word: no empty canvas while a question is spoken
        chrome_ids = ("-stagecard", "-stage\"", "-kicker", "-chap", "-hair", "-strip")
        labels = getattr(self, "_labels", set())
        def substantive(tw):  # a small label alone is not the scene's subject
            sel = re.match(r'tl\.\w+\("([^"]+)"', tw)
            return not (sel and all(p.strip() in labels for p in sel.group(1).split(",")))
        times = [float(m.group(1)) for tw in self.tweens if not any(c in tw for c in chrome_ids) and substantive(tw)
                 for m in [re.search(r", ([\d.]+)\);$", tw)] if m]
        start = max(self.words[0]["start"] if self.words else 0.0, getattr(self, "lift", 0.0))
        if times and min(times) > start + 1.0:
            self.video.setdefault("warnings", []).append(
                f"{self.id}: canvas empty for {min(times) - start:.1f}s after the first word; cue something on it")
        faces = "\n".join(
            f"@font-face {{ font-family:'{fam}'; font-weight:{wt}; font-style:normal; src:url('assets/fonts/{f}') format('woff2'); }}"
            for fam, wt, f in FONTS
        )
        stage = f"{self.id}-stage"
        drift = drift and not getattr(self, "_skit", False)  # a skit's camera moves only by its shots
        if getattr(self, "_board_html", None):
            self.html = [h.replace(f'transform-origin:0 0;"></div>', f'transform-origin:0 0;">{"".join(self._board_html)}</div>', 1)
                         if h.startswith(f'<div id="{self.id}-board"') else h for h in self.html]
        drift_tw = f'tl.fromTo("#{stage}", {{scale: 1}}, {{scale: 1.02, duration: {self.duration}, ease: "none"}}, 0);' if drift else ""
        body = "\n        ".join(self.html)
        tweens = "\n      ".join([drift_tw] + self.tweens)
        out = f"""<template>
  <style>
{faces}
    #root {{ position:absolute; inset:0; width:{W}px; height:{H}px; overflow:hidden; color:{CREAM}; font-family:'{DISPLAY}'; }}
    #{stage} {{ position:absolute; left:0; top:0; width:{W}px; height:{KEEP_OUT}px; transform-origin:50% 45%; }}
{"".join(self.css)}
  </style>
  <div id="root" data-composition-id="{self.id}" data-width="{W}" data-height="{H}" data-duration="{self.duration}">
    {self.ground()}
    <div id="{self.id}-layer" class="clip" data-start="0" data-duration="{self.duration}" data-track-index="1" style="position:absolute;inset:0;">
      <div id="{stage}">
        {body}
      </div>
      {self.card_html}
      {getattr(self, "_lens", "")}
    </div>
  </div>
  <script src="assets/gsap.min.js"></script>
  <script>
    (function () {{
      window.__timelines = window.__timelines || {{}};
      const tl = gsap.timeline({{ paused: true }});
      {tweens}
      tl.set({{}}, {{}}, {self.duration});
      window.__timelines["{self.id}"] = tl;
    }})();
  </script>
</template>
"""
        dest = self.project / "compositions" / "frames" / f"{self.id}.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(out)
        return dest


_CHAPTERS = {}


def broadside_case(s):
    """Broadside titles are lower case, but O(1), SQL, LeetCode and [1, 2, 3, 1] keep theirs."""
    return " ".join(w if re.search(r"[\d()\[\]]|[A-Z].*[A-Z]", w) else w.lower() for w in s.split(" "))


def chapter_block(out_dir, bid):
    key = str(out_dir)
    if key not in _CHAPTERS:
        _CHAPTERS[key] = {b["id"]: b for b in json.loads((Path(out_dir) / "chapter.json").read_text())["blocks"]}
    return _CHAPTERS[key][bid]["text"]


def frames_of(project):
    """[(frame_no, frame_id)] from STORYBOARD.md src lines."""
    sb = Path(project, "STORYBOARD.md").read_text()
    return [(int(n), fid) for n, fid in re.findall(r"(?ms)^## Frame (\d+).*?- src: compositions/frames/(\S+)\.html", sb)]
