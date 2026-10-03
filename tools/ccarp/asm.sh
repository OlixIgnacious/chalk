#!/bin/zsh
# usage: CCARP_DIR=<dir>/ [CAPS=1] asm.sh 01 02 ...   — assemble + check segments
export HYPERFRAMES_PYTHON="${HYPERFRAMES_PYTHON:?set HYPERFRAMES_PYTHON to the Kokoro venv python}"
SK=${FACELESS:-$HOME/.claude/skills/faceless-explainer/scripts}
R=${CCARP_DIR}segments
for s in "$@"; do
  echo "=== $s"
  cd $R/$s/video
  [ -n "$CAPS" ] && node $SK/captions.mjs build --storyboard ./STORYBOARD.md --audio-meta ./audio_meta.json --hyperframes . --out ./caption_groups.json >/dev/null 2>&1
  node $SK/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes . >/dev/null 2>&1
  npx chalk-core fix-index index.html >/dev/null
  node $SK/transitions.mjs inject --storyboard ./STORYBOARD.md --hyperframes . >/dev/null 2>&1
  node $SK/transitions.mjs verify --storyboard ./STORYBOARD.md --index ./index.html 2>&1 | tail -1 | cut -c1-70
  python3 - <<'PY'
p="index.html";t=open(p).read()
t=t.replace('id="el-captions"\n        class="scene"','id="el-captions"\n        data-track-kind="captions"\n        class="scene"')
open(p,"w").write(t)
PY
  npx hyperframes check 2>&1 | grep -E "error\(s\)|issues across|Check passed|Check failed|✗" | cut -c1-260 | head -10
done
