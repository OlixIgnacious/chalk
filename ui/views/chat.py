"""views/chat.py — talk to the build assistant, or to a finished agent in its own session."""

from __future__ import annotations

from pathlib import Path

import streamlit as st

import chalk_api as api
import chat
import orchestrate
from views.common import guard


def default_target(out: Path, options: list[dict]) -> str:
    """The failing step when the build failed; otherwise the assistant."""
    if api.phase(out) in ("failed", "crashed"):
        for s in reversed(api.steps(out)):
            if s.get("rc") not in (0, 3, None) and any(o["id"] == s["id"] for o in options):
                return s["id"]
    return chat.ASSISTANT


def render(out: Path, fmt: str) -> None:
    options = chat.targets(out)
    ids = [o["id"] for o in options]
    labels = {o["id"]: o["label"] for o in options}
    # "Ask why" on the failure panel sets chat_pick to the failed step before this renders
    if st.session_state.get("chat_pick") not in ids:
        st.session_state["chat_pick"] = default_target(out, options)
    target = st.selectbox("Talk to", ids, format_func=labels.get, key="chat_pick")
    if target != chat.ASSISTANT:
        st.caption("This resumes that agent's own session: it remembers what it read and decided, and it can "
                   "change its own work. Stop the build first.")
    else:
        st.caption("Reads the build and the chalk repo; changes nothing.")
    thread_view(out, target)
    text = st.chat_input("Ask about this build…" if target == chat.ASSISTANT else "Ask, or ask for a change…",
                         key=f"chat_in_{target}")
    if text:
        guard(chat.ask, out, target, text)
        st.rerun()


@st.fragment(run_every=2)
def thread_view(out: Path, target: str) -> None:
    turns = chat.thread(out, target)
    box = st.container(height=380)
    with box:
        if not turns:
            st.caption("No messages yet.")
        for t in turns:
            with st.chat_message("user" if t["role"] == "user" else "assistant"):
                st.markdown(t["text"])
                if t["role"] == "assistant":
                    meta = []
                    if t.get("usage"):
                        meta.append(f"{api.fmt_tokens(api.tokens(t['usage']))} tokens")
                    if t.get("cost"):
                        meta.append(f"~${t['cost']:.2f} est.")
                    if t.get("rc") not in (0, None):
                        meta.append(f"exit {t['rc']}")
                    if meta:
                        st.caption(" · ".join(meta))
        if turns and turns[-1]["role"] == "user" and chat.busy(out, target):
            with st.chat_message("assistant"):
                st.caption("◐ writing a reply…")
    # an agent's reply may have changed its work: offer to carry on with the build
    if target != chat.ASSISTANT and turns and turns[-1]["role"] == "assistant" and turns[-1].get("rc") == 0 \
            and not api.driver_running(out) and st.session_state.get(f"resumed_after_{target}") != len(turns):
        st.info("If that reply changed files, resume the build: only what depends on them runs again.")
        if st.button("▶ Resume the build", key=f"chat_resume_{target}_{len(turns)}"):
            st.session_state[f"resumed_after_{target}"] = len(turns)
            if guard(orchestrate.start, out):
                st.rerun(scope="app")
