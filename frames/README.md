# frames — step 4 for every chalk format

The step-4 plumbing: deterministic frames from a Python spec per segment, the voice from the workspace's
`channel.json`, captions aligned to the script, and the render. Run it through the `chalk` CLI.

| File | Does |
|---|---|
| `build.sh` | `assets` once per machine; then per segment `NN voice`, `NN frames`, `NN render`. Run from the output dir. |
| `seg.mjs` | `setup` (BRIEF, capture, frame.md, fonts, SCRIPT.md, STORYBOARD.md), `sync` (take lengths + end hold), `words` (word stream), `voice` (from channel.json). |
| `gen.py` | Runs `<output-dir>/frames/sNN.py` and adds the orientation every frame needs. |
| `framelib.py` | The Broadside components: `code_build`, `code_trace`, `code_run` (a notebook cell that runs: `In [ ]:` → ▶ → `Out[n]:`, outputs from an example script), `plan_card`, `roadmap`, `stage_card`, `progress_strip`, `code_show`, `cells`, `pointer_walk` (an array with named pointers that move one step at a time), `table`, `block_table` / `table_rows` (a source markdown table, drawn or read as written), `reject` (a true fact that breaks a rule: ✗ and an arrow, never a strike), `setbox`, `chip`, `node`, `arrow`, `bar`. |

## Run a video

```bash
cd <workspace>/long-output/<slug>          # chapter.json, video.json, lexicon.json, segments/NN/script.md, frames/sNN.py
chalk assets
for n in 00 01 …; do chalk voice $n; done
for n in 00 01 …; do chalk frames $n; done      # then look at `npx hyperframes snapshot` stills
for n in 00 01 …; do chalk render $n; chalk stills $n; done
chalk deliver . --notebook --keep-work
chalk eval . --channel <workspace>/channel.json
```

## A frame spec

```python
from framelib import *

def f1(F):                                   # scene 1 of segment NN
    F.code_build("c036", [([1], "First, name", "define"), ([2], "empty set", "remember"), ...])

FRAMES = {1: f1}
```

Every cue is a phrase from that scene's narration (`F.cue("empty set")` resolves it to the word's start).
A phrase that is not in the narration stops the build and prints the words it has.

## What it fixed from the first build

Voice from `channel.json`, never a default · fonts and GSAP staged automatically · code auto-fit to its
longest line · labels at the 28px phone floor · a pause marker ending a scene becomes the next take's lead (refused on the last scene) · specs kept
outside `work/` · render copied before the VTT, so a caption error never loses the MP4.

From the second build (DSA Patterns #1): `gen.py` runs on the pipeline Python, so trace scripts see the
same line events and pandas · a code panel drops its line numbers before its type goes under 28px ·
`code_trace` puts the variables under the code when the panel is too wide for them beside it, and warns
if it reaches the caption band · line numbers at 3:1 contrast · the stage card holds for its reading
time and the content fades in as it lifts · stage-card titles keep `O(1)`, `SQL`, `[1, 2, 3, 1]` ·
captions keep the display layer's case · `cue()` matches across a lexicon phrase that is one caption word.

From the third build (the learning-first remake): the hook has no stage card — it opens on its example ·
content starts once a stage card has gone, not during its fade · `code_trace` refuses cues that run
backwards (a phrase that also appears in an earlier sentence needs `nth=`) · the aligner (chalk-core)
accepts tens, plural numerals and a few homophones (`seen`/`scene`, `queue`/`cue`).
