# tools/ccarp — building the CCAR-P chapter videos

The helpers that turned CCAR-P *Complete Learning Material* chapters 2, 3, 4 and 5 into YouTube videos
with the `chalk-youtube` skill. They are book-specific: the skill is general, these are not.

| File | Does |
|---|---|
| `scripts_chN.py` | Narration for chapter N, one scene per frame, a `source:` on every line. Writes `segments/NN/script.md` (spoken layer with `{beat}`/`{pause}`/`{think}`; display layer derived from `lexicon.json`). |
| `writer_tail.py` | Shared writer that `scripts_ch3.py` and `scripts_ch4.py` run at the end. |
| `spec_chN.py` | One visual per scene: short on-screen copy and the caption word each item appears on. |
| `pipeline.py` | `scaffold` (BRIEF, SCRIPT.md, fonts), `storyboard`, `sync` (durations, last-frame hold), `align` (caption words). |
| `frames.py` | Spec + word timings → `compositions/frames/*.html`. |
| `asm.sh` | Assemble the index, inject transitions, run `hyperframes check`. `CAPS=1` rebuilds captions. |
| `narrate.sh`, `render.sh` | Narrate or render one segment. |
| `data/chN/` | `lexicon.json` and `titles.json` for the chapter. |

The chapter text itself (`source/`, `chapter.json`) is **not** kept here: it is the book. Convert the docx
yourself and run `npx chalk-core ingest`; put a blank line after every heading, or a list that follows one is
merged into it.

## Run a chapter

```bash
export CCARP_DIR=$PWD/youtube-output/ccarp-ch4/ CCARP_CH=4 CCARP_SPEC=spec_ch4 \
       CCARP_TITLE="Integration I: Tools, MCP & Access Control" \
       CCARP_ASSETS=<a built segment's assets/ dir with fonts/ and gsap.min.js> \
       HYPERFRAMES_PYTHON=$PWD/.venv/bin/python
mkdir -p $CCARP_DIR/source && cp tools/ccarp/data/ch4/*.json $CCARP_DIR   # then add source/ccarp-ch4.md + chapter.json
python3 tools/ccarp/scripts_ch4.py                       # script.md per segment
npx chalk-core check-spoken $CCARP_DIR/segments/*/script.md
# per segment: npx hyperframes init ... && build-frame --preset broadside   (step 4 of the skill)
python3 tools/ccarp/pipeline.py scaffold && python3 tools/ccarp/pipeline.py storyboard
tools/ccarp/narrate.sh 01                                 # each segment
python3 tools/ccarp/pipeline.py sync && python3 tools/ccarp/pipeline.py align   # 0 mismatches
# per segment: npx chalk-core apply-display --script ... --captions work/NN/captions.json --audio-meta ...
python3 tools/ccarp/frames.py && CAPS=1 tools/ccarp/asm.sh 01 02 ...
tools/ccarp/render.sh 01                                  # each segment
node skills/chalk-youtube/scripts/deliver.mjs $CCARP_DIR
```

`FACELESS` overrides the faceless-explainer scripts directory (default `~/.claude/skills/faceless-explainer/scripts`).

## What each chapter taught

- A scene's captions must match what the recognizer heard. Spell numbers in the lexicon (`heard:` the digit
  form), and reword a line the recognizer mishears (`apply-display` refuses a run of words with one start time).
- Avoid "A P I s" and "C L I s": the plural splits into a stray token. Say "endpoints" or "tools".
- Hero text is lowercased by the preset; stat numbers opt out so `800M` is not `800m`.
- Chip labels sit 42px above their chips: leave that gap under a row above them.
- `scaffold` writes `SCRIPT.md`; if it stops early, narration uses the stale file. Re-check `grep` on SCRIPT.md after a reword, and set `CCARP_ASSETS` for real (it now fails fast).
- Mid-sentence acronyms are heard inconsistently ("R A G" came back as "RG"; "every N tokens" as "every end tokens"). If `apply-display` refuses a run, reword that line rather than chase the transcript.
- Table first columns hold about 16 characters of bold text; longer wraps and overflows.
