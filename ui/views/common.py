"""common.py — what every view shares: guarded calls, cached status, and a cell's display status."""

from __future__ import annotations

import time
from pathlib import Path

import streamlit as st

import chalk_api as api


def guard(fn, *args, ok: str | None = None, **kw):
    """Run an action; show its failure as an error on the page, never as a traceback."""
    try:
        r = fn(*args, **kw)
    except Exception as err:  # noqa: BLE001 — anything an action raises is the person's to read
        st.error(f"{err}")
        return None
    if ok:
        st.toast(ok)
    return r if r is not None else True


@st.cache_data(ttl=60, show_spinner=False)
def _status(out: str, fmt: str, fp: tuple) -> dict:
    return api.status(out, fmt)


def status(out: Path, fmt: str) -> dict:
    """`chalk status --json`, recomputed only when a file under out changed (or a minute passed)."""
    return _status(str(out), fmt, api.fingerprint(out))


def refresh_status() -> None:
    _status.clear()


def running_cells(out: Path) -> set[tuple[str, str | None]]:
    run = api.run_state(out)
    if not api.driver_running(out):
        return set()
    cur = set(run.get("current", []))
    return {(s["stage"], s.get("nn")) for s in api.steps(out) if s["id"] in cur}


def failed_cells(out: Path) -> set[tuple[str, str | None]]:
    """Cells whose latest run failed (a stage that later succeeded is not failed)."""
    last: dict[tuple, object] = {}
    for s in api.steps(out):
        if s["stage"] != "pipeline" and s.get("ended"):
            last[(s["stage"], s.get("nn"))] = s.get("rc")
    return {k for k, rc in last.items() if rc not in (0, None)}


def cell_key(stage: dict, cell: dict, running: set, failed: set) -> str:
    """theme.STATUS key for one cell."""
    k = (stage["name"], cell["nn"])
    if k in running:
        return "running"
    if cell["status"] == "done":
        return "done"
    if k in failed:
        return "failed"
    if cell.get("after"):
        return "blocked"
    if cell["status"] == "stale":
        return "stale"
    if cell["status"] == "waiting":
        return {"approve": "you", "gate": "you", "author": "agent"}.get(stage["kind"], "blocked")
    return "todo"


def ago(t: float | None) -> str:
    if not t:
        return "—"
    s = int(time.time() - t)
    for n, unit in ((86400, "d"), (3600, "h"), (60, "m")):
        if s >= n:
            return f"{s // n}{unit} ago"
    return f"{s}s ago"


def dur(s: float) -> str:
    s = int(s)
    if s >= 3600:
        return f"{s // 3600}h{s % 3600 // 60:02d}m"
    return f"{s // 60}m{s % 60:02d}s" if s >= 60 else f"{s}s"
