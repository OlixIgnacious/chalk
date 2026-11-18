# Step 2 for news: the outline

The source is a dated summary of the reporting (or a research brief), each fact attributed. Before the
outline, `facts.md` must be done: news goes stale and gets things wrong fastest.

**Short** (`short.json`): `title` (no hype), `thesis` (the news in one sentence), `label` with the date,
`sources`, `pack: "news"`, one part: the news, what it means for the viewer, the pointer to the sources.

**Long** (`video.json`, `pack: "news"`, `sources`, `date`): a hook with the headline fact and its source;
one part per story or per angle (what happened, who says so, what it means, what is not known yet); an outro
that points to the sources.

**Gate:** every fact in the outline has a block id and a reporter; nothing in the plan predicts in the
channel's own voice; the sources are listed with links.
