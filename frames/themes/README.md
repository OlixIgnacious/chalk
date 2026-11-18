# Themes

A theme is a folder: how a video looks and moves, chosen by the channel (`channel.json` `theme`) or the video
(`video.json`, `short.json`, `lesson.json` `theme`). No theme is chalk's house look; `broadside` is only the
fallback when nothing names one. `chalk themes` lists them, `chalk themes --show <name>` prints one's grammar,
`chalk themes --for <out>` says which a build uses and why.

```
frames/themes/<name>/
  theme.json      palette (ink, ink_alt, orange = the accent slot, cream, muted, hint, border), display face, gradient,
                  mark_fill, reveal (rise | draw | typed | beam | step | fade), finish (one name or a list), and
                  optionally ground (a CSS background over ink) and field (a drifting layer under the components)
  THEME.md        Essence · What it is not · Colour · Type · Motion · Pitfalls. The frames agent reads it; the
                  frames reviewer checks stills against its Pitfalls
  captions.css    the theme's captions, layered over the caption skin
  poster.png      one sample frame in the theme (`chalk themes --poster <name>`)
```

**Your own themes** live in `~/.config/chalk/themes/<name>/` (or `$CHALK_THEMES`), same shape, listed first and
never touched by an update. A theme of yours with a repo theme's name replaces it for you. Start by copying a
repo theme and editing `theme.json`.

**Mechanisms** (framelib): the reveal style re-routes `rise`, `fade` and `pop`; chrome keeps its fade. Finishes
(`grain`, `paper`, `scanlines`, `halftone`, `vignette`, `riso`, `dither`, `flicker`, `glow`, `grid`) are one layer
over the stage and never move the layout; `flicker` is on the timeline, seeded, never a CSS animation. A field
(`drift`, `firefly`, `flow`) is seeded tweens of *t*, so any frame renders alone.

**Faces** are staged by `chalk assets`: Barlow, Inter, IBM Plex Mono, Caveat, VT323, Press Start 2P (all OFL).

**Checks** (`test/frames.mjs`): every folder has the four files and every palette slot; text is 4.5:1 on the
ground and the accent and secondary text 3:1; every theme draws the fixture frame; a finish never moves an
element.

**Not built yet** (each needs framelib components first, see `docs/anywhere-plan.md` C1a): `spreadsheet` (a cell
cursor), `transit` (a map of lines and stations), `sketchnote` (highlighter and an icon set), `pictogram` (an icon
set), `comic` (panels and balloons), `silhouette` (a silhouette set and beat cuts on a music clock).
