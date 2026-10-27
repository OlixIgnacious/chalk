"""gen.py NN — write every frame of segment NN, run from the output dir.

The frame spec for a segment is <output-dir>/frames/sNN.py: a module with FRAMES = {frame_no: fn(F)}. It
lives beside the video, not in work/ (deliver deletes work/). The orientation every frame carries — series
and part, the progress strip of this video's stages, the stage card on a part's first frame — is built here
from channel.json, video.json and each segment's script.md `stage:` fields, so a spec only draws its scene.
A lesson (lesson.json, no video.json) gets the same chrome from the lesson: its title, and a strip of its
segments' titles.
"""

import importlib.util
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from framelib import STAGE_NAMES, Frame, frames_of  # noqa: E402


def find_channel(out):
    env = os.environ.get("CHALK_CHANNEL")
    if env:
        return Path(env)
    for d in [out, *out.parents]:
        if (d / "channel.json").exists():
            return d / "channel.json"
    sys.exit("gen: no channel.json (set CHALK_CHANNEL or put one in the workspace)")


def segment_stage(script_md, title):
    if re.match(r"(?i)bonus\b", title):
        return "bonus"
    m = re.search(r"(?m)^stage:\s*(\S+)", script_md)
    return m.group(1).strip().lower() if m else "hook"


def video_context(out, nn):
    channel = json.loads(find_channel(out).read_text())
    video = json.loads((out / "video.json").read_text())
    parts = channel["series"]["parts"]
    part_idx = next(i for i, p in enumerate(parts) if p["id"] == video["part_id"])
    segs = video["segments"]
    titles = {s["id"]: s["title"] for s in segs}
    stages = []
    for s in segs:
        md = (out / "segments" / s["id"] / "script.md").read_text()
        stages.append(segment_stage(md, s["title"]))
    strip, index_of = [], {}
    for sid, st in zip([s["id"] for s in segs], stages):
        name = STAGE_NAMES.get(st, st.title())
        if not strip or strip[-1] != name:
            strip.append(name)
        index_of[sid] = len(strip) - 1
    pos = [s["id"] for s in segs].index(nn)
    return {
        "out_dir": out,
        "series_label": f'{channel["series"]["name"]} #{part_idx + 1} · {parts[part_idx]["title"]}',
        "part_title": titles[nn],
        "segment_title": re.sub(r"(?i)^bonus:\s*", "", titles[nn]),
        "strip": strip,
        "stage_index": index_of[nn],
        "stage": stages[pos],
        "stage_name": STAGE_NAMES.get(stages[pos], stages[pos].title()),
        "part_no": pos + 1,
        "part_count": len(segs),
    }


def lesson_context(out, nn):
    """The orientation for an interactive lesson: the lesson's title, and one strip step per segment."""
    lesson = json.loads((out / "lesson.json").read_text())
    segs = lesson["segments"]
    ids = [s["id"] for s in segs]
    pos = ids.index(nn)
    short = lambda s: s["title"] if len(s["title"]) <= 18 else s["title"][:17].rstrip() + "…"
    return {
        "out_dir": out,
        "series_label": lesson["title"],
        "part_title": segs[pos]["title"],
        "segment_title": segs[pos]["title"],
        "strip": [short(s) for s in segs],
        "stage_index": pos,
        "stage": "lesson",
        "stage_name": f"Part {pos + 1}",
        "part_no": pos + 1,
        "part_count": len(segs),
    }


def main():
    nn = sys.argv[1]
    out = Path.cwd()
    spec_path = out / "frames" / f"s{nn}.py"
    spec = importlib.util.spec_from_file_location(f"s{nn}", spec_path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[f"s{nn}"] = mod
    spec.loader.exec_module(mod)
    ctx = video_context(out, nn) if (out / "video.json").exists() or not (out / "lesson.json").exists() else lesson_context(out, nn)
    project = out / "segments" / nn / "video"
    for no, fid in frames_of(project):
        F = Frame(project, no, fid, ctx)
        mod.FRAMES[no](F)
        print(F.write().relative_to(out), f"{F.duration}s")
    for w in ctx.get("warnings", []):
        print(f"gen: warning: {w}", file=sys.stderr)


if __name__ == "__main__":
    main()
