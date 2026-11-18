# chalk — working rules

chalk turns a checked source into grounded videos of any length and genre: a chaptered long video with its
upload kit, a vertical Short, an interactive lesson with checkpoints, and a follow-along notebook. Every
narrated line and on-screen claim traces to a block of the source, and the source itself is fact-checked.

## Layout

```
bin/chalk.mjs        the one CLI: core commands, step 4 (voice / frames / render / stills), eval, deliver, doctor
core/                ingest, the grounding and spoken-style gates, narrate, caption alignment, Manim, references/
frames/              deterministic frames: framelib.py components, gen.py, seg.mjs, build.sh
evals/               the eval runner, the criteria every shape shares, fixtures
formats/             the shapes: long (/chalk-long, alias /chalk-youtube), short (/chalk-short), lesson (/chalk);
                     each its skill, deliver and shape criteria; index.mjs resolves a shape and its pack
packs/               the genres: coding-lesson, essay, news, skit; each its criteria, references and fixtures
publish/             destinations: the neutral kit, platform shaping and uploads
agents/              the agents, one report each
test/evals.mjs       the eval judges its own fixtures, every pack's included
```

Each directory with its own `CLAUDE.md` (`core/`, `formats/long/`, `formats/lesson/`) has the rules
for that part; read it before changing anything there. This file holds what spans them.

## Invariants

- **One copy of everything shared.** The skills read `core/references/` through a `references/core`
  symlink; never copy a reference into a skill. A fix to a gate, the aligner or the frame library lands
  once, in `core/` or `frames/`, and every format gets it.
- **Shape × pack.** A shape (`long`, `short`, `lesson`) owns the stages, the deliver and the orientation; a
  pack (`coding-lesson`, `essay`, `news`, `skit`) owns a genre's rules: its criteria and the outline and
  script references. The channel or the manifest names the pack; the shape never does. "Never name the book"
  and "no quizzes" are the coding-lesson pack's rules, not chalk's; an essay names the book it quotes. A
  criterion goes in `evals/shared.mjs` only when it holds for every shape and every pack; a pack that cannot
  keep a shared one waives it by name, with why, and the eval shows the waiver. No pack and no theme is the
  house default in docs or code beyond the fallback something has to be.
- **The kit is neutral.** A platform's rules (limits, hashtags, where links go) live in `publish/`, never in
  deliver, a shape or a pack.
- **The eval and the reviewer have different jobs.** The eval is mechanical and deterministic; the
  reviewer agent judges what it cannot. When the reviewer finds a gap the eval passed, add the
  criterion and a fixture that fails it.
- **Gates are not advisory**, and the step-3 gate stops for the user: rendering before the teaching has
  been reviewed is the expensive mistake.
- **Two checks, two questions.** Grounding asks whether every line says only what its source block says, on
  every run. The source check (`facts.md`, the chalk-factcheck agent, `core/scripts/facts.mjs`) asks whether
  the source is right, once per version of it: the stage compares the hash of the blocks' text, not a file
  time. chalk is not only for one channel; a user's own script or a motivational piece quoting someone is a
  source too, and the least certain kind.
- **The network is per agent.** No agent reaches the web unless its definition says `network: true`; today
  only chalk-factcheck does. Waivers (`facts-accepted.md`) are the person's; no agent writes them.

## Testing

```bash
npm install          # links the workspaces (core is resolved as chalk-core)
npm test             # core, youtube and lesson smoke suites, then the eval fixtures
node bin/chalk.mjs doctor
```

Fixtures are public-domain or original text, never a copyrighted book.
