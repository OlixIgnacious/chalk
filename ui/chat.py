"""chat.py — talk to a build: resume a finished agent's own session, or ask a read-only build assistant.

    ask(out, target, text)        target: a step id (that step's agent, with its full context and tools)
                                          or "assistant" (a fresh read-only session about the build)

A reply runs detached (`python ui/chat.py <out> <target>`), so a page refresh never loses it. Each target
keeps a thread in .chalk/ui/chat/<target>.json: [{role, text, ts, cost, usage, session, rc, log}], and one reply
at a time (an flock on <target>.lock). Agent replies may change files; the assistant may only read.
Nothing here can pass a gate: every process runs with CHALK_NO_APPROVE=1.

`then_resume` (used by "Request changes" at a gate): after a good reply, start the driver again, so the
changed scripts go back through the gates and grounding and the build stops at the gate once more.
"""

from __future__ import annotations

import fcntl
import os
import re
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import chalk_api as api  # noqa: E402
import claude_run  # noqa: E402
import launchers  # noqa: E402

ASSISTANT = "assistant"
ASSISTANT_TOOLS = ["Read", "Grep", "Glob"]
REPLY_TIMEOUT_S = 20 * 60


def chat_dir(out) -> Path:
    d = api.ui_dir(out) / "chat"
    d.mkdir(exist_ok=True)
    return d


def safe(target: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", target)


def thread(out, target: str) -> list[dict]:
    return api.read_json(chat_dir(out) / f"{safe(target)}.json", [])


def busy(out, target: str) -> bool:
    fd = os.open(chat_dir(out) / f"{safe(target)}.lock", os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return True
    else:
        fcntl.flock(fd, fcntl.LOCK_UN)
        return False
    finally:
        os.close(fd)


def targets(out) -> list[dict]:
    """What can be talked to: the assistant, and every finished agent step that has a session, newest first."""
    rows = [{"id": ASSISTANT, "label": "Build assistant (reads only)"}]
    for s in reversed(api.steps(out)):
        if s.get("session") and s.get("stage") in launchers.LAUNCHERS and s.get("ended"):
            rows.append({"id": s["id"], "label": f"{s['who']}{' · ' + s['nn'] if s.get('nn') else ''} ({s['id'][:3]})",
                         "stage": s["stage"]})
    return rows


def ask(out, target: str, text: str, *, then_resume: bool = False) -> None:
    """Queue the person's message and start the reply in the background."""
    out = Path(out).resolve()
    if not text.strip():
        raise ValueError("empty message")
    if busy(out, target):
        raise RuntimeError("a reply is still being written for this thread")
    if target != ASSISTANT:
        step = _step(out, target)
        if not step.get("session"):
            raise RuntimeError("that step has no saved session to resume")
        if api.driver_running(out):
            raise RuntimeError("the build is running; stop it before asking an agent to change its work")
    turns = thread(out, target)
    turns.append({"role": "user", "text": text.strip(), "ts": time.time()})
    api.write_json(chat_dir(out) / f"{safe(target)}.json", turns)
    argv = [sys.executable, str(Path(__file__).resolve()), str(out), target]
    if then_resume:
        argv.append("--then-resume")
    with open(chat_dir(out) / "chat.log", "a") as log:
        subprocess.Popen(argv, cwd=str(api.REPO), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)


def _step(out, target: str) -> dict:
    for s in api.steps(out):
        if s["id"] == target:
            return s
    raise RuntimeError(f"no step {target}")


def _last_session(turns: list[dict], fallback: str | None) -> str | None:
    for t in reversed(turns):
        if t.get("role") == "assistant" and t.get("session"):
            return t["session"]
    return fallback


def assistant_prompt(out: Path, cfg: dict) -> str:
    """What the assistant knows before the first question: where things are and where the build stands."""
    try:
        st = api.status(out, api.shape(cfg.get("format", "long")))
        board = "\n".join(
            f"- {s['name']} ({s['kind']}): " + ", ".join(f"{c['nn'] + ' ' if c['nn'] else ''}{c['status']}"
                                                         f"{' — ' + c['why'] if c.get('why') else ''}" for c in s["cells"])
            for s in st["stages"])
    except Exception as err:  # noqa: BLE001
        board = f"(status unavailable: {err})"
    failed = [s for s in api.steps(out) if s.get("rc") not in (0, 3, None)]
    lines = [
        "You are the build assistant in the chalk UI. You answer the person's questions about one build.",
        "You can only read: explain, point at files and lines, and say what change would fix a problem and",
        "which stage or agent would make it. Never claim you changed anything.",
        "When the person asks for a change, do not leave them stuck: name the control in this UI that makes it.",
        "  - Answers to agents' questions: the Questions panel, then 'Apply answers and resume'.",
        "  - Audience, direction, budget, time limits: Build settings.",
        "  - Script or plan edits at the scripts gate: Edit, or 'Ask the scripts agent'.",
        "  - Redo a stage, segment or agent: Rerun.",
        "  - A change to one agent's work: pick that agent under 'Talk to' (it resumes its own session and can edit).",
        "",
        f"Output dir: {out}",
        f"chalk repo: {api.REPO} (README.md has the agent flow; pipeline/stages.mjs the stages; agents/ the agents)",
        f"Format: {cfg.get('format')}. Run state: {api.run_state(out).get('phase')} — {api.run_state(out).get('message')}",
        f"Step logs: {api.ui_dir(out) / 'logs'} (steps.json lists them).",
        "",
        "The board now:",
        board,
    ]
    if failed:
        lines += ["", f"Last failed step: {failed[-1]['who']} — log {failed[-1]['log']}"]
    q = api.ui_dir(out) / "questions.md"
    if q.exists():
        lines.append(f"Questions agents left for the person: {q}")
    return "\n".join(lines)


def reply(out: Path, target: str, then_resume: bool = False) -> int:
    """The detached half: hold the thread's lock, run claude, record the answer."""
    out = Path(out).resolve()
    fd = os.open(chat_dir(out) / f"{safe(target)}.lock", os.O_RDWR | os.O_CREAT, 0o644)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return 3
    cfg = api.config(out)
    turns = thread(out, target)
    if not turns or turns[-1]["role"] != "user":
        return 0
    text = turns[-1]["text"]
    if target == ASSISTANT:
        argv = [*launchers.claude_bin(), "-p", text, "--output-format", "stream-json", "--verbose",
                "--allowedTools", ",".join(ASSISTANT_TOOLS), "--disallowedTools", ",".join(["Bash", "Write", "Edit", *launchers.DISALLOWED]),
                "--add-dir", str(api.REPO), "--append-system-prompt", assistant_prompt(out, cfg)]
        sid = _last_session(turns, None)
        if sid:
            argv += ["--resume", sid]
        if cfg.get("model"):
            argv += ["--model", cfg["model"]]
    else:
        step = _step(out, target)
        argv = launchers.command(step["stage"], out, cfg, step.get("nn"),
                                 resume=_last_session(turns, step["session"]), prompt=text)
    n = sum(1 for t in turns if t["role"] == "user")
    log = chat_dir(out) / f"{safe(target)}-{n:02d}.log"
    res = claude_run.run(argv, out, log, timeout_s=REPLY_TIMEOUT_S, env=launchers.AGENT_ENV)
    answer = res.text.strip() or _tail(log)
    turns = thread(out, target)
    turns.append({"role": "assistant", "text": answer, "ts": time.time(), "cost": res.cost, "usage": res.usage, "session": res.session_id,
                  "rc": res.rc, "log": str(log)})
    api.write_json(chat_dir(out) / f"{safe(target)}.json", turns)
    if then_resume and res.rc == 0:
        import orchestrate  # noqa: PLC0415 (only the request-changes path needs it)
        try:
            orchestrate.start(out)
        except RuntimeError:
            pass
    return 0 if res.rc == 0 else 1


def _tail(log: Path, n: int = 20) -> str:
    try:
        return "\n".join(log.read_text(errors="replace").splitlines()[-n:])
    except OSError:
        return "(no reply)"


def request_changes(out, fmt: str, feedback: str) -> str:
    """At the scripts gate: hand the person's feedback to the session that wrote the scripts, then resume."""
    out = Path(out).resolve()
    writers = [s for s in api.steps(out) if s["stage"] == "scripts" and s.get("session") and s.get("rc") == 0]
    if not writers:
        raise RuntimeError("no scripts session to resume (the scripts were not written from the UI); edit them here instead")
    msg = (f"The person reviewed the {'short.json and script' if fmt == 'short' else 'outline and scripts'} at the "
           f"approval gate and asks for these changes:\n\n{feedback.strip()}\n\nMake them in the files you wrote "
           f"(keep every line grounded in its cited block), rerun the step's gate commands and fix what fails, then "
           f"stop. Do not narrate, build or render. End with one paragraph saying what you changed.")
    ask(out, writers[-1]["id"], msg, then_resume=True)
    return writers[-1]["id"]


def answer_target(out) -> dict | None:
    """The agent step to hand answers to: the latest finished author step with a session (it most likely asked)."""
    for s in reversed(api.steps(out)):
        if s.get("session") and s.get("stage") in launchers.LAUNCHERS and s.get("rc") == 0:
            return s
    return None


def apply_answers(out) -> str:
    """The person answered the agents' questions in the UI: give the answers to the agent that asked, in its own
    session, so it acts on them now (not only the next agent to launch), then resume the build."""
    out = Path(out).resolve()
    if not api.answers(out):
        raise RuntimeError("no answers yet")
    step = answer_target(out)
    if not step:
        raise RuntimeError("no agent session to resume; the answers reach the next agent when the build resumes")
    msg = (f"The person answered the questions left in .chalk/ui/questions.md. Their answers are in "
           f"{api.ui_dir(out) / 'answers.md'}: read it and apply every answer to the work you wrote. Where an answer "
           f"gives a setting (for example a narration voice, which belongs in channel.json in the output dir), write it to "
           f"the file it belongs in. Where an answer is outside your stage, say so instead of doing it. Then rerun your "
           f"step's gate commands and fix what fails, and stop. Do not narrate, build or render. End with one paragraph "
           f"saying what you changed for each answer.")
    ask(out, step["id"], msg, then_resume=True)
    api.write_json(api.ui_dir(out) / "answers-applied.json", {"at": time.time(), "step": step["id"],
                                                              "answers": len(api.answers(out))})
    return step["id"]


if __name__ == "__main__":
    a = sys.argv[1:]
    sys.exit(reply(Path(a[0]), a[1], "--then-resume" in a))
