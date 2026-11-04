"""outputs.py — everything the build has written, as it appears: plan, reports and eval, media, the kit."""

from __future__ import annotations

from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

import chalk_api as api
import orchestrate
import serve
import theme
from views.common import guard, refresh_status

REPORTS = ["grounding.md", "learner.md", "notebook-review.md", "review.md", "resolution.md"]


def render(out: Path, fmt: str, gate_open: bool) -> None:
    st.subheader("Outputs")
    names = (["Plan"] if not gate_open else []) + ["Eval", "Reports", "Media", "Kit"]
    tabs = dict(zip(names, st.tabs(names)))
    if "Plan" in tabs:
        with tabs["Plan"]:
            plan(out, fmt)
    with tabs["Eval"]:
        scorecard(out, fmt)
    with tabs["Reports"]:
        reports(out)
    with tabs["Media"]:
        media(out, fmt)
    with tabs["Kit"]:
        kit(out)


def plan(out: Path, fmt: str) -> None:
    a, b = st.columns(2, gap="large")
    with a:
        f = out / api.FORMATS[fmt]["plan"]
        if not f.exists():
            st.caption(f"{f.name} is not written yet.")
        elif f.suffix == ".json":
            st.code(f.read_text(errors="replace"), language="json")
        else:
            st.markdown(f.read_text(errors="replace"))
    with b:
        segs = sorted(out.glob("segments/*/script.md"))
        if not segs:
            st.caption("No scripts yet.")
            return
        nn = st.radio("Segment", [p.parent.name for p in segs], horizontal=True, key="out_seg")
        st.markdown((out / f"segments/{nn}/script.md").read_text(errors="replace"))


def scorecard(out: Path, fmt: str) -> None:
    rep = api.record_eval(out)
    if not rep:
        st.caption("The eval runs after delivery.")
        return
    delta = None if rep.get("previous") is None else rep["percent"] - rep["previous"]
    c1, c2, c3 = st.columns([1, 1, 3])
    c1.metric("Score", f"{rep['percent']}%", delta=f"{delta:+d} pts" if delta else None)
    c2.metric("Points", f"{rep['score']}/{rep['max']}")
    c3.html(" ".join(theme.pill({"pass": "done", "fail": "failed", "skip": "todo", "accepted": "accepted"}[s], g)
                     for g, s in rep.get("groups", {}).items()))
    order = {"fail": 0, "accepted": 1, "pass": 2, "skip": 3}
    results = sorted(rep.get("results", []), key=lambda r: order.get(r["status"], 9))
    for r in results:
        key = {"pass": "done", "fail": "failed", "skip": "todo", "accepted": "accepted"}[r["status"]]
        with st.expander(f"{r['id']} · {r['title']}", expanded=r["status"] == "fail"):
            st.html(f"{theme.pill(key)} {theme.tag(r.get('group', ''))} {theme.tag('weight ' + str(r.get('weight')))}")
            for e in (r.get("evidence") or [])[:12]:
                st.markdown(f"- {e}")
            if r["status"] == "fail":
                why = st.text_input("Keep this failure because…", key=f"acc_{r['id']}")
                if st.button("Accept", key=f"accb_{r['id']}", disabled=not why.strip()):
                    if guard(api.accept, out, fmt, r["id"], why, ok=f"Accepted {r['id']}"):
                        refresh_status()
                        st.rerun()
            elif r["status"] == "accepted":
                st.caption(f"Accepted: {r.get('reason', '')}")
                if st.button("Remove acceptance", key=f"unacc_{r['id']}"):
                    guard(api.unaccept, out, fmt, r["id"])
                    refresh_status()
                    st.rerun()
    if rep.get("stale"):
        st.warning("Accepted but passing now, so the acceptance can go: " + ", ".join(rep["stale"]))
        for cid in rep["stale"]:
            if st.button(f"Remove {cid}", key=f"stale_{cid}"):
                guard(api.unaccept, out, fmt, cid)
                st.rerun()
    accepted_in = api.accepts_file(out, fmt).name
    st.caption(f"Acceptances live in {accepted_in}. They apply the next time the eval runs.")
    if st.button("Rerun the eval now", key="rerun_eval", disabled=api.driver_running(out),
                 help="Rerun from the eval stage: the eval, then the reviewers that read it"):
        if guard(orchestrate.start, out, {"from": "eval"}):
            st.rerun(scope="app")


def reports(out: Path) -> None:
    have = [n for n in REPORTS if (out / n).exists()] + (["eval.md"] if (out / "eval.md").exists() else [])
    if not have:
        st.caption("No reports yet. The grounding check writes the first one, before your review.")
        return
    for tab, n in zip(st.tabs(have), have):
        with tab:
            st.markdown((out / n).read_text(errors="replace"))


def media(out: Path, fmt: str) -> None:
    shown = False
    final = out / api.FORMATS[fmt]["final"]
    if final.exists():
        st.markdown(f"**{final.name}**")
        st.video(str(final))
        shown = True
    if fmt == "lesson" and (out / "lesson.html").exists():
        st.markdown("**lesson.html**")
        components.iframe(serve.url_for(out), height=720, scrolling=True)
        shown = True
    stills = sorted((out / "work/stills").glob("*.png"))
    if stills:
        st.markdown("**Stills**")
        cols = st.columns(3)
        for i, p in enumerate(stills):
            cols[i % 3].image(str(p), caption=f"segment {p.stem}")
        shown = True
    segs = sorted(out.glob("segments/*/segment.mp4"))
    if segs:
        nn = st.radio("Segment video", [p.parent.name for p in segs], horizontal=True, key="segvid")
        st.video(str(out / f"segments/{nn}/segment.mp4"))
        shown = True
    if not shown:
        st.caption("Nothing rendered yet.")


def kit(out: Path) -> None:
    files = [n for n in ["captions.srt", "chapters.txt", "description.txt", "plan.md", "notebook.ipynb", "thumbnail.png"]
             if (out / n).exists()]
    if not files:
        st.caption("The upload kit is written at delivery.")
        return
    for n in files:
        f = out / n
        c1, c2 = st.columns([5, 1], vertical_alignment="center")
        if n in ("chapters.txt", "description.txt"):
            c1.text_area(n, f.read_text(errors="replace"), height=140, key=f"kit_{n}")
        elif n == "thumbnail.png":
            c1.image(str(f), caption=n, width=420)
        else:
            c1.markdown(f"`{n}` · {f.stat().st_size // 1024} KB")
        c2.download_button("Download", f.read_bytes(), file_name=n, key=f"dl_{n}", width="stretch")
