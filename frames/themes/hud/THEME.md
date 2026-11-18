# hud

**For:** news, explaining.

## Essence

A readout: thin cyan lines, corner brackets, numbers counting up, a scan line.

## What it is not

Not a video game: no targeting reticles, no fake telemetry.

## Colour

- `INK` #04121A the ground; `INK_ALT` #072230 panels on it.
- `ORANGE` (the accent slot) #3FE0FF: the one thing the narration is tracking.
- `CREAM` #E3FAFF text; `MUTED` #8FBFCC secondary text; `HINT` #1D4A5A and `BORDER` #12394A structure.

## Type

Inter for display; IBM Plex Mono for code and labels. Headlines 60–96 px, body 40 px or more, labels 28 px or more.

## Motion

Traced by a beam; numbers count up to their sourced value. Reveal style: `beam`. Finish: grid.

## Pitfalls

- A counted-up number must land on the source's value and hold there.
- Corner brackets are a later component; frame panels with BORDER until then.
