# Step 3 for a skit: the script

Read `core/references/step-3-script.md` for the two-layer form; this adds the skit's rules.

```markdown
## Scene 1 — the line
visual: stage (tier 1)
duration: ~12s

- speaker: penguin
  spoken: "I was here first, so I get served first."
  display: "I was here first, so I get served first."
  source: [p002]
```

- **`speaker:` on every entry** (K1), two or more speakers, each in the cast (K2).
- **Turns** (K3): no more than four lines in a row from one speaker.
- **Short lines.** Comedy is timing: one thought per line, a `{beat}` before a punchline.
- Lines about the video itself ("the full video is linked below") cite `[pipeline]`; a speaker may say them.

**Gate:** `chalk eval <out> --text` passes the skit group and G1.
