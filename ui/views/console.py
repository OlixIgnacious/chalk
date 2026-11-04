"""console.py — what the agents are saying: a tab per running step, newest line always in view."""

from __future__ import annotations

import time
from pathlib import Path

import streamlit as st

import chalk_api as api
import theme
from views.common import dur

TAIL = 400


def label(s: dict, running: bool) -> str:
    rc = s.get("rc")
    mark = "◐" if running else "✓" if rc == 0 else "⏸" if rc == 3 else "✕" if rc not in (None,) else "·"
    seg = f" {s['nn']}" if s.get("nn") else ""
    who = s["who"].replace("chalk-", "") if s["stage"] != "pipeline" else "pipeline"
    return f"{mark} {who}{seg}"


def render(out: Path) -> None:
    steps = api.steps(out)
    if not steps:
        st.caption("Nothing has run yet.")
        return
    cur = set(api.run_state(out).get("current", [])) if api.driver_running(out) else set()
    live = [s for s in steps if s["id"] in cur]
    agents_live = [s for s in live if s["stage"] != "pipeline"]
    shown = agents_live or live
    if shown:
        tabs = st.tabs([label(s, True) for s in shown])
        for tab, s in zip(tabs, shown):
            with tab:
                show(s, running=True)
    else:
        # nothing running: the latest agent step, with a picker for the rest
        recent = list(reversed(steps))
        default = next((s for s in recent if s["stage"] != "pipeline"), recent[0])
        names = {s["id"]: label(s, False) + f"  ·  {s['id'][:3]}" for s in recent}
        pick = st.selectbox("Step", list(names), index=list(names).index(default["id"]), format_func=names.get,
                            key=f"console_pick_{len(steps)}", label_visibility="collapsed")  # follows new steps
        show(next(s for s in steps if s["id"] == pick), running=False)


def show(s: dict, running: bool) -> None:
    log = Path(s["log"])
    text = log.read_text(errors="replace") if log.exists() else ""
    lines = text.splitlines()
    st.html(theme.console_html(lines[-TAIL:]))
    bits = []
    if s.get("ended"):
        bits.append(dur(s["ended"] - s["started"]))
    elif running:
        bits.append(f"running {dur(time.time() - s['started'])}")
    if s.get("usage"):
        bits.append(f"{api.fmt_tokens(api.tokens(s['usage']))} tokens")
    if s.get("cost"):
        bits.append(f"~${s['cost']:.2f} est.")
    if s.get("rc") not in (None, 0):
        bits.append(f"exit {s['rc']}")
    st.caption(" · ".join(bits) + (f" · showing the last {TAIL} of {len(lines)} lines" if len(lines) > TAIL else ""))
    if not running and lines:
        c1, c2 = st.columns(2)
        c1.download_button("Log", text, file_name=log.name, key=f"dl_log_{s['id']}", width="stretch")
        raw = Path(str(log).removesuffix(".log") + ".jsonl")
        if raw.exists():
            c2.download_button("Raw stream", raw.read_bytes(), file_name=raw.name, key=f"dl_raw_{s['id']}",
                               width="stretch")
