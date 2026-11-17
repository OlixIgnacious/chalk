"""test_ui.py — the UI's logic without a render or a real agent.

    .venv/bin/python -m pytest ui/test_ui.py      (npm run test:ui)

A stand-in `chalk` (status / pipeline / approve over a tiny state machine) and a stand-in `claude` (writes
the file its agent would, and speaks stream-json with a session id) let the driver, chat and the page run
for real. CHALK_UI_QUIET keeps the tests from posting desktop notifications.
"""

from __future__ import annotations

import json
import os
import re
import sys
import textwrap
import time
from pathlib import Path

import pytest

UI = Path(__file__).resolve().parent
sys.path.insert(0, str(UI))

import chalk_api as api  # noqa: E402
import chat  # noqa: E402
import claude_run  # noqa: E402
import launchers  # noqa: E402
import orchestrate  # noqa: E402
import theme  # noqa: E402

FAKE_CHALK = textwrap.dedent('''
    import json, sys, pathlib
    a = sys.argv[1:]
    if a[0] == "doctor":
        print("  ok    node"); sys.exit(0)
    out = pathlib.Path(a[1] if a[0] == "status" else a[2] if a[1] == "approve" else a[1])
    fmt = a[a.index("--format") + 1] if "--format" in a else "short"
    st = out / ".fake.json"
    s = json.loads(st.read_text()) if st.exists() else {"approved": False}
    with (out / ".fake-calls.jsonl").open("a") as f:
        f.write(json.dumps(a) + "\\n")
    segs = ["00", "01"]
    def board():
        g = (out / "grounding.md").exists()
        frames = {nn: (out / f"frames/s{nn}.py").exists() for nn in segs}
        def cell(done, why, nn=None, outputs=()):
            return {"nn": nn, "status": "done" if done else "waiting", "why": None if done else why, "after": None,
                    "outputs": list(outputs)}
        return {"out": str(out), "format": fmt, "segments": segs, "channel": None, "stages": [
            {"name": "ingest", "kind": "run", "per": None, "cells": [cell(True, "")]},
            {"name": "grounding", "kind": "author", "per": None, "cells": [cell(g, "dispatch chalk-grounding", None, ["grounding.md"])]},
            {"name": "scripts-approved", "kind": "approve", "per": None, "cells": [cell(s["approved"], "your review")]},
            {"name": "frame-spec", "kind": "author", "per": "segment",
             "cells": [cell(frames[nn], "frames/sNN.py", nn, [f"frames/s{nn}.py"]) for nn in segs]},
        ]}
    if a[0] == "status":
        print(json.dumps(board())); sys.exit(0)
    if a[1] == "approve":
        s["approved"] = True; st.write_text(json.dumps(s)); print("approved"); sys.exit(0)
    for stage in board()["stages"]:
        if any(c["status"] != "done" for c in stage["cells"]):
            print("waiting at", stage["name"]); sys.exit(3)
    print("everything is done"); sys.exit(0)
''')

FAKE_CLAUDE = textwrap.dedent('''
    import json, os, re, sys, pathlib
    a = sys.argv[1:]
    prompt = a[a.index("-p") + 1]
    agent = a[a.index("--agent") + 1] if "--agent" in a else None
    out = pathlib.Path.cwd()
    with (out / ".claude-calls.jsonl").open("a") as f:
        f.write(json.dumps({"argv": a, "no_approve": os.environ.get("CHALK_NO_APPROVE")}) + "\\n")
    print(json.dumps({"type": "system", "subtype": "init", "session_id": f"sess-{agent or 'skill'}"}))
    if agent == "chalk-grounding":
        (out / "grounding.md").write_text("# Grounding\\nall supported\\n")
    elif agent == "chalk-frames":
        nn = re.search(r"Draw segment (\\d\\d)", prompt).group(1)
        (out / "frames").mkdir(exist_ok=True)
        (out / f"frames/s{nn}.py").write_text("FRAMES = {}\\n")
    print(json.dumps({"type": "assistant", "message": {"content": [
        {"type": "text", "text": f"working as {agent}"},
        {"type": "tool_use", "name": "Bash", "input": {"command": "ls"}}]}}))
    print(json.dumps({"type": "result", "subtype": "success", "is_error": False, "total_cost_usd": 0.01,
                      "duration_ms": 1000, "result": f"done as {agent}", "session_id": f"sess-{agent or 'skill'}",
                      "usage": {"input_tokens": 100, "cache_read_input_tokens": 1000, "output_tokens": 50}}))
''')


@pytest.fixture(autouse=True)
def quiet(monkeypatch, tmp_path):
    monkeypatch.setenv("CHALK_UI_QUIET", "1")
    monkeypatch.setattr(api, "RECENT", tmp_path / "recent.json")


@pytest.fixture
def fakes(tmp_path, monkeypatch):
    (tmp_path / "chalk.py").write_text(FAKE_CHALK)
    (tmp_path / "claude.py").write_text(FAKE_CLAUDE)
    monkeypatch.setenv("CHALK_BIN", f"{sys.executable} {tmp_path / 'chalk.py'}")
    monkeypatch.setenv("CLAUDE_BIN", f"{sys.executable} {tmp_path / 'claude.py'}")
    out = tmp_path / "shorts-output" / "demo"
    out.mkdir(parents=True)
    (out / "chapter.json").write_text("{}")
    api.save_config(out, {"format": "short", "doc": str(tmp_path / "doc.md"), "jobs": 2, "audience": "learners"})
    return out


def calls(out, name):
    f = out / name
    return [json.loads(line) for line in f.read_text().splitlines()] if f.exists() else []


# --- launchers -----------------------------------------------------------------------------------------

def test_agents_come_from_agents_dir():
    defs = json.loads(launchers.agents_json())
    assert set(defs) == {p.stem for p in launchers.AGENTS_DIR.glob("*.md")}
    for name, d in defs.items():
        assert d["prompt"] and d["description"] and "Read" in d["tools"], name


def test_every_author_stage_has_a_launcher():
    stages = (api.REPO / "pipeline/stages.mjs").read_text()
    author = {b.split('name: "')[1].split('"')[0] for b in stages.split("{")[1:] if 'kind: "author"' in b and 'name: "' in b}
    assert author and author <= set(launchers.LAUNCHERS), author - set(launchers.LAUNCHERS)


def test_every_stage_has_a_phase():
    names = set(re.findall(r'name: "([a-z-]+)"', (api.REPO / "pipeline/stages.mjs").read_text()))
    every = {s for _, ss in theme.PHASES for s in ss}
    assert names <= every, names - every


@pytest.mark.parametrize("fmt,stage,expect", [
    ("youtube", "outline", "step 2 (Outline)"), ("lesson", "syllabus", "step 2 (Syllabus)"),
    ("lesson", "scripts", "lesson.json"), ("short", "scripts", "short.json"),
])
def test_skill_prompts_name_their_step(tmp_path, fmt, stage, expect):
    argv = launchers.command(stage, tmp_path, {"format": fmt, "audience": "x"})
    prompt = argv[argv.index("-p") + 1]
    assert expect in prompt and str(launchers.SKILLS[fmt] / "SKILL.md") in prompt
    assert "--agent" not in argv


def test_agent_command_tools_guards_and_resume(tmp_path):
    argv = launchers.command("frame-spec", tmp_path, {"format": "youtube"}, "03")
    assert argv[argv.index("--agent") + 1] == "chalk-frames"
    assert "Draw segment 03" in argv[argv.index("-p") + 1]
    assert argv[argv.index("--allowedTools") + 1].split(",") == launchers.agents()["chalk-frames"]["tools"]
    assert "Bash(*pipeline approve*)" in argv[argv.index("--disallowedTools") + 1]
    again = launchers.command("frame-spec", tmp_path, {"format": "youtube"}, "03", resume="sess-1", prompt="use a table")
    assert again[again.index("--resume") + 1] == "sess-1" and again[again.index("-p") + 1] == "use a table"


def test_only_agents_that_say_network_true_reach_the_web(tmp_path):
    netted = sorted(n for n, a in launchers.agents().items() if a["network"])
    assert netted == ["chalk-factcheck"], netted
    check = launchers.command("source-check", tmp_path, {"format": "youtube"})
    denied = check[check.index("--disallowedTools") + 1].split(",")
    assert "WebFetch" not in denied and "WebSearch" not in denied
    assert {"Bash(curl:*)", "Bash(wget:*)", "Bash(*pipeline approve*)"} <= set(denied)
    for stage in ["grounding", "learner", "review", "resolve"]:
        argv = launchers.command(stage, tmp_path, {"format": "youtube"})
        assert {"WebFetch", "WebSearch"} <= set(argv[argv.index("--disallowedTools") + 1].split(",")), stage


def test_answers_reach_later_prompts(fakes):
    api.ui_dir(fakes).joinpath("questions.md").write_text("- Which example in part 2?\n")
    assert api.open_questions(fakes) == ["Which example in part 2?"]
    api.answer(fakes, "Which example in part 2?", "the second one")
    assert api.open_questions(fakes) == []
    prompt = launchers.command("grounding", fakes, api.config(fakes))
    assert "answers.md" in prompt[prompt.index("-p") + 1]


# --- the driver ----------------------------------------------------------------------------------------

def test_driver_runs_agents_then_stops_at_the_gate_then_finishes(fakes):
    out = fakes
    assert orchestrate.Driver(out).run() == 0
    run = api.run_state(out)
    assert run["phase"] == "gate" and run["gate"] == "scripts-approved"
    g = next(s for s in api.steps(out) if s["stage"] == "grounding")
    assert g["session"] == "sess-chalk-grounding", "the session id is kept, for chat"
    log = Path(g["log"]).read_text()
    assert "working as chalk-grounding" in log and "🔧 Bash: ls" in log and "✓ finished" in log
    assert all(c["no_approve"] == "1" for c in calls(out, ".claude-calls.jsonl")), "agents may never approve"

    api.approve(out, "short", "scripts")
    assert orchestrate.Driver(out).run() == 0
    run = api.run_state(out)
    assert run["phase"] == "done", run
    assert sorted(s["nn"] for s in api.steps(out) if s["stage"] == "frame-spec") == ["00", "01"]
    assert all(s["rc"] == 0 for s in api.steps(out) if s["stage"] != "pipeline")
    assert len({s["id"] for s in api.steps(out)}) == len(api.steps(out)), "step ids are unique"


def test_driver_fails_when_an_agent_leaves_its_stage_waiting(fakes, tmp_path, monkeypatch):
    (tmp_path / "lazy.py").write_text('import json; print(json.dumps({"type": "result", "subtype": "success"}))')
    monkeypatch.setenv("CLAUDE_BIN", f"{sys.executable} {tmp_path / 'lazy.py'}")
    assert orchestrate.Driver(fakes).run() == 1
    assert "still waiting" in api.run_state(fakes)["message"]


def test_a_hung_agent_times_out(fakes, tmp_path, monkeypatch):
    (tmp_path / "hang.py").write_text("import time; time.sleep(60)")
    monkeypatch.setenv("CLAUDE_BIN", f"{sys.executable} {tmp_path / 'hang.py'}")
    api.save_config(fakes, {**api.config(fakes), "timeouts": {"grounding": 0.02}})  # 1.2 s
    t0 = time.time()
    assert orchestrate.Driver(fakes).run() == 1
    assert time.time() - t0 < 30
    assert "time limit" in api.run_state(fakes)["message"]
    assert next(s for s in api.steps(fakes) if s["stage"] == "grounding")["rc"] == "timeout"


def test_the_budget_stops_the_next_launch(fakes):
    api.write_json(api.ui_dir(fakes) / "steps.json", [{"id": "001-x", "stage": "grounding", "who": "x", "log": "",
                                                       "started": time.time(), "ended": time.time(), "rc": 0, "cost": 5.0}])
    api.save_config(fakes, {**api.config(fakes), "max_usd": 1})
    assert orchestrate.Driver(fakes).run() == 1
    assert "budget reached" in api.run_state(fakes)["message"]
    assert not calls(fakes, ".claude-calls.jsonl"), "no agent ran past the budget"


def test_tokens_are_counted_and_can_be_the_budget(fakes):
    orchestrate.Driver(fakes).run()
    t = api.totals(fakes)
    assert t["tokens"] == 1150 * len([s for s in api.steps(fakes) if s["stage"] != "pipeline"])
    assert api.fmt_tokens(1_250_000) == "1.2M" and api.fmt_tokens(1150) == "1k"
    api.save_config(fakes, {**api.config(fakes), "max_tokens": 1000})
    api.approve(fakes, "short", "scripts")
    assert orchestrate.Driver(fakes).run() == 1
    assert "token budget reached" in api.run_state(fakes)["message"]
    assert not [s for s in api.steps(fakes) if s["stage"] == "frame-spec"], "no agent ran past the token budget"


def test_a_rerun_applies_from_and_only_to_the_first_pass(fakes):
    orchestrate.Driver(fakes, first={"from": "frame-spec", "only": ["01"]}).run()
    pipeline_calls = [c for c in calls(fakes, ".fake-calls.jsonl") if c[0] == "pipeline"]
    assert "--from" in pipeline_calls[0] and pipeline_calls[0][pipeline_calls[0].index("--only") + 1] == "01"
    assert all("--from" not in c for c in pipeline_calls[1:])


def test_one_driver_per_output_dir_and_stop_checks_its_target(fakes):
    holder = orchestrate.Driver(fakes)
    assert holder.acquire()
    try:
        assert api.driver_running(fakes)
        assert not orchestrate.Driver(fakes).acquire(), "a second driver cannot take the lock"
        with pytest.raises(RuntimeError, match="already running"):
            orchestrate.start(fakes)
        # run.json names this test process, which does not carry the token: Stop must refuse
        api.write_json(api.ui_dir(fakes) / "run.json", {"phase": "running", "pid": os.getpid(), "pgid": os.getpgid(0),
                                                        "token": "not-in-pytest-argv"})
        assert orchestrate.stop(fakes) is False
    finally:
        os.close(holder.lock_fd)
    assert not api.driver_running(fakes)
    assert api.phase(fakes) == "crashed", "running with no lock held is a dead driver"


def test_start_runs_a_detached_driver_to_the_gate(fakes):
    assert orchestrate.start(fakes)
    for _ in range(150):
        if api.phase(fakes) == "gate":
            break
        time.sleep(0.1)
    assert api.phase(fakes) == "gate"
    assert api.run_state(fakes)["token"] and not api.driver_running(fakes)


# --- chat, approvals, accepts, uploads -----------------------------------------------------------------

def test_chat_resumes_the_agents_own_session(fakes):
    orchestrate.Driver(fakes).run()
    step = next(s for s in api.steps(fakes) if s["stage"] == "grounding")
    assert any(t["id"] == step["id"] for t in chat.targets(fakes))
    api.write_json(chat.chat_dir(fakes) / f"{chat.safe(step['id'])}.json",
                   [{"role": "user", "text": "why claim 7?", "ts": time.time()}])
    assert chat.reply(fakes, step["id"]) == 0
    last = calls(fakes, ".claude-calls.jsonl")[-1]["argv"]
    assert last[last.index("--resume") + 1] == "sess-chalk-grounding"
    assert last[last.index("--agent") + 1] == "chalk-grounding"
    t = chat.thread(fakes, step["id"])
    assert t[-1]["role"] == "assistant" and t[-1]["text"] == "done as chalk-grounding" and t[-1]["cost"] == 0.01
    assert api.totals(fakes)["chat_cost"] == 0.01


def test_the_assistant_only_reads(fakes):
    api.write_json(chat.chat_dir(fakes) / "assistant.json", [{"role": "user", "text": "what failed?", "ts": time.time()}])
    assert chat.reply(fakes, chat.ASSISTANT) == 0
    argv = calls(fakes, ".claude-calls.jsonl")[-1]["argv"]
    assert argv[argv.index("--allowedTools") + 1] == "Read,Grep,Glob"
    assert "Bash" in argv[argv.index("--disallowedTools") + 1].split(",")
    assert "Output dir" in argv[argv.index("--append-system-prompt") + 1]


def test_approve_only_the_live_gate_and_diff_since(fakes):
    with pytest.raises(RuntimeError, match="no longer at"):
        api.approve_gate(fakes, "short", "scripts-approved")  # grounding not written: not at the gate
    orchestrate.Driver(fakes).run()
    (fakes / "short.json").write_text('{"title": "one"}\n')
    api.approve_gate(fakes, "short", "scripts-approved")
    assert api.changes_since_approval(fakes, "short", "scripts-approved") == []
    (fakes / "short.json").write_text('{"title": "two"}\n')
    diffs = api.changes_since_approval(fakes, "short", "scripts-approved")
    assert diffs and diffs[0][0] == "short.json" and '+{"title": "two"}' in diffs[0][1]


def test_accept_writes_where_the_eval_reads(fakes, tmp_path):
    (fakes / "short.json").write_text('{"title": "t"}\n')
    assert api.accept(fakes, "short", "S2", "it is 62 s on purpose").name == "short.json"
    assert json.loads((fakes / "short.json").read_text())["accepted"] == {"S2": "it is 62 s on purpose"}
    api.unaccept(fakes, "short", "S2")
    assert "accepted" not in json.loads((fakes / "short.json").read_text())
    yt = tmp_path / "yt"
    yt.mkdir()
    assert api.accept(yt, "youtube", "T6", "kept").name == "video.json"
    with pytest.raises(ValueError):
        api.accept(yt, "youtube", "T6", "  ")


def test_upload_never_overwrites_a_different_file(tmp_path):
    a, note = api.save_upload(tmp_path, "ch.md", b"one")
    assert a.name == "ch.md" and note is None
    b, note = api.save_upload(tmp_path, "ch.md", b"two")
    assert b.name == "ch-2.md" and "different file" in note and a.read_bytes() == b"one"
    assert api.save_upload(tmp_path, "ch.md", b"one")[0] == a, "same bytes reuse the file"
    with pytest.raises(ValueError, match="cannot be ingested"):
        api.save_upload(tmp_path, "ch.docx", b"x")


def test_render_event():
    text, facts = claude_run.render_event(json.dumps({"type": "result", "subtype": "error_max_turns", "total_cost_usd": 0.5}))
    assert facts["error"] and facts["cost"] == 0.5 and "failed" in text
    assert claude_run.render_event(json.dumps({"type": "system", "subtype": "init", "session_id": "s1"}))[1] == {"session": "s1"}
    assert claude_run.render_event("plain line\n")[0] == "plain line"


def test_builds_list(fakes, tmp_path):
    orchestrate.Driver(fakes).run()
    rows = api.builds(tmp_path)
    assert [r["name"] for r in rows] == ["demo"] and rows[0]["format"] == "short" and rows[0]["phase"] == "gate"


# --- the page ------------------------------------------------------------------------------------------

def app(**state):
    from streamlit.testing.v1 import AppTest
    at = AppTest.from_file(str(UI / "app.py"), default_timeout=60)
    for k, v in state.items():
        at.session_state[k] = v
    return at.run()


def test_landing_shows_inputs_only_after_a_format(fakes, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    at = app()
    assert not at.exception, at.exception
    assert not [t for t in at.text_input if t.key == "slug"], "inputs appear only after the format"
    at.button(key="fmt_short").click().run()
    assert not at.exception, at.exception
    keys = {t.key for t in at.text_input}
    assert {"doc", "slug", "channel", "audience", "idea"} <= keys
    at.button(key="fmt_youtube").click().run()
    assert "idea" not in {t.key for t in at.text_input}
    assert [c for c in at.checkbox if c.key == "notebook"]


@pytest.mark.parametrize("fmt", ["youtube", "lesson", "short"])
def test_each_format_at_its_scripts_gate_with_scripts_renders(fakes, fmt):
    """The bug that crashed the first version: a gate with scripts present (duplicate widget keys)."""
    api.save_config(fakes, {**api.config(fakes), "format": fmt})
    orchestrate.Driver(fakes).run()
    for nn in ("00", "01"):
        (fakes / f"segments/{nn}").mkdir(parents=True, exist_ok=True)
        (fakes / f"segments/{nn}/script.md").write_text(f"## Scene 1\n- spoken: part {nn}\n")
    (fakes / "outline.md").write_text("# Outline\n")
    at = app(out=str(fakes))
    assert not at.exception, at.exception
    assert [b for b in at.button if b.key == "approve_scripts-approved"], "the gate shows"
    labels = [t.label for t in at.tabs]
    for label, _ in api.FORMATS[fmt]["gates"]["scripts-approved"]:
        assert label in labels, (label, labels)


def test_no_gate_when_the_live_board_is_not_at_one(fakes):
    api.write_json(api.ui_dir(fakes) / "run.json", {"phase": "gate", "gate": "scripts-approved"})  # stale claim
    at = app(out=str(fakes))
    assert not at.exception, at.exception
    assert not [b for b in at.button if b.key == "approve_scripts-approved"], "grounding is still waiting"


def test_failure_panel_shows_the_failed_step_and_its_actions(fakes, tmp_path, monkeypatch):
    (tmp_path / "boom.py").write_text('import json; print("Traceback: boom"); '
                                      'print(json.dumps({"type": "system", "subtype": "init", "session_id": "s-x"})); '
                                      'print(json.dumps({"type": "result", "subtype": "error_during_execution", "is_error": True}))')
    monkeypatch.setenv("CLAUDE_BIN", f"{sys.executable} {tmp_path / 'boom.py'}")
    assert orchestrate.Driver(fakes).run() == 1
    at = app(out=str(fakes))
    assert not at.exception, at.exception
    keys = {b.key for b in at.button}
    assert {"fail_retry", "fail_ask"} <= keys
    at.button(key="fail_ask").click().run()
    assert not at.exception, at.exception
    assert at.session_state["chat_pick"] == next(s["id"] for s in api.steps(fakes) if s["stage"] == "grounding")


def test_answers_given_while_stopped_go_to_the_agent_that_asked(fakes):
    orchestrate.Driver(fakes).run()  # grounding ran, build at the gate
    api.ui_dir(fakes).joinpath("questions.md").write_text("- Which voice?\n")
    api.answer(fakes, "Which voice?", "af_heart")
    target = chat.answer_target(fakes)
    assert target["stage"] == "grounding"
    api.write_json(chat.chat_dir(fakes) / f"{chat.safe(target['id'])}.json", [])
    chat.apply_answers(fakes)
    for _ in range(100):
        t = chat.thread(fakes, target["id"])
        if t and t[-1]["role"] == "assistant":
            break
        time.sleep(0.1)
    sent = [c["argv"] for c in calls(fakes, ".claude-calls.jsonl") if "--resume" in c["argv"]][-1]
    assert sent[sent.index("--resume") + 1] == "sess-chalk-grounding"
    assert "answers.md" in sent[sent.index("-p") + 1]
    assert api.read_json(api.ui_dir(fakes) / "answers-applied.json", {})["answers"] == 1


ALIGN_LOG = """▶  align 05 (work/05/captions.json is not there)
MISMATCH line=l008 display="homoscedasticity." expected~"homoscedasticity" heard="homoscate." @37.82s
▶  align 08 (x)
MISMATCH line=l008 display="thousand" expected~"thousand" heard="158,000" @33.56s
fail E3 Main parts stay short: one idea, at most 75 s each (hook and bonus excepted)
       segments/02 "": 77.7s
pass V1 Narration uses the channel's chosen voice
✗  align 05, 08 failed (exit 1)
"""


def test_failure_logs_are_parsed_into_fixes():
    ms = api.mismatches(ALIGN_LOG)
    assert [(m["nn"], m["line"], m["heard"]) for m in ms] == [("05", "l008", "homoscate."), ("08", "l008", "158,000")]
    assert api.suggest_term(ms[0], {})["heard"] == "homoscate"
    fails = api.eval_failures(ALIGN_LOG)
    assert [f["id"] for f in fails] == ["E3"] and fails[0]["evidence"] == ['segments/02 "": 77.7s']


def test_add_lexicon_terms_backs_up_and_keeps_the_voice(tmp_path):
    out = tmp_path / "o"
    out.mkdir()
    api.write_json(out / "lexicon.json", {"terms": [{"display": "homoscedasticity", "spoken": "homo-skeh", "heard": "x"}]})
    assert api.add_lexicon_terms(out, [{"display": "homoscedasticity", "heard": "homoscate"},
                                       {"display": "158 thousand", "heard": "158,000"}]) == 2
    terms = {t["display"]: t for t in api.read_json(out / "lexicon.json", {})["terms"]}
    assert terms["homoscedasticity"]["heard"] == "homoscate" and terms["homoscedasticity"]["spoken"] == "homo-skeh"
    assert terms["158 thousand"]["spoken"] == "158 thousand", "spoken defaults to display: the voice is unchanged"
    assert list(api.ui_dir(out).glob("lexicon.*.bak.json"))


def test_failure_panel_offers_caption_and_eval_fixes(fakes):
    log = api.ui_dir(fakes) / "logs" / "009-pipeline-1.log"
    log.parent.mkdir(exist_ok=True)
    log.write_text(ALIGN_LOG)
    api.write_json(api.ui_dir(fakes) / "steps.json", [{"id": "009-pipeline-1", "stage": "pipeline", "who": "chalk pipeline",
                                                       "log": str(log), "started": time.time(), "ended": time.time(), "rc": 1}])
    api.write_json(api.ui_dir(fakes) / "run.json", {"phase": "failed", "message": "chalk pipeline exited 1"})
    at = app(out=str(fakes))
    assert not at.exception, at.exception
    keys = {b.key for b in at.button}
    assert {"cf_check", "ef_b_E3", "fail_retry"} <= keys
    assert {t.key for t in at.text_input} >= {"cf_d_0", "cf_h_0", "ef_E3"}
