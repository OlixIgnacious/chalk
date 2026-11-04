"""chalk UI — pick a format, give it a source, and watch the pipeline and its agents work.

    npm run ui            (streamlit run ui/app.py, from the repo root so .streamlit/config.toml applies)

The page only reads and starts things. A build runs in ui/orchestrate.py as its own process, so a refresh
or a closed tab never stops it; open it again from the builds list.

    views/landing.py   your builds, and a new build (format first, then its inputs)
    views/build.py     one build: header, stepper, stage cards, console and chat, gates, outputs
"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent))

import chalk_api as api  # noqa: E402
import theme  # noqa: E402
from views import build, landing  # noqa: E402

st.set_page_config(page_title="chalk", page_icon=str(api.REPO / "assets/logo.png"), layout="wide")
theme.inject()


def main() -> None:
    out = st.session_state.get("out")
    if out:
        out = Path(out)
        fmt = api.format_of(out) if out.is_dir() else None
        if not fmt:
            st.error(f"{out} is not a chalk output dir any more.")
            st.session_state.pop("out")
            if st.button("← Builds"):
                st.rerun()
            return
        landing.sidebar_environment()
        build.render(out, fmt)
    else:
        landing.render()


main()
