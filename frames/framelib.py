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
INK, INK_ALT, ORANGE, CREAM = "#111111", "#1A1A18", "#E85D26", "#F0ECE5"
MUTED, HINT, BORDER = "#888880", "#505048", "#282826"
LABEL_FLOOR = 28  # px: what a phone can read at 1080p (hyperframes check text_below_floor)

FONTS = [("Barlow", w, f"barlow-latin-{w}-normal.woff2") for w in (400, 600, 700, 800, 900)] + [
    ("IBM Plex Mono", w, f"ibm-plex-mono-latin-{w}-normal.woff2") for w in (400, 500, 600)
]

# viewer-facing names of the arc stages (step-2-outline.md § The teaching arc)
STAGE_NAMES = {
    "hook": "Intro", "spot": "Spot it", "problem": "Problem", "think": "Think", "plan": "Plan",
    "write": "Code", "trace": "Trace", "why-fast": "Why fast", "bug": "The bug", "other-ways": "Other ways",
    "interview": "Interview", "bonus": "Bonus", "recap": "Recap",
}

esc = html.escape


def norm(s):
    return re.sub(r"[^a-z0-9.]", "", s.lower().replace("’", "'"))


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

    def mark(self, sel, t, color=ORANGE, fill="rgba(232,93,38,0.18)"):
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

    def text(self, s, x, y, size=86, weight=700, color=CREAM, font="Barlow", w=None, align="left", tracking="-0.02em",
             lower=False, upper=False, lh=1.05, eid=None, raw=False, attrs=""):
        st = (f"font-family:'{font}';font-size:{size}px;font-weight:{weight};color:{color};line-height:{lh};"
              f"letter-spacing:{tracking};text-align:{align};white-space:pre-wrap;"
              + ("text-transform:lowercase;" if lower else "") + ("text-transform:uppercase;" if upper else ""))
        return self.box(s if raw else esc(s), x, y, w=w, style=st, eid=eid, attrs=attrs)

    def label(self, s, x, y, color=ORANGE, size=LABEL_FLOOR, w=None, align="left", eid=None, attrs=""):
        size = size if "data-layout-ignore" in attrs else max(size, LABEL_FLOOR)
        eid = eid or self.uid("lbl")
        self._labels = getattr(self, "_labels", set()) | {f"#{eid}"}
        return self.text(s, x, y, size=size, weight=500, color=color, font="IBM Plex Mono", tracking="0.12em",
                         upper=True, w=w, align=align, eid=eid, attrs=attrs)

    def headline(self, s, t, y=156, size=60, color=CREAM, w=None):
        """The scene's question or subject, on screen from the words that say it."""
        sel = self.text(s, 104, y, size=size, weight=800, color=color, w=w or W - 208, lh=1.0, eid=f"{self.id}-hd{self._n}")
        self.rise(sel, t, dy=20)
        return sel

    def rule(self, x, y, w=36, h=2, color=ORANGE, eid=None):
        return self.box("", x, y, w=w, h=h, style=f"background:{color};", eid=eid)

    # ── orientation (automatic) ───────────────────────────────────────────────────────────────
    def chrome(self):
        """Series and part top-left, this part's title top-right, hairline, then the progress strip."""
        v = self.video
        ign = "data-layout-ignore"
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
            f'<div style="position:absolute;left:96px;top:380px;width:1700px;font-family:\'Barlow\';font-size:120px;font-weight:900;'
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
            f'<div style="font-family:\'Barlow\';font-size:40px;font-weight:800;color:{CREAM};line-height:1.05;margin-top:8px;">{esc(s)}</div></div>'
            for i, s in enumerate(stages)
        )
        self.add(f'<div id="{rid}" data-role="roadmap" style="position:absolute;left:{x}px;top:{y}px;width:{W - 208}px;height:150px;">{cells}</div>')
        t0 = self.at(t)
        for i in range(len(stages)):
            self.rise(f"#{rid}-s{i}", round(t0 + i * 0.22, 3), dy=20, dur=0.45)
        return rid

    # ── teaching components ───────────────────────────────────────────────────────────────────
    def code(self, src, x, y, w, size=30, title=None, lh=1.5, block_id=None, gutter=True):
        """A verbatim code panel. Returns (panel, [highlight sels], [line sels], [tag slot sels])."""
        pid = self.uid("code")
        lines = src.split("\n")
        # IBM Plex Mono advances 0.6em per glyph. Keep code at the phone floor: widen the panel (up to the
        # content edge) before shrinking the type, and only then shrink to fit — recorded as a warning.
        longest = max(len(l) for l in lines)
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
        self._last_code_h = round(len(lines) * size * lh + 60 + (LABEL_FLOOR + 10 if title else 0))
        rows = []
        for i, ln in enumerate(lines):
            num = f'<span class="{self.id}-num">{i + 1}</span>' if gutter else ""
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
.{self.id}-hl {{ position:absolute; left:-44px; right:-44px; top:0; bottom:0; background:rgba(232,93,38,0.16);
  border-left:4px solid {ORANGE}; opacity:0; }}
.{self.id}-num {{ position:relative; display:inline-block; width:56px; color:{MUTED}; }}  /* HINT is under 3:1 on the panel */
.{self.id}-ct {{ position:relative; }}""",
        )
        return f"#{pid}", [f"#{pid}-h{i}" for i in range(len(lines))], [f"#{pid}-l{i}" for i in range(len(lines))], size

    def highlight(self, hl_sels, t):
        t0 = self.at(t)
        for s in hl_sels:
            self.tweens.append(f'tl.to("{s}", {{opacity: 1, duration: 0.35, ease: "power2.out"}}, {t0});')

    def unhighlight(self, hl_sels, t):
        t0 = self.at(t)
        for s in hl_sels:
            self.tweens.append(f'tl.to("{s}", {{opacity: 0, duration: 0.3, ease: "power2.out"}}, {t0});')

    def code_show(self, block_id, x=104, y=170, w=1712, size=34, title=None, t=0.0, lh=1.5):
        """A whole block, for reference (not for teaching how to write it — use code_build)."""
        p, hl, ln, _ = self.code(self.block(block_id), x, y, w, size=size, title=title, lh=lh, block_id=block_id)
        self.fade(p, t, dur=0.3)
        for i, s in enumerate(ln):
            self.tweens.append(f'tl.fromTo("{s}", {{opacity: 0, x: -14}}, {{opacity: 1, x: 0, duration: 0.3, ease: "power2.out"}}, {round(self.at(t) + i * 0.08, 3)});')
        return p, hl, ln

    def code_build(self, block_id, steps, x=104, y=170, w=1240, size=36, tags_x=None, lh=1.55):
        """Write the code line by line. steps: [(lines (1-based list), cue, tag or None)].

        Lines appear on their cue, the newest lit, earlier ones settled; the tag (the plan step the lines
        serve) lands in the margin beside them. Lines not in any step never appear — check-readability
        --chapter already requires every line to be narrated.
        """
        p, hl, ln, fs = self.code(self.block(block_id), x, y, w, size=size, lh=lh, block_id=block_id)
        self.fade(p, steps[0][1], dur=0.3)
        line_h = fs * lh
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
                ty = round(y + 30 + idx[0] * line_h + (line_h - 34) / 2)
                tid = f"{self.id}-tag{k}"
                self.label(tag, tags_x, ty, color=ORANGE, w=W - 104 - tags_x, eid=tid)
                self.fade(f"#{tid}", t0)
        for i in range(len(ln)):
            if not any(i + 1 in s[0] for s in steps):
                self.set(ln[i], 0, "opacity: 0")
        return p, hl, ln

    def code_trace(self, block_id, trace_rel, steps, show_vars, x=104, y=170, w=1000, size=34,
                   fmt=None, result_cue=None, title=None, lh=1.5):
        """Run the code on screen: the executing line lit, variables updating. Steps come from a trace JSON.

        trace_rel: the segment's examples/<trace>.py (its stdout is {"result", "steps": [{line, locals}]}).
        steps: [(trace step index, cue)] — the moments that teach; show_vars: variable names, in order.
        The variables sit beside the code, or in a row under it when the panel was widened for readability.
        Returns (trace, bottom y of what it drew).
        """
        trace = json.loads(self.example_output(trace_rel))
        fmt = fmt or (lambda v: "{" + ", ".join(map(str, sorted(v))) + "}" if isinstance(v, set) else repr(v) if isinstance(v, str) else str(v))
        p, hl, ln, _ = self.code(self.block(block_id), x, y, w, size=size, block_id=block_id, title=title, lh=lh)
        self.fade(p, steps[0][1], dur=0.3)
        w = self._last_code_w
        below = W - 104 - (x + w + 48) < 480
        if below:
            vx, vy, vw = x, y + self._last_code_h + 28, 1100
            rx, ry = x + 1160, vy
        else:
            vx, vy, vw = x + w + 48, y, W - 104 - (x + w + 48)
            rx, ry = vx, y + 470
        self.label("variables", vx, vy, color=MUTED, eid=f"{self.id}-vl")
        self.fade(f"#{self.id}-vl", steps[0][1])
        times = [self.at(c) for _, c in steps]
        back = [(steps[i][1], steps[i + 1][1]) for i in range(len(times) - 1) if times[i + 1] < times[i]]
        if back:  # a cue that matched an earlier sentence shows the states out of order
            raise ValueError(f"{self.id}: trace cues run backwards: {back} (use nth= for a repeated phrase)")
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

    def plan_card(self, steps, x=104, y=170, size=58):
        """steps: [(text, cue)]. Numbered plain-word steps, one per clause."""
        for i, (s, cue) in enumerate(steps):
            ny = y + i * 150
            self.label(f"{i + 1:02d}", x, ny + 8, color=ORANGE, eid=f"{self.id}-pn{i}")
            self.text(s, x + 110, ny, size=size, weight=800, w=W - 208 - 110, lh=1.05, eid=f"{self.id}-ps{i}")
            self.rise(f"#{self.id}-pn{i}, #{self.id}-ps{i}", cue, dy=24)

    def cells(self, values, x, y, size=120, gap=18, font_size=60, label_idx=False, color=CREAM, eid=None):
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
  display:flex; align-items:center; justify-content:center; font-family:'Barlow'; font-weight:800; font-variant-numeric:tabular-nums; }}
.{self.id}-idx {{ position:absolute; text-align:center; font-family:'IBM Plex Mono'; font-size:{LABEL_FLOOR}px; color:{MUTED}; letter-spacing:0.1em; }}""")
        return (out, idx) if label_idx else out

    def setbox(self, x, y, w, h, title="seen", eid=None):
        sid = eid or self.uid("set")
        self.add(f'<div id="{sid}" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;border:2px solid {HINT};box-sizing:border-box;"></div>')
        self.label(title, x, y - 46, color=MUTED, eid=f"{sid}-t")
        return f"#{sid}", f"#{sid}-t"

    def chip(self, v, x, y, size=96, font_size=52, color=CREAM, eid=None):
        cid = eid or self.uid("chip")
        self.add(f'<div id="{cid}" style="position:absolute;left:{x}px;top:{y}px;width:{size}px;height:{size}px;'
                 f'background:{INK_ALT};border:1px solid {MUTED};display:flex;align-items:center;justify-content:center;'
                 f"font-family:'Barlow';font-weight:800;font-size:{font_size}px;color:{color};\">{esc(str(v))}</div>")
        return f"#{cid}"

    def table(self, header, rows, x, y, widths, size=30, row_h=64, mono_cols=()):
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
                fam = "IBM Plex Mono" if c in mono_cols else "Barlow"
                inner.append(f'<div id="{rid}-c{c}" style="position:absolute;left:{cx}px;top:0;width:{w - 16}px;height:{row_h}px;'
                             f"display:flex;align-items:center;font-family:'{fam}';font-size:{size}px;font-weight:{500 if fam != 'Barlow' else 600};"
                             f'color:{CREAM};white-space:nowrap;">{esc(str(val))}</div>')
                cells[(r, c)] = f"#{rid}-c{c}"
                cx += w
            self.add(f'<div id="{rid}" style="position:absolute;left:{x}px;top:{ry}px;width:{sum(widths)}px;height:{row_h}px;'
                     f'border-bottom:1px solid {BORDER};">{"".join(inner)}<div id="{rid}-tint" style="position:absolute;inset:0;'
                     f'background:rgba(232,93,38,0.14);border-left:4px solid {ORANGE};opacity:0;"></div></div>')
            out.append(f"#{rid}")
        self.fade(f"[id^={tid}-h]", 0.0, dur=0.4)
        return out, cells

    def node(self, s, x, y, w, h=120, size=40, accent=False, eid=None):
        nid = eid or self.uid("node")
        bc = ORANGE if accent else HINT
        self.add(f'<div id="{nid}" style="position:absolute;left:{x}px;top:{y}px;width:{w}px;height:{h}px;box-sizing:border-box;'
                 f'border:2px solid {bc};background:{INK_ALT};display:flex;align-items:center;justify-content:center;text-align:center;'
                 f"font-family:'Barlow';font-weight:700;font-size:{size}px;color:{CREAM};padding:0 20px;line-height:1.1;\">{esc(s)}</div>")
        return f"#{nid}"

    def bar(self, x, y, w, h=56, color=ORANGE, eid=None):
        bid = eid or self.uid("bar")
        self.box("", x, y, w=w, h=h, style=f"background:{color};", eid=bid)
        return f"#{bid}"

    def svg(self, inner, eid=None):
        sid = eid or self.uid("svg")
        self.add(f'<svg id="{sid}" width="{W}" height="{KEEP_OUT}" viewBox="0 0 {W} {KEEP_OUT}" style="position:absolute;left:0;top:0;overflow:visible;">{inner}</svg>')
        return f"#{sid}"

    def arrow(self, x1, y1, x2, y2, eid, color=MUTED, width=3, curve=0):
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2 - curve
        mid = f"{eid}-m"
        return (f'<defs><marker id="{mid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
                f'<path d="M0,0 L10,5 L0,10 z" fill="{color}"/></marker></defs>'
                f'<path id="{eid}" d="M{x1},{y1} Q{mx},{my} {x2},{y2}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="0" fill="none" '
                f'stroke="{color}" stroke-width="{width}" marker-end="url(#{mid})"/>')

    def ground(self):
        return (f'<div id="{self.id}-ground" class="clip" data-start="0" data-duration="{self.duration}" data-track-index="0" '
                f'style="position:absolute;inset:0;background:{INK};"></div>')

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
        drift_tw = f'tl.fromTo("#{stage}", {{scale: 1}}, {{scale: 1.02, duration: {self.duration}, ease: "none"}}, 0);' if drift else ""
        body = "\n        ".join(self.html)
        tweens = "\n      ".join([drift_tw] + self.tweens)
        out = f"""<template>
  <style>
{faces}
    #root {{ position:absolute; inset:0; width:{W}px; height:{H}px; overflow:hidden; color:{CREAM}; font-family:'Barlow'; }}
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
