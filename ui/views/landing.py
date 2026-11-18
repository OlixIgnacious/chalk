"""landing.py — the first screen: your builds, and a new build (format first, then its inputs)."""

from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

import streamlit as st

import chalk_api as api
import orchestrate
import theme
from views.common import ago, guard


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "build"


def open_build(out: Path) -> None:
    api.remember(out)
    st.session_state["out"] = str(out)
    st.rerun()


# --- the environment -----------------------------------------------------------------------------------

@st.cache_data(ttl=3600, show_spinner="Checking the machine…")
def environment() -> list[tuple[str, str]]:
    """[(level, name)] from `chalk doctor` plus the claude CLI. level is ok, warn or FAIL."""
    rows = []
    claude = shutil.which("claude")
    rows.append(("ok" if claude else "FAIL", "claude CLI (runs every agent)"))
    try:
        p = subprocess.run([*api.chalk_bin(), "doctor"], capture_output=True, text=True, timeout=120)
        for line in p.stdout.splitlines():
            m = re.match(r"^\s+(ok|warn|FAIL)\s+(.*)$", line)
            if m:
                rows.append((m.group(1), m.group(2)))
    except (OSError, subprocess.SubprocessError) as err:
        rows.append(("FAIL", f"chalk doctor did not run: {err}"))
    return rows


def sidebar_environment() -> None:
    with st.sidebar.expander("Environment", expanded=False):
        rows = environment()
        key = {"ok": "done", "warn": "you", "FAIL": "failed"}
        st.html("<br>".join(theme.pill(key[lvl], name) for lvl, name in rows))
        if st.button("Check again", key="env_again"):
            environment.clear()
            st.rerun()


def claude_ok() -> bool:
    return any(lvl == "ok" and name.startswith("claude CLI") for lvl, name in environment())


# --- the screen ----------------------------------------------------------------------------------------

def render() -> None:
    st.sidebar.html(f'<div style="padding:.2rem 0 .6rem">{theme.wordmark(28)}</div>')
    ws = st.sidebar.text_input("Workspace", key="ws", value=st.session_state.get("ws", str(Path.cwd())),
                               help="Where docs/, channel.json and the output folders live.")
    with st.sidebar.expander("Open a folder by path"):
        path = st.text_input("Output dir", key="open_path", placeholder="…/long-output/my-chapter")
        if st.button("Open", key="open_go", disabled=not path):
            out = Path(path).expanduser().resolve()
            if not out.is_dir():
                st.error("No such directory.")
            elif not api.format_of(out):
                st.error("Not a chalk output dir (no chapter.json or manifest).")
            else:
                open_build(out)
    sidebar_environment()

    st.html(f'<div class="ck-header">{theme.wordmark(34)}'
            f'<span class="ck-muted">Turn a source document into grounded teaching.</span></div>')
    builds_table(ws)
    st.divider()
    wizard(Path(ws).expanduser())


def builds_table(ws: str) -> None:
    rows = api.builds(ws)
    st.subheader("Your builds")
    if not rows:
        st.caption("No builds in this workspace yet. Start one below.")
        return
    for r in rows[:12]:
        label, key = theme.PHASE_STYLE.get(r["phase"], (r["phase"], "todo"))
        c1, c2, c3, c4 = st.columns([5, 3, 2, 1], vertical_alignment="center")
        c1.html(f'<b>{r["name"]}</b> {theme.tag(api.FORMATS[r["format"]]["label"])}'
                f'<div class="ck-muted">{r["out"]}</div>')
        c2.html(theme.pill(key, label))
        c3.html(f'<div class="ck-muted">{ago(r["updated"])} · {api.fmt_tokens(r["tokens"])} tokens · ~${r["cost"]:.2f}'
                f'{" · eval " + str(r["eval"]) + "%" if r["eval"] is not None else ""}</div>')
        if c4.button("Open", key=f"open_{r['out']}"):
            open_build(Path(r["out"]))


def wizard(workspace: Path) -> None:
    st.subheader("New build")
    st.caption("1 · What should chalk make?")
    cols = st.columns(3)
    pick = st.session_state.get("wiz_fmt")
    for col, (k, f) in zip(cols, api.FORMATS.items()):
        with col:
            on = " style=\"border-color:#ff6a2b\"" if pick == k else ""
            st.html(f'<div class="ck-format"{on}><div class="g">{f["glyph"]}</div><h4>{f["label"]}</h4>'
                    f'<div class="ck-muted">{f["blurb"]}</div></div>')
            if st.button("✓ Selected" if pick == k else f"Choose {f['label'].split(' /')[0].lower()}", key=f"fmt_{k}",
                         type="primary" if pick == k else "secondary", width="stretch"):
                st.session_state["wiz_fmt"] = k
                st.rerun()
    if not pick:
        st.caption("Pick an output to continue.")
        return
    inputs(pick, workspace)


def inputs(fmt: str, workspace: Path) -> None:
    st.caption(f"2 · Inputs for the {api.FORMATS[fmt]['label'].lower()}")
    a, b = st.columns(2, gap="large")
    with a:
        up = st.file_uploader("Source document", type=api.INGESTS, key="upload",
                              help="One chapter. Markdown, text, EPUB or PDF (scanned PDFs need tesseract).")
        doc_path = st.text_input("…or its path", key="doc", placeholder="docs/chapter-01.md")
        doc, note = None, None
        if up is not None:
            got = guard(api.save_upload, workspace, up.name, up.getvalue())
            if got:
                doc, note = got
        elif doc_path:
            d = Path(doc_path).expanduser()
            d = d if d.is_absolute() else workspace / d
            if d.exists():
                doc = d
            else:
                st.error("Source document not found.")
        if note:
            st.warning(note)
        if doc:
            st.caption(f"Source: `{doc}`")
            mine = st.checkbox("This is my own script", key="kind_script",
                               help="Your narration, its lines its blocks: the source check reads it hardest. Add [ref: url | retrieved date | \"quote\"] after a line to attach its evidence.")
        topic = None if doc else (st.text_input("…or a topic to research", key="topic",
                                                placeholder="the city library's new evening hours",
                                                help="No document: the research agent writes a brief from fetched pages, a reference per paragraph, and you approve it first.") or None)
        # a keyed widget ignores value= after its first render, so fill the name from the document here,
        # until the person types one of their own
        auto = slugify(doc.stem) if doc else slugify(topic) if topic else ""
        if st.session_state.get("slug_auto", "") == st.session_state.get("slug", ""):
            st.session_state["slug"] = auto
        st.session_state["slug_auto"] = auto
        slug = st.text_input("Name (output folder)", key="slug")
        out = (workspace / api.FORMATS[fmt]["root"] / slugify(slug)).resolve() if slug else None
        if out:
            st.caption(f"→ `{out}`" + ("  · exists: Start resumes it" if (out / ".chalk").exists() else ""))
    with b:
        default_channel = workspace / "channel.json"
        channel = st.text_input("channel.json", key="channel", value=str(default_channel) if default_channel.exists() else "",
                                help="Voice, series and banned terms. Optional for a lesson.")
        audience = st.text_input("Audience", key="audience",
                                 placeholder="people preparing for coding interviews who know basic Python")
        cfg = {"format": fmt, "workspace": str(workspace), "doc": str(doc) if doc else None, "topic": topic,
               "kind": "script" if doc and st.session_state.get("kind_script") else None,
               "channel": channel or None, "audience": audience or None}
        if fmt == "long":
            cfg["notebook"] = st.checkbox("Follow-along notebook", key="notebook")
        if fmt in ("long", "lesson"):
            cfg["segments"] = int(st.number_input("Parts (0 = let the outline decide)", 0, 20, 0, key="segments")) or None
        if fmt == "short":
            cfg["idea"] = st.text_input("The one idea", key="idea", placeholder="a set checks each value once") or None
        with st.expander("More options"):
            cfg["direction"] = st.text_area("Direction", key="direction", placeholder="assume they have never seen recursion") or None
            c1, c2 = st.columns(2)
            cfg["jobs"] = int(c1.number_input("Parallel agents", 1, 8, 3, key="jobs"))
            cfg["max_tokens"] = int(c2.number_input("Budget, tokens (0 = none)", 0, 500_000_000, 0, step=1_000_000,
                                                    key="max_tokens", help="Stop before the next agent past this many tokens.")) or None
            cfg["max_usd"] = float(c2.number_input("Budget, est. $ (0 = none)", 0.0, 500.0, 0.0, step=1.0, key="max_usd",
                                                   help=api.COST_NOTE)) or None
            cfg["model"] = st.text_input("Model for agents (blank = default)", key="model") or None

    missing = [n for n, v in (("a source document or a topic", doc or topic), ("a name", out)) if not v]
    if not claude_ok():
        st.error("The `claude` CLI is not on PATH: every agent runs through it. Install Claude Code, then Check again.")
    if st.button("▶ Start the build", type="primary", disabled=bool(missing) or not claude_ok(), key="start_new"):
        out.mkdir(parents=True, exist_ok=True)
        have = api.config(out)
        if have and have.get("format") != fmt:
            st.error(f"{out} was built as {have['format']}; pick another name.")
            return
        api.save_config(out, {**have, **{k: v for k, v in cfg.items() if v is not None}})
        if guard(orchestrate.start, out):
            open_build(out)
    elif missing:
        st.caption("Needs " + " and ".join(missing) + ".")
