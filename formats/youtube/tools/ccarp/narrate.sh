#!/bin/zsh
# usage: CCARP_DIR=<output dir>/ narrate.sh 01   — narrate one segment (the chosen voice: heart/bella blend, polished)
: ${CCARP_DIR:?} ${HYPERFRAMES_PYTHON:?}
cd "${CCARP_DIR}segments/$1/video" && npx chalk-core narrate --script SCRIPT.md --out . \
  --voice "af_heart:0.7,af_bella:0.3" --speed 0.92 --polish --lead 0.6
