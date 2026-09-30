# Tier 2: Manim

For the four registry rows that Manim earns: equation transforms, geometric construction,
parametric sweeps, morphing densities. Everything else is Tier 1.

**Before reaching for this**, re-read the line in [visual-registry.md](visual-registry.md): if the
equation only needs to be displayed and annotated, KaTeX in HTML does it better — it stays
interactive, restyles for free, and renders in a fraction of the time.

## Install gate

Run once per machine, before planning any Tier 2 scene. If it fails, **fall back to Tier 1 and tell
the user** — do not fail the run halfway through.

```bash
brew install cairo pango pkgconf   # macOS system deps; pkgconf, not the old pkg-config
uv pip install --python .venv/bin/python manim    # repo venv; do not use system Python
.venv/bin/manim --version
```

LaTeX is needed only for `MathTex` / `Tex`, so it is **not** part of the install gate:
`manim-render.mjs` scans the scene for those two and demands LaTeX only when one is actually used.
A construction or a parametric sweep renders without it. When you do need it, **install TinyTeX or
BasicTeX, not MacTeX** — MacTeX is about 4GB and mostly unused here. A first render names the
missing `.sty` files; install those individually, and verify with a trial render of a single
`MathTex` before planning a scene around it.

`pycairo` needs `pkgconf` to build. Without it the install fails while hunting for cairo, which
reads as a missing cairo even when cairo is right there.

TinyTeX installs without sudo, which is why it is the recommendation here:

```bash
curl -sL "https://yihui.org/tinytex/install-bin-unix.sh" | sh
export PATH="$PATH:$HOME/Library/TinyTeX/bin/universal-darwin"
tlmgr install standalone preview doublestroke dvisvgm jknapltx physics ragged2e relsize rsfs \
              setspace wasy wasysym xcolor microtype babel-english everysel fundus-calligra \
              mathastext cbfonts-fd tipa ms gnu-freefont cm-super count1to
```

Its installer *does* want sudo for one thing — symlinking itself onto `PATH` — and that step fails
on a machine where sudo cannot prompt. The install itself is fine; LaTeX just ends up present and
invisible. `manim-render.mjs` looks in TinyTeX's and BasicTeX's usual locations and puts whatever it
finds on the PATH it hands to manim, which matters because manim shells out to `latex` and
`dvisvgm` itself.

**On this machine:** `manim` Community v0.21.0 in the repo venv, TinyTeX with the packages above.
Both the construction and the `MathTex` paths render.

## Render

```bash
node <skill-dir>/scripts/manim-render.mjs <scene.py> --fps 30 --resolution 1920x1080
```

The script wraps three steps, each of which is a real constraint:

**1 — Cairo renderer, not OpenGL.** The OpenGL renderer ignores `--transparent`
([manim#3919](https://github.com/ManimCommunity/manim/issues/3919)).

**2 — Transcode.** `manim -t` emits `.mov` with the qtrle codec, which **Chrome cannot decode**, and
Hyperframes renders in Chrome:

```bash
ffmpeg -i scene.mov -c:v libvpx-vp9 -pix_fmt yuva420p scene.webm
```

`yuva420p` is what asks for the alpha channel. `libvpx-vp9` is present in the local ffmpeg.

**Do not verify this with `ffprobe`'s `pix_fmt`.** WebM carries alpha in a *separate* track, flagged
by the container's `AlphaMode` element, so the video stream reads back as plain `yuv420p` even when
the alpha is perfectly intact — and `ffmpeg`'s own decoder does not reapply it, so a round-trip
through `ffmpeg` also shows opaque. Both are red herrings. The real check, which the script does, is
`ffprobe -show_entries stream_tags=alpha_mode`, which must be `1`.

**3 — Pin fps and dimensions to the composition exactly.** A mismatch is an error, not something to
resize after the fact — a 60fps clip in a 30fps composition judders against the surrounding motion,
and it reads as cheapness rather than as a bug.

## Compositing

```html
<video src="assets/scene-03.webm"
       data-start="12.4" data-duration="6.2" data-media-start="0"></video>
```

**Hyperframes owns playback and seeking.** Never call `play()`, `pause()`, or set `currentTime` —
the renderer positions media itself, frame by frame, and imperative control breaks determinism.

### Alpha does composite — verified

Tested on 2026-09-30: a transparent Manim construction, rendered through this script and placed over
a solid-red page in headless Chrome, showed red through every transparent pixel, including the
interior of the circle. Chrome reported no decode error, correct dimensions and duration.

So layering a Tier 2 clip over composition elements is safe, and the fallback below is not needed.

<details>
<summary>The fallback, if this ever regresses</summary>

Render the Manim scene on the design preset's own background colour and cut to it full-bleed as its
own scene. A visual downgrade — no layering over composition elements — but not a blocker.
</details>

## Matching the design system

A Manim scene that looks like stock Manim reads as pasted in from another video. Pass the series
design preset's tokens into the scene as config: background, foreground, the single accent, and the
font.

`<skill-dir>/assets/manim/scene_template.py` holds `ChalkScene`, a base class that reads those
tokens from `CHALK_TOKENS` (JSON) so individual scenes only describe the maths. It exposes `tex`,
`prose`, `label`, `axes`, `styled` and `draw`, and no scene should hard-code a colour.

```bash
CHALK_TOKENS='{"fg":"#e7e9ee","accent":"#8aa7d6"}' \
  node <skill-dir>/scripts/manim-render.mjs scene.py --fps 30 --resolution 1920x1080
```

## Cost

Tier 2 scenes are flat video. They cannot be made interactive in the player, cannot be restyled
without re-rendering, and add minutes to the build. Budget one or two per chapter, in the places
where watching the transformation *is* the explanation.

## Worked example

`<skill-dir>/assets/manim/example_equation_transform.py` is the reference scene: `y = x²` visibly
becoming `dy/dx = 2x`, with `TransformMatchingTex` pairing the substrings so the motion carries the
rule rather than merely accompanying it. Its maths is Thompson, *Calculus Made Easy* (1910), which
is in `fixtures/` — a worked scene stays grounded for the same reason everything else does.

Note what it does *before* the transform: it names the move ("the exponent becomes the
coefficient") and waits. A transform nobody was told to watch reads as decoration.

`npm run test:tier2` renders both it and a construction scene, and checks the alpha composites.

## TODO

- [x] A worked equation-transform scene
