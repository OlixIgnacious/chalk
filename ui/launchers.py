"""launchers.py — who writes each author stage, and the `claude -p` command that runs it headlessly.

A launcher is keyed by the stage name in pipeline/stages.mjs. Two kinds:

  skill   a step of the format's SKILL.md (outline, syllabus, scripts), run in a plain session
  agent   one of agents/*.md, run as the session's own agent (`--agent`), defined from that file at launch
          so agents/ stays the only copy of each agent

The working directory is always the output dir. Set CLAUDE_BIN to use a stand-in, as the tests do.
"""

from __future__ import annotations

import json
import os
import shlex
from pathlib import Path

from chalk_api import REPO

AGENTS_DIR = REPO / "agents"
SKILLS = {
    "youtube": REPO / "formats/youtube/skills/chalk-youtube",
    "lesson": REPO / "formats/lesson/skills/chalk",
    "short": REPO / "formats/short/skills/chalk-short",
}
SKILL_TOOLS = ["Read", "Write", "Edit", "Grep", "Glob", "Bash", "Skill"]


def parse_agent(path: Path) -> dict:
    """agents/<name>.md → {name, description, tools, model, prompt} from its frontmatter and body."""
    text = path.read_text()
    if not text.startswith("---"):
        raise ValueError(f"{path}: no frontmatter")
    _, front, body = text.split("---", 2)
    meta = {}
    for line in front.strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip()] = v.strip()
    tools = [t.strip() for t in meta.get("tools", "").split(",") if t.strip()]
    return {"name": meta["name"], "description": meta.get("description", ""), "tools": tools,
            "model": meta.get("model", "inherit"), "prompt": body.strip()}


def agents() -> dict[str, dict]:
    return {a["name"]: a for a in map(parse_agent, sorted(AGENTS_DIR.glob("*.md")))}


def agents_json() -> str:
    """The --agents definition: every chalk agent, as Claude Code expects it."""
    defs = {}
    for name, a in agents().items():
        d = {"description": a["description"], "prompt": a["prompt"], "tools": a["tools"]}
        if a["model"] and a["model"] != "inherit":
            d["model"] = a["model"]
        defs[name] = d
    return json.dumps(defs)


# --- prompts ------------------------------------------------------------------------------------------

def _context(out: Path, cfg: dict) -> str:
    chalk = f"node {REPO / 'bin/chalk.mjs'}"
    lines = [
        "You are running headlessly from the chalk UI. Nobody can answer a question during this run: make the",
        "choice the instructions recommend, and write anything that needs the person to",
        f"{out / '.chalk/ui/questions.md'} (append, one bullet each) instead of asking.",
        "",
        f"Output dir: {out}",
        f"chalk repo: {REPO}",
        f"chalk CLI: `{chalk}`. Use it wherever the instructions say `npx chalk` or `chalk`, and",
        f"`{chalk} <core command>` wherever they say `npx chalk-core <command>`.",
    ]
    if cfg.get("channel"):
        lines.append(f"Channel settings: {cfg['channel']}")
    if cfg.get("audience"):
        lines.append(f"Audience: {cfg['audience']}")
    if cfg.get("doc"):
        lines.append(f"Source document: {cfg['doc']} (already ingested to chapter.json)")
    answers = out / ".chalk/ui/answers.md"
    if answers.exists():
        lines.append(f"The person has answered earlier questions: read {answers} first and follow it.")
    return "\n".join(lines)


def _skill_prompt(step: str, out: Path, cfg: dict) -> str:
    fmt = cfg["format"]
    skill = SKILLS[fmt]
    hints = []
    if cfg.get("segments"):
        hints.append(f"Aim for {cfg['segments']} parts.")
    if cfg.get("direction"):
        hints.append(f"Direction from the person: {cfg['direction']}")
    if fmt == "youtube" and cfg.get("notebook"):
        hints.append("A notebook is wanted (--notebook).")
    tasks = {
        ("youtube", "outline"): "Do step 2 (Outline) only: write outline.md and every file step 2's reference "
                                "says to write (video.json among them), meet step 2's gate, then stop.",
        ("lesson", "syllabus"): "Do step 2 (Syllabus) only: write syllabus.md, meet step 2's gate, then stop.",
        ("youtube", "scripts"): "Do step 3 (Script) only: write segments/NN/script.md for every part, lexicon.json, "
                                "and every derived example under segments/NN/examples/ (run each). Run step 3's gate "
                                "commands and fix what fails. Then stop: do not narrate, build frames or render.",
        ("lesson", "scripts"): "Do step 3 (Script) only: write segments/NN/script.md for every segment and lexicon.json, "
                               "and write lesson.json (step 5's manifest, with every segment's checkpoint) now, because "
                               "the checkpoints are reviewed with the scripts. Run step 3's gate commands and fix what "
                               "fails. Then stop: do not narrate, build or render.",
        ("short", "scripts"): "Write short.json and segments/00/script.md as the skill describes (copy lexicon.json from "
                              "the full video's dir if there is one, else write it), run the text gates the skill names "
                              "and fix what fails. Then stop: do not narrate, build frames or render.",
    }
    if cfg.get("idea") and fmt == "short":
        hints.append(f"The idea for this Short: {cfg['idea']}")
    return "\n\n".join([
        _context(out, cfg),
        f"Read {skill / 'SKILL.md'} first (its base directory is {skill}; `references/core` there is "
        f"{REPO / 'core/references'}), then the references the step names.",
        tasks[(fmt, step)],
        *hints,
        "End with one short paragraph: what you wrote, and anything the person should look at in review.",
    ])


def _agent_prompt(agent: str, out: Path, cfg: dict, nn: str | None) -> str:
    task = {
        "chalk-grounding": "Check the grounding of this output dir and write grounding.md.",
        "chalk-frames": f"Draw segment {nn}: write frames/s{nn}.py, build it, and check the stills.",
        "chalk-learner": "Watch this build as its audience and write learner.md.",
        "chalk-notebook-reviewer": "Review notebook.ipynb and write notebook-review.md.",
        "chalk-reviewer": "Review this build and the pipeline behind it, and write review.md.",
        "chalk-resolver": "Settle the conflicts between the reports and write resolution.md.",
    }[agent]
    return f"{_context(out, cfg)}\n\n{task}"


# --- the table ----------------------------------------------------------------------------------------

LAUNCHERS = {
    "outline": {"kind": "skill", "label": "skill · step 2", "timeout_min": 45},
    "syllabus": {"kind": "skill", "label": "skill · step 2", "timeout_min": 45},
    "scripts": {"kind": "skill", "label": "skill · step 3", "timeout_min": 60},
    "grounding": {"kind": "agent", "agent": "chalk-grounding", "timeout_min": 30},
    "frame-spec": {"kind": "agent", "agent": "chalk-frames", "per_segment": True, "timeout_min": 20},
    "learner": {"kind": "agent", "agent": "chalk-learner", "timeout_min": 30},
    "notebook-review": {"kind": "agent", "agent": "chalk-notebook-reviewer", "timeout_min": 30},
    "review": {"kind": "agent", "agent": "chalk-reviewer", "timeout_min": 45},
    "resolve": {"kind": "agent", "agent": "chalk-resolver", "timeout_min": 30},
}

# No agent fetches from the network or passes a gate. The approval rule is a second fence: every agent
# process also runs with CHALK_NO_APPROVE=1, which `chalk pipeline approve` refuses (pipeline/run.mjs).
DISALLOWED = ["Bash(curl:*)", "Bash(wget:*)", "Bash(*pipeline approve*)", "WebFetch", "WebSearch"]
AGENT_ENV = {"CHALK_NO_APPROVE": "1", "CHALK_UI": "1"}


def timeout_min(stage: str, cfg: dict) -> float:
    return float((cfg.get("timeouts") or {}).get(stage) or LAUNCHERS[stage]["timeout_min"])


def who(stage: str) -> str | None:
    """Short label of who does an author stage, for the board."""
    l = LAUNCHERS.get(stage)
    return None if not l else l.get("agent") or l["label"]


def claude_bin() -> list[str]:
    env = os.environ.get("CLAUDE_BIN")
    return shlex.split(env) if env else ["claude"]


def command(stage: str, out: Path, cfg: dict, nn: str | None = None, *, resume: str | None = None,
            prompt: str | None = None) -> list[str]:
    """The full `claude -p` argv for one author stage (one segment of it, for frame specs).

    With `resume` (a session id) and `prompt`, the same agent, tools and directories continue that session
    with the person's message: what chat and "request changes" use."""
    l = LAUNCHERS[stage]
    out = Path(out)
    if l["kind"] == "agent":
        a = agents()[l["agent"]]
        text, tools = _agent_prompt(l["agent"], out, cfg, nn), a["tools"]
        extra = ["--agents", agents_json(), "--agent", l["agent"]]
    else:
        text, tools, extra = _skill_prompt(stage, out, cfg), SKILL_TOOLS, []
    if prompt is not None:
        text = prompt
    argv = [*claude_bin(), "-p", text, "--output-format", "stream-json", "--verbose",
            "--permission-mode", "acceptEdits", "--allowedTools", ",".join(tools),
            "--disallowedTools", ",".join(DISALLOWED), "--add-dir", str(REPO), *extra]
    if resume:
        argv += ["--resume", resume]
    if cfg.get("workspace"):
        argv += ["--add-dir", str(cfg["workspace"])]
    if cfg.get("model"):
        argv += ["--model", cfg["model"]]
    return argv
