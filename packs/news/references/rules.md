# The news pack

For reporting, long or short: a tech-news Short, a weekly roundup, an explainer of an announcement. The
source is a dated summary of the reporting, each fact attributed ("Apple says…", "MacRumors reports…"), with
no claim the reporting does not make. The source check (G7) checks the summary against the reporting; this
pack makes sure the viewer can see where each fact comes from.

Criteria: W1–W5 ([eval/criteria.mjs](../eval/criteria.mjs)). Waived: E2 (news has no running example).

## Laws

**Every fact says who reports it** (W3): a line with a number or a quotation names its source in that line or
the one before ("According to the council…", "Reuters reports…").

**The sources are listed** (W1) in the manifest, `sources: [{ "name": …, "url": "https://…" }]`, and go in the
description; the last line points there (W5): "Sources are in the description."

**It carries its date** (W2): the manifest's `label` (shown at the top) or `date` names the day:
"TECH NEWS · NOV 18, 2026". News without a date misleads the day after.

**No hype** (W4): nothing sells harder than the reporting. "Shocking", "insane", "slams", "bombshell" and
the rest are refused in the narration and the title. `"breaking": true` in the manifest allows "breaking" for
news that is.

**Report, don't predict.** Say what was announced, reported or measured. An analyst's forecast is attributed
like any fact ("X estimates…"), never said in the channel's own voice.
