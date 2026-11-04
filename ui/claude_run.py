"""claude_run.py — run one `claude -p --output-format stream-json` process and keep what it said.

Shared by the driver (agent steps) and chat (replies). It writes two files:
    <name>.log    readable text: the agent's words, one line per tool call, a result footer
    <name>.jsonl  the raw stream, for the console's colours and for anything the text drops
and returns the exit code, the cost, the session id (needed to resume the session later) and the final text.
A watchdog ends a run that passes its time limit; that run's code is "timeout".
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Result:
    rc: int | str = 0
    cost: float | None = None
    session_id: str | None = None
    text: str = ""
    seconds: float = 0.0
    usage: dict = field(default_factory=dict)


def render_event(line: str) -> tuple[str | None, dict]:
    """One stream-json line → (text for the readable log or None, facts: cost, error, session, final)."""
    try:
        ev = json.loads(line)
    except ValueError:
        return (line.rstrip("\n") or None), {}
    t = ev.get("type")
    if t == "system" and ev.get("subtype") == "init":
        return None, {"session": ev.get("session_id")}
    if t == "assistant":
        out = []
        for part in ev.get("message", {}).get("content", []) or []:
            if part.get("type") == "text" and part.get("text", "").strip():
                out.append(part["text"].strip())
            elif part.get("type") == "tool_use":
                out.append(f"  🔧 {part.get('name')}: {summarize(part.get('name'), part.get('input') or {})}")
        return ("\n".join(out) or None), {}
    if t == "user":
        content = ev.get("message", {}).get("content")
        for part in content if isinstance(content, list) else []:
            if part.get("type") == "tool_result" and part.get("is_error"):
                body = part.get("content")
                body = body if isinstance(body, str) else json.dumps(body)
                return f"  ⚠ tool error: {body[:300]}", {}
        return None, {}
    if t == "result":
        cost = ev.get("total_cost_usd") or 0.0
        err = bool(ev.get("is_error")) or ev.get("subtype") not in (None, "success")
        mins = (ev.get("duration_ms") or 0) / 60000
        head = "✗ failed" if err else "✓ finished"
        return f"\n{head} · {mins:.1f} min · ${cost:.2f}", {
            "cost": cost, "error": err, "final": ev.get("result") or "", "usage": ev.get("usage") or {},
            "session": ev.get("session_id")}
    return None, {}


def summarize(tool: str | None, inp: dict) -> str:
    if tool == "Bash":
        return ((inp.get("command") or "").splitlines() or [""])[0][:160]
    for k in ("file_path", "path", "pattern", "skill", "description"):
        if inp.get(k):
            return str(inp[k])[:160]
    return json.dumps(inp)[:160]


def run(argv: list[str], cwd: Path, log: Path, *, header: str = "", timeout_s: float | None = None,
        env: dict | None = None, on_start=None) -> Result:
    """Run argv to the end (or the time limit), writing log and log.jsonl as it goes."""
    t0 = time.time()
    p = subprocess.Popen(argv, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
                         env={**os.environ, **(env or {})})
    if on_start:
        on_start(p)
    timed_out = threading.Event()

    def watchdog():
        if timeout_s and not done.wait(timeout_s):
            timed_out.set()
            p.terminate()
            if not done.wait(10):
                p.kill()

    done = threading.Event()
    threading.Thread(target=watchdog, daemon=True).start()
    res = Result()
    error = False
    raw_path = Path(str(log).removesuffix(".log") + ".jsonl")
    with open(log, "w") as f, open(raw_path, "w") as raw:
        if header:
            f.write(header + "\n\n")
        for line in p.stdout:
            raw.write(line)
            raw.flush()
            text, facts = render_event(line)
            if facts.get("session"):
                res.session_id = facts["session"]
            if "cost" in facts:
                res.cost, error, res.text, res.usage = facts["cost"], facts["error"], facts["final"], facts["usage"]
            if text:
                f.write(text + "\n")
                f.flush()
        rc = p.wait()
        done.set()
        if timed_out.is_set():
            f.write(f"\n⏱ stopped: over its {timeout_s / 60:.0f} min limit\n")
    res.seconds = time.time() - t0
    res.rc = "timeout" if timed_out.is_set() else (1 if rc == 0 and error else rc)
    return res
