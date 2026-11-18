"""gate.py — the two moments the build waits for you: read (and fix) the scripts, then watch the result.

Shown only when the live board's blocker is an approve stage, never because a driver last said so, and
Approve re-checks that before it records anything (api.approve_gate).
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

import chalk_api as api
import chat
import orchestrate
import serve
import theme
from views.common import guard, refresh_status

GATE_TEXT = {
    "research-approved": "Read the brief chalk researched: every paragraph should say only what its quoted sentence says. "
                         "Approving makes it the source every line of the video is grounded in.",
    "scripts-approved": "Read the plan, the scripts and the grounding report. Fix anything here, or ask the agent that "
                        "wrote them for changes. Approving starts the voice, frames and render: the slow, costly part.",
    "watched": "Watch the result against the resolution list, then approve it as watched.",
}


def render(out: Path, fmt: str, gate: str) -> None:
    with st.container(border=True):
        st.html(f'<div class="ck-title" style="display:flex;gap:.6rem;align-items:center">{theme.pill("you")}'
                f'<span style="font-family:Space Grotesk;font-size:1.25rem;font-weight:700">{api.GATE_TITLES[gate]}</span></div>')
        st.caption(GATE_TEXT[gate])
        diffs = api.changes_since_approval(out, fmt, gate)
        if diffs:
            with st.expander(f"Changed since you last approved ({len(diffs)} file{'s' * (len(diffs) > 1)})", expanded=True):
                for rel, d in diffs:
                    st.markdown(f"`{rel}`")
                    st.html(theme.diff_html(d))
        panes = api.FORMATS[fmt]["gates"][gate]
        tabs = st.tabs([label for label, _ in panes])
        for tab, (label, f) in zip(tabs, panes):
            with tab:
                pane(out, fmt, gate, f)
        st.divider()
        if gate == "scripts-approved":
            request_changes(out, fmt)
        a, b = st.columns([1, 3], vertical_alignment="center")
        what = {"research-approved": "research brief", "scripts-approved": "scripts"}.get(gate, "watched")
        if a.button(f"✓ Approve {what}", type="primary", key=f"approve_{gate}", width="stretch"):
            if guard(api.approve_gate, out, fmt, gate, ok=f"Approved {what}"):
                refresh_status()
                guard(orchestrate.start, out)  # after "watched", one more pass marks the build done
                st.rerun()
        b.caption("Approval records exactly these files. Change one afterwards and the build stops here again, "
                  "with a diff of what changed.")


def pane(out: Path, fmt: str, gate: str, f: str) -> None:
    if f == "@scripts":
        scripts(out, gate)
    elif f == "@final":
        watch(out, fmt)
    elif f == "@lesson":
        lesson(out)
    else:
        doc(out, f, editable=gate == "scripts-approved", key=f"{gate}_{f}")


def doc(out: Path, name: str, *, editable: bool, key: str) -> None:
    p = out / name
    if not p.exists():
        st.caption(f"{name} is not written yet.")
        return
    body = p.read_text(errors="replace")
    if editable and st.toggle("Edit", key=f"edit_{key}"):
        editor(p, body, key)
    elif name.endswith(".json"):
        if name == "lesson.json":
            checkpoints(body)
        st.code(body, language="json")
    else:
        st.markdown(body)


def editor(p: Path, body: str, key: str) -> None:
    new = st.text_area(p.name, body, height=460, key=f"ta_{key}", label_visibility="collapsed")
    c1, c2 = st.columns([1, 4], vertical_alignment="center")
    if c1.button("Save", key=f"save_{key}", type="primary", disabled=new == body):
        if p.suffix == ".json":
            try:
                json.loads(new)
            except ValueError as err:
                st.error(f"Not valid JSON: {err}")
                return
        api.write_text(p, new if new.endswith("\n") else new + "\n")
        refresh_status()
        st.toast(f"Saved {p.name}")
        st.rerun(scope="app")
    c2.caption("Saving makes the text gates and the grounding check run again before approval. "
               "Press **Re-check** below when you are done editing.")


def checkpoints(body: str) -> None:
    try:
        segs = json.loads(body).get("segments", [])
    except ValueError:
        return
    for s in segs:
        cp = s.get("checkpoint") or {}
        if cp:
            st.markdown(f"**{s.get('id')} · {s.get('title', '')}**  \n{cp.get('question', cp)}")


def scripts(out: Path, gate: str) -> None:
    segs = sorted(out.glob("segments/*/script.md"))
    if not segs:
        st.caption("No scripts yet.")
        return
    names = [p.parent.name for p in segs]
    nn = st.radio("Segment", names, horizontal=True, key=f"{gate}_seg", label_visibility="collapsed")
    doc(out, f"segments/{nn}/script.md", editable=gate == "scripts-approved", key=f"{gate}_script_{nn}")


def request_changes(out: Path, fmt: str) -> None:
    writers = [s for s in api.steps(out) if s["stage"] == "scripts" and s.get("session") and s.get("rc") == 0]
    with st.expander("Ask for changes, or re-check your edits", expanded=False):
        fb = st.text_area("What should change?", key="rc_text", height=110,
                          placeholder="Part 2 explains the set before showing the brute force; swap them. "
                                      "Cut the second example in part 4.")
        c1, c2, c3 = st.columns([1, 1, 2], vertical_alignment="center")
        if c1.button("Ask the scripts agent", key="rc_go", disabled=not (fb.strip() and writers)):
            sid = guard(chat.request_changes, out, fmt, fb, ok="Sent: the agent will edit, then the build re-checks")
            if sid:
                st.session_state["chat_pick"] = sid
                st.rerun(scope="app")
        if c2.button("Re-check", key="rc_check", help="Run the text gates and the grounding agent on the files as they are now"):
            if guard(orchestrate.start, out):
                st.rerun(scope="app")
        c3.caption("The agent resumes its own session with your note. The text gates and grounding then run again, "
                   "and the build stops here once more." if writers else
                   "These scripts were not written from the UI, so there is no session to resume: edit them above.")


def watch(out: Path, fmt: str) -> None:
    final = out / api.FORMATS[fmt]["final"]
    if not final.exists():
        st.caption(f"{final.name} is not there yet.")
        return
    v, side = st.columns([3, 2], gap="large")
    with v:
        st.video(str(final), start_time=int(st.session_state.get(f"seek_{out}", 0)))
    with side:
        chapters = out / "chapters.txt"
        if chapters.exists():
            st.caption("Chapters")
            for i, line in enumerate(chapters.read_text().splitlines()):
                m = re.match(r"^(\d+):(\d\d)(?::(\d\d))?\s+(.*)$", line.strip())
                if not m:
                    continue
                h, mm, ss = (0, int(m[1]), int(m[2])) if m[3] is None else (int(m[1]), int(m[2]), int(m[3]))
                if st.button(f"{line.strip()}", key=f"seek_btn_{i}", width="stretch"):
                    st.session_state[f"seek_{out}"] = h * 3600 + mm * 60 + ss
                    st.rerun()
        checklist(out)
    stills(out)


def checklist(out: Path) -> None:
    res = out / "resolution.md"
    if not res.exists():
        return
    items = re.findall(r"^\s*(?:\d+\.|[-*])\s+(.+)$", res.read_text(errors="replace"), flags=re.M)[:20]
    if not items:
        return
    saved = api.read_json(api.ui_dir(out) / "watch.json", {})
    st.caption("Resolution checklist")
    changed = False
    for i, it in enumerate(items):
        v = st.checkbox(it[:160], value=saved.get(it, False), key=f"watch_{i}")
        if v != saved.get(it, False):
            saved[it] = v
            changed = True
    if changed:
        api.write_json(api.ui_dir(out) / "watch.json", saved)


def stills(out: Path) -> None:
    pngs = sorted((out / "work/stills").glob("*.png"))
    if not pngs:
        return
    st.caption("Stills, one sheet per segment")
    cols = st.columns(3)
    for i, p in enumerate(pngs):
        with cols[i % 3]:
            st.image(str(p), caption=f"segment {p.stem}")
            if st.button(f"Redo frames {p.stem}", key=f"redo_frames_{p.stem}", width="stretch",
                         help="Rewrite this segment's frame spec with the frames agent, then rebuild and re-render it"):
                from views.build import rerun_agent  # noqa: PLC0415
                rerun_agent(out, "frame-spec", p.stem)


def lesson(out: Path) -> None:
    page = out / "lesson.html"
    if not page.exists():
        st.caption("lesson.html is not built yet.")
        return
    url = serve.url_for(out)
    components.iframe(url, height=760, scrolling=True)
    st.caption(f"Served from this machine only: {url}")
