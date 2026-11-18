"""chalk_api.py — the UI's only door into the Node pipeline, and its own small state under .chalk/ui/.

Everything about stages goes through `bin/chalk.mjs`: the UI never re-implements a stage, a hash or a
status rule. It asks `chalk status --json`, runs `chalk pipeline`, and records approvals with
`chalk pipeline approve`. Set CHALK_BIN to a different command (space-separated) to point the UI at a
stand-in, as the tests do.
"""

from __future__ import annotations

import difflib
import fcntl
import json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# What each format makes, and what a person reads at each gate. A gate pane is (label, file); a file
# that does not exist yet is shown as "not written yet", so the panes are the same at every build.
FORMATS = {
    "long": {
        "label": "Long video", "root": "long-output", "roots": ["long-output", "youtube-output"], "final": "video.mp4", "glyph": "▶",
        "blurb": "One chaptered 1080p video with captions, chapters, description and thumbnail, plus an optional notebook.",
        "plan": "outline.md",
        "gates": {
            "research-approved": [("Research brief", "research.md")],
            "scripts-approved": [("Outline", "outline.md"), ("Scripts", "@scripts"), ("Grounding", "grounding.md"),
                                 ("Source check", "facts.md")],
            "watched": [("Video", "@final"), ("Resolution", "resolution.md"), ("Review", "review.md")],
        },
    },
    "lesson": {
        "label": "Interactive lesson", "root": "chalk-output", "final": "lesson.mp4", "glyph": "◧",
        "blurb": "Short narrated segments in a lesson page, with a checkpoint question between each.",
        "plan": "syllabus.md",
        "gates": {
            "research-approved": [("Research brief", "research.md")],
            "scripts-approved": [("Syllabus", "syllabus.md"), ("Checkpoints", "lesson.json"), ("Scripts", "@scripts"),
                                 ("Grounding", "grounding.md")],
            "watched": [("Lesson page", "@lesson"), ("Resolution", "resolution.md"), ("Review", "review.md")],
        },
    },
    "short": {
        "label": "Short / Reel", "root": "shorts-output", "final": "short.mp4", "glyph": "▮",
        "blurb": "One idea as a 30–60 s vertical video for Shorts and Reels, captions burned in.",
        "plan": "short.json",
        "gates": {
            "research-approved": [("Research brief", "research.md")],
            "scripts-approved": [("short.json", "short.json"), ("Script", "@scripts"), ("Grounding", "grounding.md")],
            "watched": [("Short", "@final"), ("Review", "review.md")],
        },
    },
}
INGESTS = ["md", "txt", "epub", "pdf"]  # core/scripts/ingest.mjs
# the long shape's old name: a build or a config that says "youtube" is a long build (formats/index.mjs)
ALIASES = {"youtube": "long"}


def shape(fmt):
    """A format name as the pipeline knows it: "youtube" is "long"."""
    return ALIASES.get(fmt, fmt)
GATE_FLAG = {"research-approved": "research", "scripts-approved": "scripts", "watched": "watched"}
GATE_TITLES = {"research-approved": "Approve the research brief", "scripts-approved": "Approve the scripts", "watched": "Approve the final watch"}


# --- the CLI -------------------------------------------------------------------------------------------

def chalk_bin() -> list[str]:
    env = os.environ.get("CHALK_BIN")
    return shlex.split(env) if env else ["node", str(REPO / "bin" / "chalk.mjs")]


def status(out: str | Path, fmt: str) -> dict:
    """The stage board: `chalk status <out> --format <fmt> --json`."""
    p = subprocess.run([*chalk_bin(), "status", str(out), "--format", fmt, "--json"],
                       capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip() or f"chalk status exited {p.returncode}")
    return json.loads(p.stdout)


def approve(out: str | Path, fmt: str, what: str) -> str:
    """Record a human gate: what is "research", "scripts" or "watched"."""
    if what not in ("research", "scripts", "watched"):
        raise ValueError(what)
    p = subprocess.run([*chalk_bin(), "pipeline", "approve", str(out), "--format", fmt, f"--{what}"],
                       capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip() or p.stdout.strip())
    return p.stdout.strip()


def pipeline_cmd(out: str | Path, cfg: dict, first: dict | None = None) -> list[str]:
    """argv for one `chalk pipeline` pass. `first` ({from, only}) is for the first pass of a rerun only.
    Exit 0 done, 3 waiting, 1 failed, 2 usage."""
    argv = [*chalk_bin(), "pipeline", str(out), "--format", cfg["format"]]
    if cfg.get("doc"):
        argv += ["--doc", str(cfg["doc"])]
        if cfg.get("kind"):
            argv += ["--kind", cfg["kind"]]
    elif cfg.get("topic"):
        argv += ["--topic", cfg["topic"]]  # no document: the research agent writes the brief, the person approves it
    if cfg.get("channel"):
        argv += ["--channel", str(cfg["channel"])]
    if cfg.get("notebook"):
        argv.append("--notebook")
    if cfg.get("jobs"):
        argv += ["--jobs", str(cfg["jobs"])]
    if first and first.get("from"):
        argv += ["--from", first["from"]]
    if first and first.get("only"):
        argv += ["--only", ",".join(first["only"])]
    return argv


def blocker(st: dict) -> dict | None:
    """The stage the pipeline stopped at: the first one with a cell not done, and those cells."""
    for stage in st["stages"]:
        left = [c for c in stage["cells"] if c["status"] != "done"]
        if left:
            return {**stage, "left": left}
    return None


def open_gate(st: dict) -> str | None:
    """The human gate the build is at, from the live board (never from what a driver last wrote)."""
    b = blocker(st)
    return b["name"] if b and b["kind"] == "approve" else None


def fingerprint(out: str | Path) -> tuple:
    """Cheap: the newest mtime and the file count under out (stat only, no reads), skipping the UI's own
    state and the render engine's scratch, plus steps.json (every step the driver records). Status is cached against this, so the board polls without re-hashing anything."""
    out = Path(out)
    newest, n = 0.0, 0
    for root, dirs, files in os.walk(out):
        parts = Path(os.path.relpath(root, out)).parts
        if parts[:2] == (".chalk", "ui"):
            dirs[:] = []
            continue
        # stage outputs live under work/ too (words, captions): only the render engine's scratch is skipped
        dirs[:] = [d for d in dirs if d not in ("node_modules", "__pycache__", "renders", "compositions", "assets")]
        for f in files:
            if f == "hashcache.json":
                continue
            try:
                newest = max(newest, os.stat(os.path.join(root, f)).st_mtime)
                n += 1
            except OSError:
                pass
    steps_f = out / ".chalk" / "ui" / "steps.json"
    if steps_f.exists():
        newest = max(newest, steps_f.stat().st_mtime)
    return newest, n


# --- the UI's own state, under <out>/.chalk/ui/ -------------------------------------------------------

def ui_dir(out: str | Path) -> Path:
    d = Path(out) / ".chalk" / "ui"
    d.mkdir(parents=True, exist_ok=True)
    return d


def read_json(path: Path, default):
    try:
        return json.loads(Path(path).read_text())
    except (OSError, ValueError):
        return default


def write_json(path: Path, data) -> None:
    """Atomic, and safe with several writers: each write has its own temp file."""
    write_text(path, json.dumps(data, indent=2) + "\n")


def write_text(path: Path, text: str) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def config(out) -> dict:
    cfg = read_json(ui_dir(out) / "config.json", {})
    if cfg.get("format"):
        cfg["format"] = shape(cfg["format"])
    return cfg


def save_config(out, cfg: dict) -> None:
    write_json(ui_dir(out) / "config.json", cfg)


def run_state(out) -> dict:
    return read_json(ui_dir(out) / "run.json", {"phase": "idle"})


def steps(out) -> list[dict]:
    return read_json(ui_dir(out) / "steps.json", [])


def lock_path(out) -> Path:
    return ui_dir(out) / "driver.lock"


def driver_running(out) -> bool:
    """True while a driver holds the lock. A crashed driver releases it, so a stale pid never counts."""
    try:
        fd = os.open(lock_path(out), os.O_RDWR | os.O_CREAT, 0o644)
    except OSError:
        return False
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        return True
    else:
        fcntl.flock(fd, fcntl.LOCK_UN)
        return False
    finally:
        os.close(fd)


def phase(out) -> str:
    """The run phase, corrected: "running" with no driver holding the lock is a driver that died."""
    p = run_state(out).get("phase", "idle")
    if p == "running" and not driver_running(out):
        return "crashed"
    return p


def format_of(out) -> str | None:
    """The format an existing output dir was built as: config, then the pipeline's record, then manifests."""
    out = Path(out)
    fmt = config(out).get("format") or read_json(out / ".chalk" / "pipeline.json", {}).get("opts", {}).get("format")
    if fmt:
        return shape(fmt)
    if (out / "short.json").exists():
        return "short"
    if (out / "lesson.json").exists() or (out / "syllabus.md").exists():
        return "lesson"
    return "long" if (out / "chapter.json").exists() else None


# --- money and time ----------------------------------------------------------------------------------

def chat_turns(out) -> dict[str, list[dict]]:
    d = ui_dir(out) / "chat"
    return {p.stem: read_json(p, []) for p in sorted(d.glob("*.json"))} if d.exists() else {}


COST_NOTE = ("An estimate, not a charge: Claude Code prices each run's tokens at API list prices. On a Claude "
             "subscription you are not billed per dollar; runs count against your plan's usage limits, which the "
             "token count tracks more directly. Local steps (voice, captions, render) use no Claude tokens.")


def tokens(usage: dict | None) -> int:
    """Tokens a run processed: input (fresh, cache writes and cache reads) plus output."""
    u = usage or {}
    return sum(int(u.get(k) or 0) for k in
               ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"))


def fmt_tokens(n: int) -> str:
    return f"{n / 1e6:.1f}M" if n >= 1e6 else f"{n / 1e3:.0f}k" if n >= 1e3 else str(n)


def totals(out) -> dict:
    """Estimated API cost, tokens and time across the build: every agent step and every chat reply."""
    ss = steps(out)
    turns = [t for ts in chat_turns(out).values() for t in ts]
    agent_cost = sum(s.get("cost") or 0 for s in ss)
    chat_cost = sum(t.get("cost") or 0 for t in turns)
    agent_tokens = sum(tokens(s.get("usage")) for s in ss)
    chat_tokens = sum(tokens(t.get("usage")) for t in turns)
    started = min((s["started"] for s in ss), default=None)
    ended = max((s.get("ended") or time.time() for s in ss), default=None)
    return {"cost": agent_cost + chat_cost, "agent_cost": agent_cost, "chat_cost": chat_cost,
            "tokens": agent_tokens + chat_tokens, "agent_tokens": agent_tokens, "chat_tokens": chat_tokens,
            "elapsed": (ended - started) if started else 0, "steps": len(ss)}


def over_budget(out, cfg: dict) -> str | None:
    """Why the build may not launch another agent, or None. A budget is in tokens, estimated $, or both."""
    t = totals(out)
    if cfg.get("max_tokens") and t["tokens"] >= int(cfg["max_tokens"]):
        return f"token budget reached: {fmt_tokens(t['tokens'])} of {fmt_tokens(int(cfg['max_tokens']))}"
    if cfg.get("max_usd") and t["cost"] >= float(cfg["max_usd"]):
        return f"budget reached: est. ${t['cost']:.2f} of ${float(cfg['max_usd']):.2f}"
    return None


# --- the eval ----------------------------------------------------------------------------------------

def eval_report(out) -> dict | None:
    return read_json(Path(out) / "eval.json", None)


def accepts_file(out, fmt: str) -> Path:
    """Where the eval reads accepted failures: video.json, or a Short's short.json (evals/lib/load.mjs)."""
    out = Path(out)
    if fmt == "short" and not (out / "video.json").exists():
        return out / "short.json"
    return out / "video.json"


def accept(out, fmt: str, cid: str, reason: str) -> Path:
    if not reason.strip():
        raise ValueError("say why this failure is kept")
    f = accepts_file(out, fmt)
    data = read_json(f, {}) if f.exists() else {}
    if f.exists() and not data:
        raise RuntimeError(f"{f.name} is not valid JSON; fix it first")
    data.setdefault("accepted", {})[cid] = reason.strip()
    write_json(f, data)
    return f


def unaccept(out, fmt: str, cid: str) -> None:
    f = accepts_file(out, fmt)
    data = read_json(f, {})
    if cid in data.get("accepted", {}):
        del data["accepted"][cid]
        if not data["accepted"]:
            del data["accepted"]
        write_json(f, data)


def record_eval(out) -> dict | None:
    """Keep each new eval score, so the header can show the change since the last one."""
    rep = eval_report(out)
    if not rep:
        return None
    hist_f = ui_dir(out) / "eval-history.json"
    hist = read_json(hist_f, [])
    mtime = (Path(out) / "eval.json").stat().st_mtime
    if not hist or hist[-1]["mtime"] != mtime:
        hist.append({"mtime": mtime, "percent": rep.get("percent"), "score": rep.get("score"), "max": rep.get("max")})
        write_json(hist_f, hist[-50:])
    prev = hist[-2]["percent"] if len(hist) > 1 else None
    return {**rep, "previous": prev}


# --- questions the agents left, and the person's answers ----------------------------------------------

def questions(out) -> list[str]:
    f = ui_dir(out) / "questions.md"
    if not f.exists():
        return []
    qs, cur = [], None
    for line in f.read_text(errors="replace").splitlines():
        if re.match(r"^\s*[-*]\s+", line):
            if cur:
                qs.append(cur.strip())
            cur = re.sub(r"^\s*[-*]\s+", "", line)
        elif cur is not None and line.strip():
            cur += " " + line.strip()
    if cur:
        qs.append(cur.strip())
    return qs


def answers(out) -> dict[str, str]:
    return read_json(ui_dir(out) / "answers.json", {})


def open_questions(out) -> list[str]:
    a = answers(out)
    return [q for q in questions(out) if q not in a]


def answer(out, question: str, text: str) -> None:
    a = answers(out)
    a[question] = text.strip()
    write_json(ui_dir(out) / "answers.json", a)
    md = "# The person's answers\n\nRead these before deciding anything they cover.\n\n" + "\n\n".join(
        f"**Q:** {q}\n**A:** {t}" for q, t in a.items())
    write_text(ui_dir(out) / "answers.md", md + "\n")


# --- approvals: what was reviewed, and what changed since ---------------------------------------------

def gate_files(out, fmt: str, gate: str) -> list[Path]:
    """The files a gate shows, expanded (scripts → every segments/NN/script.md)."""
    out = Path(out)
    files = []
    for _, f in FORMATS[fmt]["gates"].get(gate, []):
        if f == "@scripts":
            files += sorted(out.glob("segments/*/script.md"))
        elif not f.startswith("@"):
            files.append(out / f)
    return [f for f in files if f.exists() and f.suffix in (".md", ".json", ".txt")]


def snapshot(out, fmt: str, gate: str) -> None:
    dest = ui_dir(out) / "approved" / gate
    shutil.rmtree(dest, ignore_errors=True)
    for f in gate_files(out, fmt, gate):
        rel = f.relative_to(out)
        (dest / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dest / rel)


def changes_since_approval(out, fmt: str, gate: str) -> list[tuple[str, str]]:
    """[(relative path, unified diff)] for every reviewed file that changed since it was approved."""
    out = Path(out)
    base = ui_dir(out) / "approved" / gate
    if not base.exists():
        return []
    now = {f.relative_to(out) for f in gate_files(out, fmt, gate)}
    then = {p.relative_to(base) for p in base.rglob("*") if p.is_file()}
    diffs = []
    for rel in sorted(now | then, key=str):
        a = (base / rel).read_text(errors="replace").splitlines(keepends=True) if rel in then else []
        b = (out / rel).read_text(errors="replace").splitlines(keepends=True) if rel in now else []
        if a != b:
            diffs.append((str(rel), "".join(difflib.unified_diff(a, b, f"approved/{rel}", f"now/{rel}", n=2))))
    return diffs


def approve_gate(out, fmt: str, gate: str) -> str:
    """Approve only the gate the live board is at, and keep a copy of what was approved."""
    live = open_gate(status(out, fmt))
    if live != gate:
        raise RuntimeError(f"the build is no longer at {gate} (now: {live or 'not at a gate'}); look again")
    msg = approve(out, fmt, GATE_FLAG[gate])
    snapshot(out, fmt, gate)
    return msg


# --- builds on disk ----------------------------------------------------------------------------------

RECENT = Path.home() / ".chalk" / "ui-recent.json"


def remember(out) -> None:
    rec = [p for p in read_json(RECENT, []) if p != str(out)]
    try:
        write_json(RECENT, [str(out), *rec][:30])
    except OSError:
        pass


def builds(workspace: str | Path | None) -> list[dict]:
    """Every output dir under a workspace, plus recently opened ones, newest first."""
    seen, rows = set(), []
    cands = []
    if workspace:
        ws = Path(workspace).expanduser()
        for f in FORMATS.values():
            for root in f.get("roots", [f["root"]]):
                cands += [p.parent for p in (ws / root).glob("*/.chalk")]
    cands += [Path(p) for p in read_json(RECENT, [])]
    for out in cands:
        out = out.resolve()
        if out in seen or not (out / ".chalk").is_dir():
            continue
        seen.add(out)
        fmt = format_of(out)
        if not fmt:
            continue
        rep = eval_report(out)
        state = out / ".chalk" / "ui" / "run.json"
        pipe = out / ".chalk" / "pipeline.json"
        updated = max((f.stat().st_mtime for f in (state, pipe) if f.exists()), default=out.stat().st_mtime)
        rows.append({"out": str(out), "name": out.name, "format": fmt, "phase": phase(out) if (out / ".chalk/ui").exists() else "cli",
                     "updated": updated, "cost": totals(out)["cost"] if (out / ".chalk/ui").exists() else 0.0,
                     "tokens": totals(out)["tokens"] if (out / ".chalk/ui").exists() else 0,
                     "eval": rep.get("percent") if rep else None})
    return sorted(rows, key=lambda r: -r["updated"])


# --- source documents --------------------------------------------------------------------------------

def save_upload(workspace: str | Path, name: str, data: bytes) -> tuple[Path, str | None]:
    """Save an uploaded source into <workspace>/docs/. Same name and same bytes: reuse it. Same name and
    different bytes: never overwrite, save as name-2, name-3… and say so."""
    ext = Path(name).suffix.lower().lstrip(".")
    if ext not in INGESTS:
        raise ValueError(f".{ext} cannot be ingested (supported: {', '.join(INGESTS)})")
    docs = Path(workspace).expanduser() / "docs"
    docs.mkdir(parents=True, exist_ok=True)
    dest, note, n = docs / name, None, 2
    while dest.exists() and dest.read_bytes() != data:
        dest = docs / f"{Path(name).stem}-{n}{Path(name).suffix}"
        n += 1
    if dest.name != name:
        note = f"docs/{name} already holds a different file; saved this one as {dest.name}"
    if not dest.exists():
        dest.write_bytes(data)
    return dest, note


# --- caption alignment mismatches ----------------------------------------------------------------------
# align-captions prints `MISMATCH line=l006 display="Y." expected~"Y." heard="First," @24.69s` when the transcript
# carries a word in another form than the script ("158,000" for "158 thousand", "homoscate" for
# "homoscedasticity"). The fix is a lexicon term whose `heard` is what the transcript returns
# (core/references/captions-and-engine.md); these helpers let the UI propose, check and save one.

_MISMATCH = re.compile(r'MISMATCH line=(l\d+) display="([^"]*)" expected~"([^"]*)" heard="([^"]*)" @([\d.]+)s')


def mismatches(log_text: str) -> list[dict]:
    """Every MISMATCH in a pipeline log, with the segment its `▶  align NN` header names."""
    out, nn = [], None
    for line in log_text.splitlines():
        h = re.match(r"^▶\s+align (\d\d)", line.strip())
        if h:
            nn = h.group(1)
        m = _MISMATCH.search(line)
        if m and nn:
            out.append({"nn": nn, "line": m[1], "display": m[2], "heard": m[4], "at": float(m[5])})
    return out


def mismatch_context(out, nn: str, line_id: str, at: float) -> dict:
    """The script line (display) the mismatch is in, and what the transcript holds around that moment."""
    out = Path(out)
    tokens = read_json(out / "work" / nn / "script-tokens.json", {}).get("lines", [])
    line = next((l for l in tokens if l["id"] == line_id), None)
    display = " ".join(t if isinstance(t, str) else t["display"] for t in (line or {}).get("tokens", []))
    w = read_json(out / "work" / nn / "words.json", [])
    words = w.get("words", w) if isinstance(w, dict) else w
    near = [x for x in words if abs(float(x.get("start", 0)) - at) < 3]
    return {"display": display, "heard": " ".join(str(x.get("text", x.get("word", ""))) for x in near)}


def suggest_term(m: dict, ctx: dict) -> dict:
    """A first guess: the display word with its punctuation stripped, heard as the transcript wrote it."""
    strip = lambda w: w.strip(".,;:!?\"'")  # noqa: E731
    return {"display": strip(m["display"]), "heard": strip(m["heard"])}


def check_alignment(out, terms: list[dict], nns: list[str]) -> dict[str, str]:
    """Dry run: build tokens with the lexicon plus `terms` and align each segment into a temp dir.
    Returns {nn: the aligner's summary line}. Nothing in the build is touched."""
    out = Path(out)
    lex = read_json(out / "lexicon.json", {"terms": []})
    have = {t["display"] for t in lex["terms"]}
    lex = {**lex, "terms": [*lex["terms"], *[{"spoken": t["display"], **t} for t in terms if t["display"] not in have]]}
    res = {}
    with tempfile.TemporaryDirectory() as d:
        lp = Path(d) / "lexicon.json"
        lp.write_text(json.dumps(lex))
        for nn in nns:
            tok, cap = Path(d) / f"{nn}-tokens.json", Path(d) / f"{nn}-captions.json"
            b = subprocess.run(["node", str(REPO / "core/scripts/build-tokens.mjs"), str(out / f"segments/{nn}/script.md"),
                                str(lp), str(tok)], capture_output=True, text=True)
            if b.returncode:
                res[nn] = (b.stderr or b.stdout).strip()
                continue
            a = subprocess.run([*chalk_bin(), "align-captions", "--tokens", str(tok), "--words",
                                str(out / f"work/{nn}/words.json"), "--out", str(cap)], capture_output=True, text=True)
            lines = [l for l in (a.stdout + a.stderr).splitlines() if "MISMATCH" in l or "aligned" in l]
            res[nn] = "\n".join(lines[-4:]) or f"exit {a.returncode}"
    return res


def add_lexicon_terms(out, terms: list[dict]) -> int:
    """Add caption terms to lexicon.json (backed up first). `spoken` defaults to the display form, which
    leaves what the voice says unchanged; the new terms still re-run narration, which is local."""
    out = Path(out)
    f = out / "lexicon.json"
    lex = read_json(f, None)
    if not lex or not isinstance(lex.get("terms"), list):
        raise RuntimeError("lexicon.json is missing or not valid")
    shutil.copy2(f, ui_dir(out) / f"lexicon.{int(time.time())}.bak.json")
    have = {t["display"]: t for t in lex["terms"]}
    n = 0
    for t in terms:
        if not t.get("display") or not t.get("heard"):
            continue
        if t["display"] in have:
            have[t["display"]]["heard"] = t["heard"]
        else:
            lex["terms"].append({"display": t["display"], "spoken": t.get("spoken") or t["display"], "heard": t["heard"],
                                 "note": "added from the UI to fix a caption mismatch"})
        n += 1
    write_json(f, lex)
    return n


def eval_failures(log_text: str) -> list[dict]:
    """`fail E3 Title` lines from an eval run in a pipeline log, each with its indented evidence lines."""
    out, cur = [], None
    for line in log_text.splitlines():
        m = re.match(r"^fail ([A-Z]\d+) (.*)$", line)
        if m:
            cur = {"id": m[1], "title": m[2], "evidence": []}
            out.append(cur)
        elif cur and line.startswith("       ") and line.strip():
            cur["evidence"].append(line.strip())
        else:
            cur = None
    return out


def accepted(out, fmt: str) -> dict:
    return read_json(accepts_file(out, fmt), {}).get("accepted", {})
