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
brew install cairo pkg-config      # macOS system deps
uv tool install manim              # isolated; do not use system Python
manim --version
```

LaTeX is needed only for `MathTex` / `Tex`. **Install TinyTeX or BasicTeX, not MacTeX** — MacTeX is
about 4GB and mostly unused here. A first render names the missing `.sty` files; install those
packages individually.

Verify with a trial render of a single `MathTex` before planning a scene around it. As of writing,
neither `manim` nor any LaTeX distribution is installed on this machine.

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

`yuva420p` is what carries the alpha channel. `libvpx-vp9` is present in the local ffmpeg.

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

### If alpha does not composite

Hyperframes' docs do not state WebM-alpha support for input video, so **verify this before designing
around it** (milestone 2 of the plan). If it fails:

Render the Manim scene on the design preset's own background colour and cut to it full-bleed as its
own scene. A visual downgrade — no layering over composition elements — but not a blocker.

## Matching the design system

A Manim scene that looks like stock Manim reads as pasted in from another video. Pass the series
design preset's tokens into the scene as config: background, foreground, the single accent, and the
font.

`<skill-dir>/assets/manim/scene_template.py` should hold a base class that reads those tokens, so
individual scenes only describe the maths.

## Cost

Tier 2 scenes are flat video. They cannot be made interactive in the player, cannot be restyled
without re-rendering, and add minutes to the build. Budget one or two per chapter, in the places
where watching the transformation *is* the explanation.

## TODO

- [ ] `scripts/manim-render.mjs`
- [ ] `assets/manim/scene_template.py` — design-token base class
- [ ] Resolve the alpha question and delete whichever branch above turns out to be wrong
- [ ] A worked equation-transform scene
