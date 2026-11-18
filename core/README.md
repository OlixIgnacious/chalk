# chalk-core

Shared core for the chalk skills. It does the format-agnostic half of turning a book chapter into
video: ingest to grounded blocks, gate the script against them, align captions to narration, and
route each scene to a visual tier.

It is not a skill and has no output of its own. Build on it:

| Skill | Output |
|---|---|
| [chalk](../chalk) | short animated lessons with an interactive page and checkpoints |
| chalk-long | one chaptered long video plus an upload kit, with examples and hands-on notebooks (formerly chalk-youtube) |
| chalk-short | one idea as a vertical video |

## Use

```bash
npx chalk-core ingest chapter.md --out chapter.json
npx chalk-core check-readability segments/*/script.md
npx chalk-core path                      # where core is installed
npx chalk-core sync ./skills/my-skill    # vendor the shared references into a skill
npx chalk-core sync ./skills/my-skill --check
```

Commands: `ingest`, `check-readability`, `check-spoken`, `build-tokens`, `align-captions`, `apply-display`, `narrate`, `emit-vtt`, `fix-index`,
`manim-render`. See [CLAUDE.md](CLAUDE.md) for the rules and for how a skill should depend on this.

## Test

```bash
npm test             # the regression gate
npm run test:tier2   # Manim render and alpha
```

Licensed Apache-2.0. See [CREDITS.md](CREDITS.md).
