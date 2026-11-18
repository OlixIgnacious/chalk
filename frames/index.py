"""index.py — writes frames/COMPONENTS.md from framelib's docstrings: one row per public Frame method.

The chalk-frames agent reads COMPONENTS.md before it picks a component, which is cheaper than reading the
library, and the "Avoid for" column is a rule, not a hint. A component's docstring ends in a tagged tail:

    Use for: …
    Avoid for: …
    Length: …        (the reveal's natural duration)
    Themes: …        (only when a component suits some themes)

    python3 frames/index.py            write COMPONENTS.md
    python3 frames/index.py --check    exit 1 when COMPONENTS.md is not what the docstrings say
"""
import ast
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GROUPS = [
    ("Text", ["headline", "text", "label", "rule"]),
    ("Code", ["code_build", "code_show", "code_trace", "code_run", "code", "highlight", "unhighlight"]),
    ("Values and structures", ["cells", "pointer_walk", "setbox", "chip", "table", "block_table", "table_rows", "node", "bar", "arrow", "svg"]),
    ("Plans and judgements", ["plan_card", "reject", "roadmap"]),
    ("Motion", ["rise", "fade", "pop", "wipe", "draw", "to", "set", "dim", "mark", "field"]),
    ("Skits", ["stage", "pose", "shot", "line_start", "chalk"]),
    ("Timing", ["cue", "at"]),
]
INTERNAL = {"uid", "block", "example_output", "add", "box", "chrome", "progress_strip", "stage_card", "ground", "write"}
TAGS = ("Use for", "Avoid for", "Length", "Themes")


def components():
    tree = ast.parse((HERE / "framelib.py").read_text())
    cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "Frame")
    out = {}
    for m in cls.body:
        if isinstance(m, ast.FunctionDef) and not m.name.startswith("_") and m.name not in INTERNAL:
            doc = ast.get_docstring(m) or ""
            tags = {t: "" for t in TAGS}
            summary = []
            for line in doc.splitlines():
                hit = next((t for t in TAGS if line.startswith(t + ":")), None)
                if hit:
                    tags[hit] = line[len(hit) + 1:].strip()
                elif not any(tags.values()):
                    summary.append(line.strip())
            args = ", ".join(a.arg for a in m.args.args[1:])
            out[m.name] = {"sig": f"{m.name}({args})", "summary": " ".join(summary).split(". ")[0].strip().rstrip(".") + ".", **tags}
    return out


def render():
    comps = components()
    cell = lambda s: (s or "—").replace("|", "\\|")
    lines = ["# Frame components", "",
             "Generated from `framelib.py` by `python3 frames/index.py`; do not edit by hand. Read a component's row before",
             "you use it. When its **Avoid for** matches your scene, take what it names instead. A component you need and",
             "cannot find is named in your reply, so it can be added to the library: never copy helpers between builds.", ""]
    seen = set()
    for title, names in GROUPS:
        rows = [n for n in names if n in comps]
        if not rows:
            continue
        lines += [f"## {title}", "", "| Component | What | Use for | Avoid for | Length |", "|---|---|---|---|---|"]
        for n in rows:
            c = comps[n]
            themes = f" Themes: {c['Themes']}" if c["Themes"] else ""
            lines.append(f"| `{c['sig']}` | {cell(c['summary'] if c['summary'] != '.' else '')} | {cell(c['Use for'])} | {cell(c['Avoid for'] + themes)} | {cell(c['Length'])} |")
            seen.add(n)
        lines.append("")
    rest = sorted(set(comps) - seen)
    if rest:
        lines += ["## Other", "", "| Component | What |", "|---|---|", *[f"| `{comps[n]['sig']}` | {cell(comps[n]['summary'])} |" for n in rest], ""]
    return "\n".join(lines)


if __name__ == "__main__":
    want = render()
    path = HERE / "COMPONENTS.md"
    if "--check" in sys.argv:
        if not path.exists() or path.read_text() != want:
            print("frames/COMPONENTS.md is out of date: run python3 frames/index.py", file=sys.stderr)
            sys.exit(1)
        sys.exit(0)
    path.write_text(want)
    print(f"index: {path} ({len(components())} components)")
