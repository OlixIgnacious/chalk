# Frame components

Generated from `framelib.py` by `python3 frames/index.py`; do not edit by hand. Read a component's row before
you use it. When its **Avoid for** matches your scene, take what it names instead. A component you need and
cannot find is named in your reply, so it can be added to the library: never copy helpers between builds.

## Text

| Component | What | Use for | Avoid for | Length |
|---|---|---|---|---|
| `headline(s, t, y, size, color, w)` | The scene's question or subject, on screen from the words that say it. | the scene's question or subject, from the words that say it. | body text or a list (use plan_card); a label (use label). | 0.6 s rise. |
| `text(s, x, y, size, weight, color, font, w, align, tracking, lower, upper, lh, eid, raw, attrs, gradient)` | Any text on the stage: the building block headline, label and the rest use. | a line no component draws (R5: 36 px or more for a reason; R6 times it). | a heading (use headline), a tag (use label). | instant; reveal with rise or fade. |
| `label(s, x, y, color, size, w, align, eid, attrs)` | A small mono label (upper case, tracked): a tag, a column name, a caption on a diagram. | naming a thing on screen; not timed by R6. | a reason the narration gives (R5 wants 36 px+: use text or plan_card's why). | fade 0.5 s. |
| `rule(x, y, w, h, color, eid)` | A short accent rule: a divider or an underline. | separating two ideas on one screen. | emphasis on a word (use mark). | wipe 0.6 s. |

## Code

| Component | What | Use for | Avoid for | Length |
|---|---|---|---|---|
| `code_build(block_id, steps, x, y, w, size, tags_x, lh, only, comments)` | Write the code line by line. | teaching code: lines appear on their cue with the plan step beside them. | code the viewer has already been taught (use code_show). | 0.4 s a step. |
| `code_show(block_id, x, y, w, size, title, t, lh, only, comments)` | A whole block, for reference (not for teaching how to write it — use code_build). | a block shown for reference, read as a whole. | teaching how to write it (use code_build); more than ~14 lines in portrait. | 0.5 s fade. |
| `code_trace(block_id, trace_rel, steps, show_vars, x, y, w, size, fmt, result_cue, title, lh, only)` | Run the code on screen: the executing line lit, variables updating. | running the code on the example: the line lit, variables updating. | a trace you typed by hand (it must come from examples/<trace>.py). | one step per cue. |
| `code_run(script_rel, runs, x, y, w, size, start, title, ran)` | Run code the way a notebook does: each call sits in an `In [ ]:` cell, the ▶ run button lights on its cue, `In [*]:` and "running…" while it runs, then `In [n]:` and `Out[n]:` with the result. | a notebook-style call and its printed output. | a call the notebook never runs (the build fails); explaining logic (use code_trace). | 0.6 s a run. |
| `code(src, x, y, w, size, title, lh, block_id, gutter, only, comments)` | A verbatim code panel. | a custom code panel when code_show/code_build cannot say it. | teaching code (use code_build); showing a whole block (use code_show). | instant; reveal with fade/rise. |
| `highlight(hl_sels, t)` | Light the code lines a code() panel returned. | custom code panels. | code_build/code_trace (they light their own lines). | 0.3 s. |
| `unhighlight(hl_sels, t)` | Settle code lines a code() panel lit. | custom code panels. | code_build/code_trace. | 0.3 s. |

## Values and structures

| Component | What | Use for | Avoid for | Length |
|---|---|---|---|---|
| `cells(values, x, y, size, gap, font_size, label_idx, color, eid)` | A row of value cells: an array or a list. | an array or list the narration walks. | a moving pointer (use pointer_walk); a table (use table). | instant; reveal with fade/pop. |
| `pointer_walk(values, x, y, pointers, size, gap, font_size, label_idx, chip_w, chip_h, at, eid)` | An array with named pointers: each a chip (above or below the cells) with a caret into its cell, moved one step at a time, so a pointer never sweeps ahead and jumps back. | two-pointer and sliding-window walks: named chips that move one step at a time. | names that read as digits (l, I, O, o: refused); a single index (use mark). | 0.4 s a move. |
| `setbox(x, y, w, h, title, eid)` | A titled box that holds chips: a set or a map being filled. | a set or dict that fills as the narration adds to it. | a fixed list (use cells). | instant; reveal with fade. |
| `chip(v, x, y, size, font_size, color, eid)` | One value as a chip, to drop into a setbox or beside cells. | one value arriving in a set, or a result. | text (use text/label). | pop 0.5 s. |
| `table(header, rows, x, y, widths, size, row_h, mono_cols, header_at, wrap)` | header_at: the time or cue the header fades in on (default: the frame's start). | comparisons and traces as rows; the trace-table look. | one-line cells that would overflow (wrap= them, or the build fails). Themes: spreadsheet suits it best. | 0.4 s a row. |
| `block_table(bid, x, y, widths, pick, cols)` | table() filled from a markdown table block. | a source markdown table drawn as written, rows picked by first cell. | values typed by hand. | 0.4 s a row. |
| `table_rows(bid)` | A markdown table block of the source as (header, rows): cells stripped, backticks dropped. | reading a source table's values for the screen. | values typed by hand. | —. |
| `node(s, x, y, w, h, size, accent, eid)` | A labelled box: a tree or graph node, a step in a flow. | trees, graphs, flows (with arrow). | a list of values (use cells). Themes: transit draws these as stations. | instant; reveal with pop. |
| `bar(x, y, w, h, color, eid)` | A plain filled bar: a quantity, a progress, a divider. | comparing sizes, a quantity. | decoration with no meaning. | wipe 0.6 s. |
| `arrow(x1, y1, x2, y2, eid, color, width, curve)` | An arrow from one point to another, straight or curved. | a relation the narration says (points to, becomes, goes to). | decoration; more than ~4 on one screen. | draw 0.8 s. |
| `svg(inner, eid)` | Raw SVG markup on the stage. | a shape no component draws (then say so: it may belong in the library). | anything a component draws. | instant. |

## Plans and judgements

| Component | What | Use for | Avoid for | Length |
|---|---|---|---|---|
| `plan_card(steps, x, y, size, why_size)` | steps: [(text, cue)] or [(text, cue, why, why_cue)]. | the plan in plain words, a step per clause with its reason. | code; more than ~5 steps (split the scene). | 0.5 s a step. |
| `reject(box, against, t, sel, mark)` | A fact that is true but breaks a rule (O(n) extra memory against "only O(1)"): the fact turns the accent colour, a cross pops beside it, and an arrow runs from it into the rule it breaks. | a true fact that breaks a rule: cross and arrow into the rule. | a fact that is false (fix the source, never draw it); striking anything through. | 0.5 s. |
| `roadmap(stages, t, x, y, eid)` | This video's stages, left to right, landing in order from t. | the hook of a series part: this video's stages in order. | anything but the hook; a Short (no room). | 0.3 s a stage. |

## Motion

| Component | What | Use for | Avoid for | Length |
|---|---|---|---|---|
| `rise(sel, t, dy, dur)` | Reveal an element rising into place. | a line of text or a panel arriving. | values that change in place (use to). | 0.6 s. |
| `fade(sel, t, dur, to)` | Reveal an element by fading it in. | quiet arrivals: attributions, secondary text. | the scene's subject (it deserves rise or pop). | 0.5 s. |
| `pop(sel, t, dur)` | Reveal an element with a small overshoot. | a value or chip that arrives as a result. | text blocks (it reads as bouncing). | 0.5 s. |
| `wipe(sel, t, dur)` | Reveal an element left to right. | bars, rules, a line under a word. | text (use rise, or chalk on a skit board). | 0.6 s. |
| `draw(sel, t, dur)` | Reveal an SVG path along its length (stroke-dashoffset). | lines, arrows and shapes that should be seen being drawn. | text (use rise/fade, or chalk for a skit). Themes: chalkboard, blueprint, marker, ink. | 0.8 s. |
| `to(sel, t, props, dur)` | Tween an element's properties. | changing a value's colour or position as the narration moves on. | revealing (use rise/fade/pop). | 0.4 s. |
| `set(sel, t, props)` | Change properties instantly. | hard swaps on a cue (a value replaced, an element hidden). | anything the viewer should see change (use to). | instant. |
| `dim(sel, t, to)` | Fade an element back so the next one leads. | moving attention on. | hiding (set opacity 0, or let the frame end). | 0.4 s. |
| `mark(sel, t, color, fill)` | Light up an element: accent border and fill. | pointing at one cell, line or value as the narration names it. | several at once (the eye has nowhere to go). | 0.3 s. |
| `field(kind, count, color, seed, size, opacity)` | A seeded layer behind the components: points of light that drift (kind "drift"), gather and glow ("firefly") or lines that flow ("flow"). | focus, ambient and motivational pieces under sparse type. | anything with detail to read (it competes); more than ~40 points. | the whole frame. |

## Skits

| Component | What | Use for | Avoid for | Length |
|---|---|---|---|---|
| `stage(cast, poses, heights, board)` | Draw the set and both characters in their first pose. | skits: the set and the cast in their opening poses. | anything but a skit. Themes: chalkboard (the skit stage lives here). | instant. |
| `pose(ch, name, t)` | Swap a character's pose: a 0.12 s crossfade and a small squash, standing on the same spot. | a character's reaction, on the line that earns it. | every line (it reads as twitching). | 0.12 s. |
| `shot(name, t, push)` | Change shot: "two", or a cast member's name for their close-up. | skits: a cut or push to a close-up or the two-shot. | more than one change every ~3 s. | cut, or 0.5 s push. |
| `line_start(speaker, nth)` | When the nth line of a speaker starts, in frame time. | skits: cueing a pose or shot on a speaker's line. | narration (use cue). | —. |
| `chalk(s, x, y, t, size, color, w, align, eid)` | Chalk writing on the board behind the cast, in board px (the two-shot shows it as placed). | writing on the skit's board behind the cast. | anything but a skit. Themes: chalkboard. | 0.6 s hand wipe. |

## Timing

| Component | What | Use for | Avoid for | Length |
|---|---|---|---|---|
| `cue(phrase, offset, nth)` | The time a phrase of the narration starts, in frame time. | every reveal: cue it on the words that say it. | typed times (they drift when the take changes). | —. |
| `at(t)` | A time, or the cue of a phrase. | taking either a number or a phrase. | —. | —. |
