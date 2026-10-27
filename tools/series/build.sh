#!/usr/bin/env bash
# build.sh NN <stage> — chalk-youtube step 4 for one segment, run from the output dir.
#   assets  (no NN) stage Barlow, IBM Plex Mono and GSAP once into the shared cache
#   voice   setup + narrate (channel.json voice) + sync + align captions — the audio clock; a hard reset downstream
#   frames  frames/sNN.py → frames → captions → assemble → fix-index → transitions → lint/check
#   render  render → copy to segments/NN/ → VTT
set -euo pipefail
TOOLS=$(cd "$(dirname "$0")" && pwd)
OUT=$(pwd)
FE=$HOME/.claude/skills/faceless-explainer/scripts
PY=${CHALK_PYTHON:-${HYPERFRAMES_PYTHON:-$TOOLS/../../.venv/bin/python}}  # same order as evals/run.mjs and build-notebook.mjs
ASSETS=${CHALK_ASSETS:-$HOME/.cache/chalk-youtube/assets}
export CHALK_ASSETS=$ASSETS

if [ "${1:-}" = assets ]; then
  [ -f "$ASSETS/gsap.min.js" ] && { echo "assets: already staged in $ASSETS"; exit 0; }
  T=$(mktemp -d); mkdir -p "$ASSETS/fonts"
  (cd "$T" && npm pack gsap@3.14.2 @fontsource/barlow@5.2.5 @fontsource/ibm-plex-mono@5.2.5 >/dev/null 2>&1 && for f in *.tgz; do mkdir "${f%.tgz}" && tar -xzf "$f" -C "${f%.tgz}"; done)
  cp "$T"/gsap-3.14.2/package/dist/gsap.min.js "$ASSETS/"
  for w in 400 600 700 800 900; do cp "$T"/fontsource-barlow-5.2.5/package/files/barlow-latin-$w-normal.woff2 "$ASSETS/fonts/"; done
  for w in 400 500 600; do cp "$T"/fontsource-ibm-plex-mono-5.2.5/package/files/ibm-plex-mono-latin-$w-normal.woff2 "$ASSETS/fonts/"; done
  rm -rf "$T"; echo "assets: staged in $ASSETS"; exit 0
fi

NN=$1; STAGE=$2
P=segments/$NN/video

case $STAGE in
voice)
  read -r VOICE SPEED POLISH <<<"$(node "$TOOLS/seg.mjs" voice)"
  [ -f $P/hyperframes.json ] || npx hyperframes init "$P" --non-interactive --example=blank --skill=faceless-explainer >/dev/null
  node "$TOOLS/seg.mjs" setup $NN
  EXTRA=(); [ "$POLISH" = polish ] && EXTRA=(--polish)
  echo "voice: $VOICE at $SPEED ${EXTRA[*]:-}"
  (cd $P && npx chalk-core narrate --script SCRIPT.md --out . --voice "$VOICE" --speed "$SPEED" "${EXTRA[@]}" --lead 0.6 --lexicon "$OUT/lexicon.json" --python "$PY" | tail -3)
  node "$TOOLS/seg.mjs" sync $NN
  node "$TOOLS/seg.mjs" words $NN
  npx chalk-core build-tokens segments/$NN/script.md lexicon.json work/$NN/script-tokens.json
  npx chalk-core align-captions --tokens work/$NN/script-tokens.json --words work/$NN/words.json --out work/$NN/captions.json
  npx chalk-core apply-display --script segments/$NN/script.md --captions work/$NN/captions.json --audio-meta $P/audio_meta.json
  ;;
frames)
  "$PY" -I "$TOOLS/gen.py" $NN  # the same Python runs the trace scripts, so their line events match
  (cd $P
    sed -i '' 's/^- status: outline/- status: animated/' STORYBOARD.md
    node $FE/captions.mjs build --storyboard ./STORYBOARD.md --audio-meta ./audio_meta.json --hyperframes . --out ./caption_groups.json | tail -1
    node $FE/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes . | grep -E 'total duration' || true
    npx chalk-core fix-index index.html
    sed -i '' 's/<div id="el-captions" /<div id="el-captions" data-track-kind="captions" /' index.html
    node $FE/transitions.mjs inject --storyboard ./STORYBOARD.md --hyperframes . | tail -1
    node $FE/transitions.mjs verify --storyboard ./STORYBOARD.md --index ./index.html | tail -1
    npx hyperframes lint 2>&1 | grep -E 'error\(s\)|✗' || true
    npx hyperframes check 2>&1 | grep -E '✗|⚠|error\(s\), [1-9]|Check' | grep -v -E 'clip_media_fit|caption_track_kind' || true)
  ;;
render)
  (cd $P && npx hyperframes render --skill=faceless-explainer --quality high --output renders/video.mp4 2>&1 | tail -2)
  cp $P/renders/video.mp4 segments/$NN/segment.mp4
  npx chalk-core emit-vtt $P/caption_groups.json segments/$NN/segment.vtt
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -show_entries format=duration -of csv=p=0 segments/$NN/segment.mp4
  ;;
*) echo "usage: build.sh assets | build.sh NN voice|frames|render" >&2; exit 2 ;;
esac
