"""build.py — one build: header and controls, the Plan → Build → Check stepper, stage cards, the agents'
console and chat, what failed, reruns, questions, money and settings, then the outputs."""

from __future__ import annotations

import html
import json
import shutil
import time
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

import chalk_api as api
import chat as chat_backend
import launchers
import orchestrate
import theme
from views import chat as chat_view
from views import console, gate, outputs
from views.common import cell_key, dur, failed_cells, guard, refresh_status, running_cells, status


# --- actions -------------------------------------------------------------------------------------------

def rerun_from(out: Path, stage: str, only: list[str] | None = None) -> None:
    if guard(orchestrate.start, out, {"from": stage, "only": only or None}):
        refresh_status()
        st.rerun(scope="app")


def move_aside(out: Path, stage: str, nns: list[str | None]) -> list[str]:
    """Move an author stage's outputs (for those segments; [None] = all) to .chalk/ui/prev/<time>/."""
    st_json = api.status(out, api.format_of(out))
    row = next((s for s in st_json["stages"] if s["name"] == stage), None)
    if not row:
        raise RuntimeError(f"no stage {stage}")
    dest = api.ui_dir(out) / "prev" / time.strftime("%Y%m%d-%H%M%S")
    moved = []
    for c in row["cells"]:
        if None not in nns and c["nn"] not in nns:
            continue
        for rel in c.get("outputs", []):
            src = out / rel
            if src.exists():
                (dest / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(dest / rel))
                moved.append(rel)
    return moved


def rerun_agent(out: Path, stage: str, nns: list[str] | str | None = None) -> None:
    """Move an author stage's output aside, so the stage waits and the driver runs its agent again."""
    nns = [nns] if isinstance(nns, str) else (nns or [None])
    moved = guard(move_aside, out, stage, nns)
    if moved is None:
        return
    if moved is True or not moved:
        st.warning("Nothing to move aside: that stage has no output yet.")
        return
    st.toast(f"Kept the old {', '.join(moved)} in .chalk/ui/prev/")
    if guard(orchestrate.start, out):
        refresh_status()
        st.rerun(scope="app")


# --- header --------------------------------------------------------------------------------------------

@st.fragment(run_every=3)
def header(out: Path, fmt: str) -> None:
    run = api.run_state(out)
    ph = api.phase(out)
    gate_name = api.open_gate(status(out, fmt))
    if gate_name and ph not in ("running",):
        ph = "gate"  # the live board decides; a dir opened at a gate is at the gate whatever run.json says
    label, key = theme.PHASE_STYLE.get(ph, (ph, "todo"))
    msg = run.get("message") or ""
    if ph == "gate" and gate_name:
        msg = api.GATE_TITLES[gate_name]
    elif ph == "running":
        cur = [s for s in api.steps(out) if s["id"] in run.get("current", []) and s["stage"] != "pipeline"]
        if cur:
            msg = " · ".join(f"{s['who']}{' ' + s['nn'] if s.get('nn') else ''} ({dur(time.time() - s['started'])})" for s in cur)
    t = api.totals(out)
    rep = api.eval_report(out)
    nq = len(api.open_questions(out))
    cfg = api.config(out)
    stats = [("Tokens", api.fmt_tokens(t["tokens"]) + (f" / {api.fmt_tokens(int(cfg['max_tokens']))}" if cfg.get("max_tokens") else ""),
              "Claude tokens processed by agents and chat (input, cache and output). Closest measure of plan usage."),
             ("Est. API cost", f"~${t['cost']:.2f}" + (f" / ${float(cfg['max_usd']):.0f}" if cfg.get("max_usd") else ""), api.COST_NOTE),
             ("Time", dur(t["elapsed"]), ""), ("Eval", f"{rep['percent']}%" if rep else "—", ""),
             ("Questions", str(nq), "")]
    left, right = st.columns([5, 2], vertical_alignment="center")
    with left:
        st.html(
            f'<div class="ck-header" style="border:0;margin:0;padding:0">{theme.wordmark(26)}'
            f'<div><div class="ck-name">{html.escape(out.name)} {theme.tag(api.FORMATS[fmt]["label"], theme.ACCENT)}</div>'
            f'<div class="ck-path">{html.escape(str(out))}</div></div>'
            + "".join(f'<div class="ck-stat" title="{html.escape(tip)}"><span>{k}{" ⓘ" if tip else ""}</span><b>{v}</b></div>'
                      for k, v, tip in stats)
            + "</div>"
            f'<div style="margin-top:.5rem">{theme.pill(key, label)} <span class="ck-muted">{html.escape(msg)}</span></div>')
    with right:
        controls(out, fmt, ph)
    watch_phase(out, ph, gate_name)


def controls(out: Path, fmt: str, ph: str) -> None:
    running = api.driver_running(out)
    c1, c2, c3 = st.columns(3)
    has_cfg = bool(api.config(out).get("format"))
    if c1.button("▶ Resume" if (out / ".chalk" / "pipeline.json").exists() else "▶ Start", type="primary",
                 disabled=running or not has_cfg or ph == "gate", key="ctl_start", width="stretch",
                 help=None if has_cfg else "Built outside the UI: set it up under Build settings first"):
        if guard(orchestrate.start, out):
            st.rerun(scope="app")
    if c2.button("■ Stop", disabled=not running, key="ctl_stop", width="stretch"):
        if not guard(orchestrate.stop, out):
            st.warning("That process is not this build's driver; nothing was stopped.")
        st.rerun(scope="app")
    if c3.button("← Builds", key="ctl_back", width="stretch"):
        st.session_state.pop("out", None)
        st.rerun(scope="app")


def watch_phase(out: Path, ph: str, gate_name: str | None) -> None:
    """On a change of phase (or of gate): tell the person, retitle the tab, and redraw the whole page."""
    sig = (ph, gate_name)
    last = st.session_state.get("phase_sig")
    st.session_state["phase_sig"] = sig
    title = {"gate": "✋ chalk · your turn", "failed": "✕ chalk · stopped", "crashed": "✕ chalk · stopped",
             "done": "✓ chalk · done", "running": "◐ chalk · running"}.get(ph, "chalk")
    components.html(f"<script>parent.document.title = {json.dumps(title + ' · ' + out.name)}</script>", height=0)
    if last is not None and last != sig:
        if ph in ("gate", "failed", "done", "crashed"):
            st.toast({"gate": "✋ Your turn", "failed": "✕ The build stopped", "crashed": "✕ The driver stopped",
                      "done": "✓ Build done"}[ph])
        refresh_status()
        st.rerun(scope="app")


# --- the board -----------------------------------------------------------------------------------------

@st.fragment(run_every=3)
def board(out: Path, fmt: str) -> None:
    try:
        st_json = status(out, fmt)
    except Exception as err:  # noqa: BLE001
        st.error(f"chalk status failed: {err}")
        return
    running, failed = running_cells(out), failed_cells(out)
    rows = [(s, [cell_key(s, c, running, failed) for c in s["cells"]]) for s in st_json["stages"]]
    stepper(rows)
    pick = st.segmented_control("Show", ["All", *[p for p, _ in theme.PHASES]], default="All", key="phase_filter",
                                label_visibility="collapsed")
    cards = []
    blocked = []
    for s, keys in rows:
        if pick and pick != "All" and theme.phase_of(s["name"]) != pick:
            continue
        if keys and all(k == "blocked" for k in keys):
            blocked.append(s["name"])
            continue
        cards.append(card(s, keys, st_json["segments"]))
    grid = st.columns(3)
    for i, c in enumerate(cards):
        grid[i % 3].html(c)
    if blocked:
        st.html(f'<div class="ck-muted">{theme.pill("blocked", str(len(blocked)) + " waiting behind earlier stages")} '
                f'{html.escape(", ".join(blocked))}</div>')


def overall(keys: list[str]) -> str:
    for k in ("running", "failed", "you", "agent", "stale", "todo", "blocked"):
        if k in keys:
            return k
    return "done" if keys else "todo"


def stepper(rows) -> None:
    cells = []
    for name, stages in theme.PHASES:
        mine = [(s, k) for s, k in rows if s["name"] in stages]
        if not mine:
            continue
        done = sum(1 for _, k in mine if k and all(x == "done" for x in k))
        active = [s["name"] for s, k in mine if overall(k) in ("running", "failed", "you", "agent", "stale", "todo")]
        now = overall([overall(k) for _, k in mine])
        cls = "done" if done == len(mine) else "on" if now in ("running", "you", "agent", "failed") else ""
        sub = f"{done}/{len(mine)} stages" + (f" · {active[0]}" if active and cls != "done" else "")
        cells.append(f'<div class="ck-step {cls}"><div class="ck-step-name">{name} {theme.pill(now)}</div>'
                     f'<div class="ck-step-sub">{html.escape(sub)}</div>'
                     f'<div class="ck-bar" style="width:{100 * done // len(mine)}%"></div></div>')
    st.html(f'<div class="ck-stepper">{"".join(cells)}</div>')


def card(s: dict, keys: list[str], segments: list[str]) -> str:
    k = overall(keys)
    who = launchers.who(s["name"])
    if s["kind"] == "approve":
        who_html = theme.tag("you", "#e8b44a")
    elif who and who.startswith("chalk-"):
        who_html = theme.tag(f"agent · {who}", "#6ea8fe")
    elif who:
        who_html = theme.tag(who, "#6ea8fe")
    else:
        who_html = theme.tag("pipeline")
    if s["per"]:
        if not s["cells"]:
            detail = "per segment, once the scripts exist"
            k = "todo"
        else:
            detail = "".join(theme.chip(c["nn"], kk, title=c.get("why") or c["status"]) for c, kk in zip(s["cells"], keys))
            detail = f'<div>{detail}</div>'
    else:
        c = s["cells"][0] if s["cells"] else {}
        detail = html.escape(("after " + c["after"]) if c.get("after") else (c.get("why") or "")) if k != "done" else ""
    cls = {"you": "you", "failed": "failed", "running": "running"}.get(k, "")
    why = detail if detail.startswith("<div>") else f'<div class="ck-why">{detail}</div>' if detail else ""
    return (f'<div class="ck-card {cls}"><div class="ck-title"><b>{html.escape(s["name"])}</b>{theme.pill(k)}</div>'
            f'<div class="ck-who">{who_html}</div>{why}</div>')


@st.fragment(run_every=2)
def console_live(out: Path) -> None:
    console.render(out)


# --- panels --------------------------------------------------------------------------------------------

def failure(out: Path, fmt: str) -> None:
    ph = api.phase(out)
    if ph not in ("failed", "crashed"):
        return
    run = api.run_state(out)
    bad = [s for s in api.steps(out) if s.get("rc") not in (0, 3, None)]
    last = bad[-1] if bad else None
    with st.container(border=True):
        st.html(f'{theme.pill("failed", "Stopped")} <b>{html.escape(run.get("message") or "the driver stopped unexpectedly")}</b>')
        if ph == "crashed":
            log = api.ui_dir(out) / "driver.log"
            if log.exists():
                st.html(theme.console_html(log.read_text(errors="replace").splitlines()[-40:]))
        elif last:
            st.caption(f"{last['who']}{' · segment ' + last['nn'] if last.get('nn') else ''} · exit {last['rc']}")
            p = Path(last["log"])
            text = p.read_text(errors="replace") if p.exists() else ""
            fixes = caption_fixes(out, text) + eval_fixes(out, fmt, text)
            with st.expander("Log", expanded=not fixes):
                st.html(theme.console_html(text.splitlines()[-60:]))
        c1, c2, c3, _ = st.columns([1, 1, 1, 2])
        if c1.button("↻ Retry", type="primary", key="fail_retry", disabled=api.driver_running(out)):
            if guard(orchestrate.start, out):
                st.rerun()
        if last and last.get("nn") and c2.button(f"↻ Retry segment {last['nn']}", key="fail_retry_seg"):
            rerun_from(out, last["stage"] if last["stage"] != "pipeline" else "narrate", [last["nn"]])
        if c3.button("Ask why", key="fail_ask"):
            st.session_state["chat_pick"] = last["id"] if last and last.get("session") else "assistant"
            st.session_state["right_panel"] = "Chat"
            st.rerun()


def caption_fixes(out: Path, log_text: str) -> list:
    """Caption alignment failed: show each mismatch beside its script line and what the transcript heard,
    propose a lexicon term, let the person edit it, check it with a dry run, and save it."""
    ms = api.mismatches(log_text)
    if not ms:
        return []
    st.markdown(f"**Fix captions** · {len(ms)} word(s) the transcript wrote differently from the script")
    st.caption("The voice is fine: the transcriber wrote some words its own way (158,000 for “158 thousand”, a dropped "
               "“a”). Tell the aligner what it will hear: a lexicon term pairs the on-screen words with the heard form. "
               "Widen the on-screen words to a phrase when the transcript drops or merges words. Nothing re-records: "
               "saving re-runs the local voice and alignment, and keeps your approval.")
    terms, seen = [], set()
    for i, m in enumerate(ms):
        ctx = api.mismatch_context(out, m["nn"], m["line"], m["at"])
        sug = api.suggest_term(m, ctx)
        key = (m["nn"], sug["display"], sug["heard"])
        if key in seen:
            continue
        seen.add(key)
        with st.container(border=True):
            st.html(f'{theme.tag("segment " + m["nn"])} {theme.tag(m["line"])} '
                    f'<span class="ck-muted">at {m["at"]:.1f}s</span>'
                    f'<div class="ck-why">script: {html.escape(ctx["display"])}</div>'
                    f'<div class="ck-why">heard: {html.escape(ctx["heard"])}</div>')
            a, b = st.columns(2)
            d = a.text_input("On-screen words", sug["display"], key=f"cf_d_{i}")
            h = b.text_input("Heard as", sug["heard"], key=f"cf_h_{i}")
            if d.strip() and h.strip():
                terms.append({"display": d.strip(), "heard": h.strip(), "nn": m["nn"]})
    nns = sorted({m["nn"] for m in ms})
    c1, c2 = st.columns([1, 3])
    if c1.button("Check", key="cf_check"):
        res = guard(api.check_alignment, out, [{k: t[k] for k in ("display", "heard")} for t in terms], nns)
        if isinstance(res, dict):
            st.session_state["cf_result"] = res
    res = st.session_state.get("cf_result")
    if res:
        clean = all("clean" in v for v in res.values())
        for nn, v in res.items():
            st.html(f'{theme.pill("done" if "clean" in v else "failed", "segment " + nn)} '
                    f'<span class="ck-muted">{html.escape(v.splitlines()[-1] if v else "")}</span>')
        if clean and c2.button("Save to lexicon and retry", type="primary", key="cf_save"):
            if guard(api.add_lexicon_terms, out, [{k: t[k] for k in ("display", "heard")} for t in terms],
                     ok="Saved: retrying"):
                st.session_state.pop("cf_result", None)
                refresh_status()
                if guard(orchestrate.start, out):
                    st.rerun(scope="app")
        elif not clean:
            c2.caption("Still mismatched: widen the on-screen words or adjust the heard form, then Check again.")
    else:
        c2.caption("Check runs the aligner on these segments with your terms, without touching the build.")
    return ms


def eval_fixes(out: Path, fmt: str, log_text: str) -> list:
    """The text gates' eval failed: list each failing criterion with its evidence, and let the person keep it
    (an accepted failure, with their reason) or say what to change instead."""
    fails = api.eval_failures(log_text)
    if not fails:
        return []
    have = api.accepted(out, fmt)
    st.markdown(f"**Eval checks that failed** · {len(fails)}")
    st.caption("Fix the cause (edit the script at the gate, or Ask why), or keep the failure: accepting records your "
               f"reason in {api.accepts_file(out, fmt).name}, and the check stops failing the run. It still scores nothing.")
    for f in fails:
        with st.container(border=True):
            st.html(f'{theme.pill("accepted" if f["id"] in have else "failed", f["id"])} <b>{html.escape(f["title"])}</b>'
                    + "".join(f'<div class="ck-why">{html.escape(e)}</div>' for e in f["evidence"][:6]))
            if f["id"] in have:
                st.caption(f"Accepted: {have[f['id']]}")
                continue
            a, b = st.columns([4, 1], vertical_alignment="bottom")
            why = a.text_input("Keep it because…", key=f"ef_{f['id']}")
            if b.button("Accept", key=f"ef_b_{f['id']}", disabled=not why.strip()):
                if guard(api.accept, out, fmt, f["id"], why, ok=f"Accepted {f['id']}"):
                    st.rerun()
    if all(f["id"] in have for f in fails):
        st.info("Every failing check is accepted. Retry to carry on.")
    return fails


def rerun_panel(out: Path, fmt: str) -> None:
    running = api.driver_running(out)
    with st.expander("Rerun", expanded=False):
        if running:
            st.caption("Stop the build to rerun part of it.")
            return
        try:
            st_json = status(out, fmt)
        except Exception as err:  # noqa: BLE001
            st.error(str(err))
            return
        names = [s["name"] for s in st_json["stages"] if s["kind"] != "approve"]
        a, b = st.columns(2)
        stage = a.selectbox("Stage", names, key="rr_stage")
        segs = b.multiselect("Segments (none = all)", st_json["segments"], key="rr_segs")
        row = next(s for s in st_json["stages"] if s["name"] == stage)
        c1, c2 = st.columns(2)
        if row["kind"] == "author":
            c1.caption(f"Runs {launchers.who(stage) or 'the author'} again; the old output is kept in .chalk/ui/prev/.")
            if c2.button("Re-run this agent", key="rr_agent", type="primary"):
                rerun_agent(out, stage, segs if row["per"] and segs else None)
        else:
            c1.caption("Runs this stage again, and everything after it that depends on it.")
            if c2.button("Rerun from here", key="rr_from", type="primary"):
                rerun_from(out, stage, segs or None)


def questions_panel(out: Path) -> None:
    qs = api.questions(out)
    if not qs:
        return
    ans = api.answers(out)
    open_ = [q for q in qs if q not in ans]
    with st.expander(f"Questions from the agents · {len(open_)} open", expanded=bool(open_)):
        st.caption("Agents can't stop to ask, so they leave questions here. Every agent after this reads your answers.")
        for i, q in enumerate(qs):
            st.markdown(f"**{q}**")
            if q in ans:
                st.caption(f"You: {ans[q]}")
                continue
            a = st.text_input("Answer", key=f"ans_{i}", label_visibility="collapsed", placeholder="Your answer")
            if st.button("Save answer", key=f"ans_b_{i}", disabled=not a.strip()):
                guard(api.answer, out, q, a, ok="Saved: later agents will read it")
                st.rerun()
        applied = api.read_json(api.ui_dir(out) / "answers-applied.json", {})
        fresh = len(ans) > applied.get("answers", 0)
        if ans and fresh:
            st.divider()
            target = chat_backend.answer_target(out)
            if api.driver_running(out):
                st.caption("The build is running: your answers reach every agent it launches from here on.")
            elif target:
                st.caption(f"The build is stopped, so no agent will read your answers until something runs. Hand them to "
                           f"**{target['who']}** (the last agent to work on this build, in its own session); it applies "
                           f"them, and the build resumes.")
                if st.button("Apply answers and resume", type="primary", key="apply_answers"):
                    if guard(chat_backend.apply_answers, out, ok="Sent: the agent is applying your answers"):
                        st.session_state["right_panel"] = "Chat"
                        st.session_state["chat_pick"] = target["id"]
                        st.rerun()


def steps_panel(out: Path) -> None:
    ss = api.steps(out)
    if not ss:
        return
    t = api.totals(out)
    with st.expander(f"Steps and usage · {len(ss)} steps · {api.fmt_tokens(t['tokens'])} tokens · ~${t['cost']:.2f}",
                     expanded=False):
        rows = [{"step": s["id"][:3], "who": s["who"], "segment": s.get("nn") or "",
                 "time": dur((s.get("ended") or time.time()) - s["started"]), "tokens": api.tokens(s.get("usage")),
                 "est. $": round(s.get("cost") or 0, 2), "exit": "" if s.get("rc") is None else str(s["rc"])} for s in ss]
        st.dataframe(rows, hide_index=True, width="stretch")
        st.caption(f"Agents {api.fmt_tokens(t['agent_tokens'])} tokens (~${t['agent_cost']:.2f}) · "
                   f"chat {api.fmt_tokens(t['chat_tokens'])} tokens (~${t['chat_cost']:.2f})")
        st.caption(api.COST_NOTE)


def settings_panel(out: Path, fmt: str) -> None:
    cfg = api.config(out)
    running = api.driver_running(out)
    with st.expander("Build settings", expanded=not cfg.get("format")):
        if not cfg.get("format"):
            st.info("This build was made outside the UI. Save these settings to drive it from here.")
        a, b = st.columns(2)
        new = dict(cfg)
        new["format"] = fmt
        new["audience"] = a.text_input("Audience (learner, scripts)", cfg.get("audience") or "", key="s_aud") or None
        new["channel"] = b.text_input("channel.json (voice, text gates)", cfg.get("channel") or "", key="s_ch") or None
        new["direction"] = a.text_area("Direction (outline, scripts)", cfg.get("direction") or "", key="s_dir", height=80) or None
        new["model"] = b.text_input("Model for agents", cfg.get("model") or "", key="s_model") or None
        c1, c2, c3 = st.columns(3)
        new["jobs"] = int(c1.number_input("Parallel agents", 1, 8, int(cfg.get("jobs") or 3), key="s_jobs"))
        new["max_tokens"] = int(c2.number_input("Budget, tokens (0 = none)", 0, 500_000_000, int(cfg.get("max_tokens") or 0),
                                                step=1_000_000, key="s_budget_tok",
                                                help="Stop before the next agent once the build has used this many tokens.")) or None
        new["max_usd"] = float(c2.number_input("Budget, est. $ (0 = none)", 0.0, 1000.0, float(cfg.get("max_usd") or 0),
                                               key="s_budget", help=api.COST_NOTE)) or None
        new["ntfy_topic"] = c3.text_input("ntfy topic (phone alerts, optional)", cfg.get("ntfy_topic") or "", key="s_ntfy") or None
        if fmt == "long":
            new["notebook"] = st.checkbox("Notebook", bool(cfg.get("notebook")), key="s_nb")
        with st.popover("Agent time limits"):
            tl = dict(cfg.get("timeouts") or {})
            for stage, l in launchers.LAUNCHERS.items():
                tl[stage] = int(st.number_input(stage, 5, 240, int(tl.get(stage) or l["timeout_min"]), key=f"s_to_{stage}"))
            new["timeouts"] = {k: v for k, v in tl.items() if v != launchers.LAUNCHERS[k]["timeout_min"]} or None
        if not cfg.get("doc"):
            new["doc"] = st.text_input("Source document (only needed before ingest)", key="s_doc") or None
        new = {k: v for k, v in new.items() if v is not None}
        if st.button("Save settings", disabled=running or new == cfg, key="s_save"):
            api.save_config(out, new)
            st.toast("Saved. They apply from the next stage that reads them.")
            st.rerun()
        if running:
            st.caption("Stop the build to change its settings.")


# --- the page ------------------------------------------------------------------------------------------

def render(out: Path, fmt: str) -> None:
    api.remember(out)
    header(out, fmt)
    try:
        st_json = status(out, fmt)
    except Exception as err:  # noqa: BLE001
        st.error(f"chalk status failed: {err}")
        return
    gate_name = api.open_gate(st_json) if not api.driver_running(out) else None
    failure(out, fmt)
    if gate_name:
        gate.render(out, fmt, gate_name)
    left, right = st.columns([3, 2], gap="large")
    with left:
        board(out, fmt)
    with right:
        tab = st.segmented_control("Panel", ["Console", "Chat"], default="Console", key="right_panel",
                                   label_visibility="collapsed")
        if tab == "Chat":
            chat_view.render(out, fmt)
        else:
            console_live(out)
    questions_panel(out)
    a, b = st.columns(2)
    with a:
        rerun_panel(out, fmt)
        steps_panel(out)
    with b:
        settings_panel(out, fmt)
    st.divider()
    outputs.render(out, fmt, gate_open=bool(gate_name))
