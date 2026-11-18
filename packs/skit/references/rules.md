# The skit pack

For comedy skits, long or short: two or more characters, one voice each, trading lines on a stage (the
chalkboard stage, the cast's poses and shots are in `frames/framelib.py`). The jokes are the skit's; **the
facts in them are still facts**: every line cites its block (G1) and the source is checked (G7) like any
other build.

Criteria: K1–K4 ([eval/criteria.mjs](../eval/criteria.mjs)). Waived: E2 (a skit has no running example).

## Laws

**Every line names its speaker** (K1), and there are two or more: `speaker: penguin` on each entry. Narration
says each line in that speaker's voice (`{as:name}` reaches only the voice, never a caption).

**Every speaker is cast** (K2): the manifest's `cast` (`short.json` or `video.json`), or `channel.json`'s,
maps each speaker to a Kokoro voice: `"cast": { "penguin": { "voice": "am_puck", "speed": 1.0 } }`. A speaker
with no voice stops narration rather than falling back.

**They take turns** (K3): no one says more than four lines in a row. A monologue is an essay.

**It opens wide** (K4): the two-shot holds the first 1.5 s (`OPEN_SEC`), so the viewer sees who is there and
where before the first close-up. Read from `frames/sNN.py`: a `.shot(name, t)` before 1.5 s that is not `"two"`
fails. With no shot call the stage is already on the two-shot. A cut timed by a cue is not checked.

**The punchline is grounded too.** The joke may be in the timing, the pose or the misunderstanding, never in a
wrong fact. When a character is wrong on purpose, the other corrects them in the next line, and both lines cite
the block that says what is right.
