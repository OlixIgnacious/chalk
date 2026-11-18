# dusk

**For:** focus.

## Essence

A warm room at dusk: soft gradient light, slow drifting motes, one line of type at a time with long holds; the music carries the time.

## What it is not

Not a sunset stock photo: no sun, no silhouettes of palm trees, no lens flare.

## Colour

- `INK` #1B1424 the ground; a gradient over it: linear-gradient(180deg, #2A1B3D 0%, #5B2E48 58%, #C8704D 100%); `INK_ALT` #2A1B3D panels on it.
- `ORANGE` (the accent slot) #FFB677: the one thing the narration is tracking.
- `CREAM` #FFF3E6 text; `MUTED` #D9B8C4 secondary text; `HINT` #6E4A63 and `BORDER` #4A3350 structure.

## Type

Inter for display; IBM Plex Mono for code and labels. Headlines 60–96 px, body 40 px or more, labels 28 px or more.

## Motion

Slow fades (1.2 s), long holds; the field drifts the whole frame; never a pop. Reveal style: `fade`. Finish: vignette. Field: {"kind": "drift", "count": 18, "color": "#FFD9A8", "size": [2, 5], "opacity": 0.45}.

## Pitfalls

- Type over the bright bottom of the gradient loses contrast: keep text above the middle.
- A focus video's music is mixed after render (the focus-music project): the frames do not cue on it yet.
- Sparse means one line on screen; two lines is a list, and a list is not this theme.
