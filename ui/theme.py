"""theme.py — chalk's look: lilac ink on deep plum, one lime accent (assets/logo.svg).

The Streamlit theme itself is .streamlit/config.toml. This module adds what a theme cannot: status pills
(one colour and one glyph per status, never emoji), stage cards, the Plan → Build → Check stepper, the
console, and the wordmark.
"""

from __future__ import annotations

import base64
import html
import re
from functools import lru_cache

import streamlit as st

from chalk_api import REPO

BG, PANEL, INK, MUTED, ACCENT, BORDER = "#1a0f2e", "#241640", "#f3eeff", "#b9abd6", "#d4f76a", "#3a2a5c"

# status → (label, colour, glyph). "waiting" splits by who it waits for: an agent, or you.
STATUS = {
    "done": ("done", "#7bc47f", "●"),
    "running": ("running", ACCENT, "◐"),
    "agent": ("next: agent", "#6ea8fe", "◇"),
    "you": ("your turn", "#e8b44a", "◆"),
    "stale": ("stale", "#b392f0", "↻"),
    "todo": ("to run", MUTED, "○"),
    "blocked": ("blocked", MUTED, "○"),
    "failed": ("failed", "#e5534b", "✕"),
    "accepted": ("accepted", MUTED, "☑"),
    "timeout": ("timed out", "#e5534b", "⏱"),
}
PHASE_STYLE = {  # run phase → (label, status key)
    "idle": ("Not started", "todo"), "running": ("Running", "running"), "gate": ("Your turn", "you"),
    "done": ("Done", "done"), "failed": ("Stopped on a failure", "failed"), "stopped": ("Stopped", "todo"),
    "crashed": ("Driver stopped unexpectedly", "failed"), "cli": ("Built from the CLI", "todo"),
}

# The README's three phases. Every stage of every format belongs to exactly one.
PHASES = [
    ("Plan", ["research", "research-approved", "ingest", "source-check", "outline", "syllabus", "scripts", "text-gates", "grounding", "learner-scripts", "scripts-approved"]),
    ("Build", ["narrate", "align", "pipeline-debt", "frame-spec", "grounding-frames", "frames", "frames-review", "render", "lesson-page", "deliver"]),
    ("Check", ["eval", "learner", "notebook-review", "review", "resolve", "watched"]),
]


def phase_of(stage: str) -> str:
    for name, stages in PHASES:
        if stage in stages:
            return name
    return "Build"


def pill(key: str, text: str | None = None, *, title: str = "") -> str:
    label, colour, glyph = STATUS[key]
    t = f' title="{html.escape(title)}"' if title else ""
    cls = " ck-pulse" if key == "running" else ""
    return (f'<span class="ck-pill{cls}" style="--c:{colour}"{t}><b>{glyph}</b>{html.escape(text or label)}</span>')


def chip(text: str, key: str, *, title: str = "") -> str:
    """A small segment chip, coloured by status."""
    _, colour, glyph = STATUS[key]
    t = f' title="{html.escape(title)}"' if title else ""
    cls = " ck-pulse" if key == "running" else ""
    return f'<span class="ck-chip{cls}" style="--c:{colour}"{t}>{glyph} {html.escape(text)}</span>'


def tag(text: str, colour: str = MUTED) -> str:
    return f'<span class="ck-tag" style="--c:{colour}">{html.escape(text)}</span>'


@lru_cache(maxsize=4)
def wordmark(height: int = 30) -> str:
    """The logo's wordmark and dot, cropped from assets/logo.svg (no background, no tagline), as an <img>:
    st.html sanitises inline <svg> away, so the SVG goes in as a data URI."""
    svg = (REPO / "assets/logo.svg").read_text()
    svg = re.sub(r'<rect width="644" height="368"[^>]*/>', "", svg)
    svg = re.sub(r'<rect x="302.0"[^>]*/>', "", svg)  # the rule under the wordmark
    svg = re.sub(r'<path fill="#b9abd6".*?/>', "", svg, flags=re.S)  # the tagline
    width = int(height * 490 / 122)
    svg = re.sub(r'viewBox="[^"]*" width="\d+" height="\d+"', f'viewBox="80 82 490 122" width="{width}" height="{height}"', svg)
    data = base64.b64encode(svg.encode()).decode()
    return f'<img alt="chalk" src="data:image/svg+xml;base64,{data}" width="{width}" height="{height}" style="display:block">'


CSS = f"""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@600;700&display=swap');
.block-container {{ padding-top: 3.6rem; max-width: 1500px; }}
.ck-pill {{ display:inline-flex; align-items:center; gap:.35em; padding:.12em .6em; border-radius:999px;
  font-size:.78rem; font-weight:600; color:var(--c); border:1px solid color-mix(in srgb, var(--c) 45%, transparent);
  background:color-mix(in srgb, var(--c) 12%, transparent); white-space:nowrap; }}
.ck-pill b {{ font-weight:700; }}
.ck-chip {{ display:inline-block; padding:.05em .45em; margin:.1em .15em .1em 0; border-radius:6px; font-size:.74rem;
  font-family:'JetBrains Mono', monospace; color:var(--c); border:1px solid color-mix(in srgb, var(--c) 40%, transparent); }}
.ck-tag {{ display:inline-block; padding:.05em .5em; border-radius:6px; font-size:.72rem; color:var(--c);
  background:color-mix(in srgb, var(--c) 10%, transparent); font-family:'JetBrains Mono', monospace; }}
@keyframes ck-pulse {{ 0%,100% {{ opacity:1 }} 50% {{ opacity:.45 }} }}
.ck-pulse {{ animation: ck-pulse 1.4s ease-in-out infinite; }}
.ck-header {{ display:flex; align-items:center; gap:1rem; flex-wrap:wrap; padding:.2rem 0 .6rem;
  border-bottom:1px solid {BORDER}; margin-bottom:.8rem; }}
.ck-header .ck-name {{ font-family:'Space Grotesk', sans-serif; font-size:1.35rem; font-weight:700; color:{INK}; }}
.ck-header .ck-path {{ font-family:'JetBrains Mono', monospace; font-size:.72rem; color:{MUTED}; }}
.ck-stat {{ display:flex; flex-direction:column; line-height:1.1; padding:0 .8rem; border-left:1px solid {BORDER}; }}
.ck-stat span {{ font-size:.68rem; color:{MUTED}; text-transform:uppercase; letter-spacing:.06em; }}
.ck-stat b {{ font-size:1.05rem; color:{INK}; font-weight:600; }}
.ck-stepper {{ display:grid; grid-template-columns:repeat(3,1fr); gap:.6rem; margin:.4rem 0 1rem; }}
.ck-step {{ border:1px solid {BORDER}; border-radius:10px; padding:.6rem .8rem; background:{PANEL}; position:relative; overflow:hidden; }}
.ck-step.on {{ border-color:{ACCENT}; }}
.ck-step .ck-step-name {{ font-family:'Space Grotesk', sans-serif; font-weight:700; font-size:1rem; color:{INK}; }}
.ck-step .ck-step-sub {{ font-size:.78rem; color:{MUTED}; margin-top:.15rem; }}
.ck-step .ck-bar {{ position:absolute; left:0; bottom:0; height:3px; background:{ACCENT}; }}
.ck-step.done .ck-bar {{ background:#7bc47f; }}
.ck-card {{ border:1px solid {BORDER}; border-radius:10px; padding:.55rem .7rem; background:{PANEL}; margin-bottom:.5rem; }}
.ck-card.you {{ border-color:#e8b44a; }} .ck-card.failed {{ border-color:#e5534b; }} .ck-card.running {{ border-color:{ACCENT}; }}
.ck-card .ck-title {{ display:flex; justify-content:space-between; align-items:center; gap:.4rem; }}
.ck-card .ck-title b {{ color:{INK}; font-weight:600; }}
.ck-card .ck-why {{ font-size:.76rem; color:{MUTED}; margin-top:.25rem; }}
.ck-card .ck-who {{ margin-top:.25rem; }}
.ck-muted {{ color:{MUTED}; font-size:.8rem; }}
.ck-console {{ background:#140b24; border:1px solid {BORDER}; border-radius:8px; padding:.6rem .8rem; height:440px;
  overflow-y:auto; font-family:'JetBrains Mono', monospace; font-size:.76rem; line-height:1.45; white-space:pre-wrap; color:{INK}; }}
.ck-console .t {{ color:{MUTED}; }} .ck-console .e {{ color:#e5534b; }} .ck-console .ok {{ color:#7bc47f; font-weight:600; }}
.ck-console .bad {{ color:#e5534b; font-weight:600; }} .ck-console .h {{ color:{ACCENT}; font-weight:600; }}
.ck-format {{ border:1px solid {BORDER}; border-radius:12px; padding:1rem; background:{PANEL}; min-height:140px; }}
.ck-format .g {{ font-size:1.6rem; color:{ACCENT}; }}
.ck-format h4 {{ font-family:'Space Grotesk', sans-serif; margin:.3rem 0; }}
.ck-diff {{ font-family:'JetBrains Mono', monospace; font-size:.74rem; white-space:pre-wrap; background:#140b24;
  border-radius:8px; padding:.6rem; max-height:360px; overflow:auto; }}
.ck-diff .a {{ color:#7bc47f; }} .ck-diff .d {{ color:#e5534b; }} .ck-diff .m {{ color:{MUTED}; }}
</style>
"""


def inject() -> None:
    st.html(CSS)


def console_html(lines: list[str]) -> str:
    """The console box: a colour per kind of line, scrolled to the newest line on every render."""
    out = []
    for ln in lines:
        e = html.escape(ln)
        if ln.startswith("▶"):
            out.append(f'<span class="h">{e}</span>')
        elif ln.lstrip().startswith(("🔧",)):
            out.append(f'<span class="t">{e}</span>')
        elif ln.lstrip().startswith(("⚠", "⏱")) or "Error" in ln[:40]:
            out.append(f'<span class="e">{e}</span>')
        elif ln.startswith("✓ finished"):
            out.append(f'<span class="ok">{e}</span>')
        elif ln.startswith("✗ failed"):
            out.append(f'<span class="bad">{e}</span>')
        else:
            out.append(e)
    # column-reverse keeps the box pinned to its newest line without any script
    body = "\n".join(out) or '<span class="t">(no output yet)</span>'
    return (f'<div class="ck-console" style="display:flex;flex-direction:column-reverse">'
            f'<div>{body}</div></div>')


def diff_html(diff: str) -> str:
    out = []
    for ln in diff.splitlines():
        e = html.escape(ln)
        if ln.startswith("+") and not ln.startswith("+++"):
            out.append(f'<span class="a">{e}</span>')
        elif ln.startswith("-") and not ln.startswith("---"):
            out.append(f'<span class="d">{e}</span>')
        else:
            out.append(f'<span class="m">{e}</span>')
    return f'<div class="ck-diff">{chr(10).join(out)}</div>'
