#!/bin/zsh
# usage: CCARP_DIR=<output dir>/ render.sh 01   — render one segment, emit its VTT, copy it to segment.mp4
: ${CCARP_DIR:?}
cd "${CCARP_DIR}segments/$1/video" && npx hyperframes render --skill=faceless-explainer --quality high --output renders/video.mp4 \
  && npx chalk-core emit-vtt caption_groups.json ../segment.vtt && cp renders/video.mp4 ../segment.mp4
