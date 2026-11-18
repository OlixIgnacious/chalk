# flow

**For:** focus.

## Essence

A living background of slow flow lines in one colour, type set over it.

## What it is not

Not a screensaver: the lines are slow and faint; the words lead.

## Colour

- `INK` #0A0F14 the ground; `INK_ALT` #111A22 panels on it.
- `ORANGE` (the accent slot) #6FD3FF: the one thing the narration is tracking.
- `CREAM` #E6F2F8 text; `MUTED` #8DA3B1 secondary text; `HINT` #2C3E4C and `BORDER` #1C2A35 structure.

## Type

Inter for display; IBM Plex Mono for code and labels. Headlines 60–96 px, body 40 px or more, labels 28 px or more.

## Motion

Lines drift the whole frame; text fades in. Reveal style: `fade`. Finish: none. Field: {"kind": "flow", "count": 28, "color": "#6FD3FF", "size": [2, 5], "opacity": 0.35}.

## Pitfalls

- Lines under text cut glyphs: keep the field's opacity at 0.35 or less.
