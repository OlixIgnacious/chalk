# blueprint

**For:** explaining.

## Essence

White and pale cyan line work on blueprint blue over a faint grid; small-caps labels; things are drawn on.

## What it is not

Not an engineering drawing with fake dimensions: every number on it is from the source.

## Colour

- `INK` #0E3A66 the ground; `INK_ALT` #12457A panels on it.
- `ORANGE` (the accent slot) #FFFFFF: the one thing the narration is tracking.
- `CREAM` #DCEBFF text; `MUTED` #A9C8EE secondary text; `HINT` #3E6A9C and `BORDER` #2C5A8A structure.

## Type

Inter for display; IBM Plex Mono for code and labels. Headlines 60–96 px, body 40 px or more, labels 28 px or more.

## Motion

Lines draw along their path; labels arrive after their line. Reveal style: `draw`. Finish: grid.

## Pitfalls

- Thin white lines vanish on a phone: 2 px or more.
- The grid competes with a table: turn the finish off on a trace-heavy video (video.json finish: [] ).
- Dimension lines need the dimension-line helper, which is not in framelib yet: until then, label with arrows.
