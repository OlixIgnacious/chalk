"""orchestrate.py — drive one build until it needs a person.

    python ui/orchestrate.py <out> --token <uuid> [--from <stage>] [--only 03,07]

Runs as its own process (the UI starts it detached), so closing or refreshing the page never stops a build.
Its config is <out>/.chalk/ui/config.json, written by the UI. The loop:

    chalk pipeline  → 0  done
                    → 1  failed (the log says why)
                    → 3  stopped at a stage: an approval is the person's (stop there);
                         an author stage with a launcher runs through `claude -p` (frame specs one per
                         segment, in parallel), then the pipeline runs again;
                         anything else stops with the pipeline's reason

One driver per output dir: it holds an flock on .chalk/ui/driver.lock for its whole life, and it is the only
writer of run.json. `--from` / `--only` apply to the first pipeline pass only (a rerun).

State, for the UI to read:
    run.json     { pid, pgid, token, phase: running|gate|done|failed|stopped, message, gate, current: [step ids] }
    steps.json   one entry per step: { id, stage, nn, who, kind, log, started, ended, rc, cost, usage, session }
    logs/        <id>.log, readable text; <id>.jsonl, the raw stream of a claude step
"""

from __future__ import annotations

import argparse
import fcntl
import os
import signal
import subprocess
import sys
import threading
import time
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import chalk_api as api  # noqa: E402
import claude_run  # noqa: E402
import launchers  # noqa: E402

MAX_ROUNDS = 60  # a guard: one build passes through far fewer stops than this


class Driver:
    def __init__(self, out: Path, token: str = "", first: dict | None = None):
        self.out = Path(out).resolve()
        self.dir = api.ui_dir(self.out)
        self.logs = self.dir / "logs"
        self.logs.mkdir(exist_ok=True)
        self.cfg = api.config(self.out)
        self.token = token
        self.first = first or {}
        self.lock = threading.Lock()  # between this driver's own threads; other processes never write run.json
        self.children: set[subprocess.Popen] = set()
        self.stopping = False
        self.lock_fd = None

    # --- the single-driver lock ----------------------------------------------------------------------
    def acquire(self) -> bool:
        self.lock_fd = os.open(api.lock_path(self.out), os.O_RDWR | os.O_CREAT, 0o644)
        try:
            fcntl.flock(self.lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            os.close(self.lock_fd)
            self.lock_fd = None
            return False
        return True

    # --- state (only this process writes run.json and steps.json) -------------------------------------
    def set_run(self, **kw):
        with self.lock:
            s = api.run_state(self.out)
            s.update(kw, pid=os.getpid(), pgid=os.getpgid(0), token=self.token, updated=time.time())
            api.write_json(self.dir / "run.json", s)

    def add_step(self, **step) -> dict:
        with self.lock:
            all_ = api.steps(self.out)
            seq = len(all_) + 1
            step["id"] = f"{seq:03d}-{step['stage']}{'-' + step['nn'] if step.get('nn') else ''}-{int(time.time() * 1000) % 10**8}"
            step["log"] = str(self.logs / f"{step['id']}.log")
            step["started"] = time.time()
            all_.append(step)
            api.write_json(self.dir / "steps.json", all_)
            s = api.run_state(self.out)
            s["current"] = [*s.get("current", []), step["id"]]
            api.write_json(self.dir / "run.json", s)
        return step

    def end_step(self, step: dict, rc, **kw):
        with self.lock:
            all_ = api.steps(self.out)
            for s in all_:
                if s["id"] == step["id"]:
                    s.update(kw, rc=rc, ended=time.time())
            api.write_json(self.dir / "steps.json", all_)
            s = api.run_state(self.out)
            s["current"] = [c for c in s.get("current", []) if c != step["id"]]
            api.write_json(self.dir / "run.json", s)

    # --- running things ------------------------------------------------------------------------------
    def pipeline(self, first: dict | None) -> int:
        what = " ".join(f"--{k} {','.join(v) if isinstance(v, list) else v}" for k, v in (first or {}).items() if v)
        step = self.add_step(stage="pipeline", nn=None, who="chalk pipeline" + (f" {what}" if what else ""), kind="run")
        p = subprocess.Popen(api.pipeline_cmd(self.out, self.cfg, first), cwd=self.out, stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, bufsize=1, env={**os.environ, "CHALK_UI": "1"})
        self.children.add(p)
        with open(step["log"], "w") as f:
            for line in p.stdout:
                f.write(line)
                f.flush()
        rc = p.wait()
        self.children.discard(p)
        self.end_step(step, rc)
        return rc

    def claude(self, stage: str, nn: str | None) -> int | str:
        who = launchers.who(stage)
        step = self.add_step(stage=stage, nn=nn, who=who, kind=launchers.LAUNCHERS[stage]["kind"])
        res = claude_run.run(launchers.command(stage, self.out, self.cfg, nn), self.out, Path(step["log"]),
                             header=f"▶ {who}{f' · segment {nn}' if nn else ''}",
                             timeout_s=launchers.timeout_min(stage, self.cfg) * 60, env=launchers.AGENT_ENV,
                             on_start=self.children.add)
        self.end_step(step, res.rc, cost=res.cost, session=res.session_id, usage=res.usage)
        return res.rc

    # --- the loop ------------------------------------------------------------------------------------
    def run(self) -> int:
        self.set_run(phase="running", message="starting", gate=None, current=[], started=time.time(), ended=None)
        last, first = None, self.first
        for _ in range(MAX_ROUNDS):
            if self.stopping:
                return self.finish("stopped", "stopped by you")
            rc = self.pipeline(first)
            first = None
            if self.stopping:
                return self.finish("stopped", "stopped by you")
            if rc == 0:
                return self.finish("done", "everything is done")
            if rc != 3:
                return self.finish("failed", f"chalk pipeline exited {rc}: see its log")
            st = api.status(self.out, self.cfg["format"])
            b = api.blocker(st)
            if not b:
                continue
            why = b["left"][0].get("why") or ""
            if b["kind"] == "approve":
                return self.finish("gate", why, gate=b["name"])
            if b["kind"] != "author" or b["name"] not in launchers.LAUNCHERS:
                return self.finish("failed", f"{b['name']}: {why}")
            nns = [c["nn"] for c in b["left"]] if b["per"] else [None]
            sig = (b["name"], tuple(nns))
            if sig == last:
                return self.finish("failed", f"{b['name']} ran but is still waiting: {why}")
            last = sig
            over = api.over_budget(self.out, self.cfg)
            if over:
                return self.finish("failed", f"{over}. Raise it in Build settings to go on.")
            who = launchers.who(b["name"])
            self.set_run(message=f"{who} on {', '.join(n for n in nns if n) or 'the build'}")
            jobs = max(1, int(self.cfg.get("jobs") or 3)) if b["per"] else 1
            with ThreadPoolExecutor(jobs) as pool:
                codes = list(pool.map(lambda nn: self.claude(b["name"], nn), nns))
            if self.stopping:
                return self.finish("stopped", "stopped by you")
            bad = [(n or b["name"], c) for n, c in zip(nns, codes) if c != 0]
            if bad:
                kind = "ran past its time limit" if any(c == "timeout" for _, c in bad) else "failed"
                return self.finish("failed", f"{who} {kind} ({', '.join(n for n, _ in bad)}): see its log")
        return self.finish("failed", "too many rounds; something keeps reopening")

    def finish(self, phase: str, message: str, gate=None) -> int:
        self.set_run(phase=phase, message=message, gate=gate, current=[], ended=time.time())
        notify(self.cfg, self.out, phase, gate, message)
        return 0 if phase in ("done", "gate") else 1

    def stop(self, *_):
        self.stopping = True
        for p in list(self.children):
            try:
                p.terminate()
            except OSError:
                pass


# --- notifications -----------------------------------------------------------------------------------

def notify(cfg: dict, out: Path, phase: str, gate: str | None, message: str) -> None:
    """Tell the person when the build needs them or has stopped: a macOS notification, and ntfy if set."""
    if phase not in ("gate", "failed", "done") or os.environ.get("CHALK_UI_QUIET"):
        return
    title = {"gate": "✋ chalk: your turn", "failed": "✗ chalk: stopped", "done": "✓ chalk: done"}[phase]
    body = f"{out.name}: {api.GATE_TITLES.get(gate, message) if phase == 'gate' else message}"[:200]
    if sys.platform == "darwin":
        esc = lambda s: s.replace("\\", "\\\\").replace('"', '\\"')  # noqa: E731
        subprocess.run(["osascript", "-e", f'display notification "{esc(body)}" with title "{esc(title)}"'],
                       capture_output=True, timeout=10)
    if cfg.get("ntfy_topic"):
        try:
            req = urllib.request.Request(f"https://ntfy.sh/{cfg['ntfy_topic']}", data=body.encode(),
                                         headers={"Title": title.encode("ascii", "ignore").decode()})
            urllib.request.urlopen(req, timeout=10)
        except OSError:
            pass


# --- starting and stopping from the UI ----------------------------------------------------------------

def start(out: Path, first: dict | None = None, wait_s: float = 5.0) -> int:
    """Start a detached driver for <out>; return its pid once it holds the lock. Refuses if one is running."""
    out = Path(out).resolve()
    if api.driver_running(out):
        raise RuntimeError("a build is already running on this output dir")
    token = uuid.uuid4().hex
    argv = [sys.executable, str(Path(__file__).resolve()), str(out), "--token", token]
    if first and first.get("from"):
        argv += ["--from", first["from"]]
    if first and first.get("only"):
        argv += ["--only", ",".join(first["only"])]
    with open(api.ui_dir(out) / "driver.log", "a") as log:
        p = subprocess.Popen(argv, cwd=str(api.REPO), stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    deadline = time.time() + wait_s
    while time.time() < deadline:
        if api.driver_running(out) and api.run_state(out).get("token") == token:
            return p.pid
        if p.poll() is not None:
            tail = (api.ui_dir(out) / "driver.log").read_text(errors="replace").strip().splitlines()[-3:]
            raise RuntimeError("the driver exited at once: " + (" | ".join(tail) or f"code {p.returncode}"))
        time.sleep(0.1)
    return p.pid


def _command_of(pid: int) -> str:
    try:
        return subprocess.run(["ps", "-o", "command=", "-p", str(pid)], capture_output=True, text=True,
                              timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def stop(out: Path) -> bool:
    """Stop the driver for <out> and everything it started — only if the process really is that driver."""
    out = Path(out).resolve()
    s = api.run_state(out)
    pid, pgid, token = s.get("pid"), s.get("pgid"), s.get("token")
    if not (pid and token and api.driver_running(out) and token in _command_of(pid)):
        return False
    try:
        os.killpg(pgid or os.getpgid(pid), signal.SIGTERM)
    except OSError:
        return False
    return True


def main(argv) -> int:
    ap = argparse.ArgumentParser(prog="orchestrate.py")
    ap.add_argument("out")
    ap.add_argument("--token", default="")
    ap.add_argument("--from", dest="from_")
    ap.add_argument("--only")
    a = ap.parse_args(argv)
    first = {"from": a.from_, "only": [s.strip().zfill(2) for s in a.only.split(",")] if a.only else None}
    d = Driver(Path(a.out), a.token, first)
    if not d.cfg.get("format"):
        print("no config.json: start the build from the UI", file=sys.stderr)
        return 2
    if not d.acquire():
        print("another driver holds the lock on this output dir", file=sys.stderr)
        return 3
    signal.signal(signal.SIGTERM, d.stop)
    signal.signal(signal.SIGINT, d.stop)
    try:
        return d.run()
    except Exception as err:  # the UI must see why, not a dead lock
        d.finish("failed", f"{type(err).__name__}: {err}")
        raise


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
