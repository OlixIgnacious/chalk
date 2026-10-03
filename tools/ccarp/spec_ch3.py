# Per-scene visual spec for CCAR-P Chapter 3. Copy is short on-screen text, never a narrated sentence;
# each cue is a word from that scene's own captions (display layer): a string, or [string, nth occurrence].
R=lambda items,cues,**kw: dict(k="rows",items=items,cues=cues,**kw)
C=lambda items,cues,**kw: dict(k="chips",items=items,cues=cues,**kw)
F=lambda items,cues,**kw: dict(k="flow",items=[dict(t=t) for t in items],cues=cues,**kw)
SPEC={
"01":[
 dict(slug="title",label="CCAR-P · Chapter 3",head=["context","& prompt reuse"],big=True,titlecues=["context","reuse"],body=[]),
 dict(slug="problem",label="the problem",head=["the smallest set"],body=[
   R([dict(n="01",t="every token competes for attention"),dict(n="02",t="every token costs money"),dict(n="03",t="the smallest set of high-signal tokens"),dict(n="04",t="reuse: prompt caching and Skills")],["competes","costs","smallest","caching,"],hot=[2])]),
 dict(slug="outcomes",label="by the end",head=["you can"],body=[
   R([dict(n="01",t="optimise context windows"),dict(n="02",t="manage token usage"),dict(n="03",t="caching · modular prompts · Skills")],["optimise","manage","Caching,"])]),
],
"02":[
 dict(slug="two-disciplines",label="3.1 · context engineering",head=["two disciplines"],body=[
   dict(k="cols",items=[dict(l="prompt engineering",t="writing instructions",s="the words you give the model"),dict(l="context engineering",t="curating the tokens",s="the optimal set available to the model during inference")],cues=["writing","wider"],y=380,hot=[1])]),
 dict(slug="what-counts",label="3.1 · context engineering",head=["everything in the window"],body=[
   C(["system prompt","tool definitions","examples","message history","retrieved data","tool results"],["system","tool","examples","message","retrieved","results"],y=380,fs=46),
   R([dict(n="→",t="all of it competes for the model's attention")],["competing"],y=700)]),
 dict(slug="finite",label="3.1 · why context is finite",head=["why it's finite"],body=[
   F(["every token is compared with every other token","the context grows","each single piece thins out"],["compares","grows,","thins"],y=380,hot=[2])]),
 dict(slug="context-rot",label="3.1 · context rot",head=["context rot"],body=[
   dict(k="quote",t="a gradient, not a cliff",cue="gradient,",y=360),
   R([dict(n="↓",t="precision on retrieval and long-range reasoning declines")],["precision"],y=620,hot=[0])]),
],
"03":[
 dict(slug="five",label="3.2 · anatomy of good context",head=["five components"],body=[
   C(["system prompt","tools","examples","message history","retrieved data"],["made","five","each","rule","time."],y=420,fs=54)]),
 dict(slug="system-prompt",label="3.2 · the system prompt",head=["the system prompt"],body=[
   dict(k="cols",items=[dict(l="the target",t="right altitude",s="specific enough to guide, general enough for judgement"),dict(l="one extreme",t="brittle if-else rules",s="too specific"),dict(l="other extreme",t="vague platitudes",s="too general")],cues=["altitude.","Brittle","vague"],y=340,hot=[0]),
   R([dict(n="→",t="headed sections or XML tags")],["headed"],y=800)]),
 dict(slug="tools",label="3.2 · tools",head=["tools"],body=[
   dict(k="quote",t="if a human engineer can't say which tool to use, the model can't either",cue="human",y=350),
   C(["minimal set","clear names","lean outputs"],["minimal","clear","outputs"],y=760,fs=40)]),
 dict(slug="rest",label="3.2 · the other three",head=["three more"],body=[
   R([dict(n="01",t="a few diverse, canonical examples",s="not a laundry list of edge cases"),dict(n="02",t="message history",s="grows without bound in agents, so it must be managed"),dict(n="03",t="retrieved data",s="load what the current step needs")],["examples?","Message","retrieved"],y=340)]),
],
"04":[
 dict(slug="two-approaches",label="3.3 · getting data in",head=["two approaches"],body=[
   dict(k="cols",items=[dict(l="up front",t="pre-loading",s="fetch everything that might be relevant"),dict(l="on demand",t="just-in-time",s="load content with tools when it's needed")],cues=["data","approaches."],y=380)]),
 dict(slug="pre-loading",label="3.3 · pre-loading",head=["pre-loading"],body=[
   R([dict(n="→",t="fetch everything relevant before the model starts")],["fetch"],y=330),
   C(["fast","predictable","cacheable"],["fast","predictable,","cache"],y=520,label="strengths"),
   C(["stale context","noisy context"],["Stale","noisy"],y=720,hot=[0,1],label="the risk")]),
 dict(slug="just-in-time",label="3.3 · just-in-time",head=["just-in-time"],body=[
   F(["the agent keeps lightweight identifiers","like file paths or links","it loads the content with tools"],["keeps","paths","loads"],y=380,hot=[2])]),
 dict(slug="claude-code",label="3.3 · an example",head=["claude code"],body=[
   dict(k="cols",items=[dict(l="loaded up front",t="CLAUDE.md",s="the small, always-needed part"),dict(l="read on demand",t="glob and grep",s="files are found and read just in time")],cues=["CLAUDE.md","files"],y=380,hot=[1])]),
 dict(slug="progressive",label="3.3 · progressive disclosure",head=["progressive disclosure"],body=[
   F(["discover context layer by layer","metadata as signals: names, folders, timestamps","keep only what's needed in memory"],["layer","metadata","keeps"],y=340),
   C(["slower than pre-computed retrieval","needs well-designed tools"],["slower","well-designed"],y=740,hot=[0],label="the cost")]),
 dict(slug="hybrid",label="3.3 · hybrid",head=["hybrid is common"],body=[
   F(["pre-load a small, always-needed core","let the agent fetch the rest","decide by how dynamic the data is and how predictable the task is"],["Pre-load","fetch","dynamic"],y=380,hot=[2])]),
],
"05":[
 dict(slug="beyond",label="3.4 · long-horizon techniques",head=["beyond one window"],body=[
   C(["long agent sessions","multi-hour coding","large migrations"],["agent","multi-hour","migrations."],y=360,label="when a job outlasts one window"),
   R([dict(n="01",t="compaction"),dict(n="02",t="structured note-taking"),dict(n="03",t="sub-agents")],["three","techniques","time."],y=620)]),
 dict(slug="compaction",label="3.4 · compaction",head=["compaction"],body=[
   F(["near the limit, summarise the conversation","keep decisions, open issues, key details","continue in a fresh window"],["summarise","Keep","fresh"],y=340),
   C(["recall first","then precision","light form: clear old tool results"],["recall","precision.","clearing"],y=740,fs=40,label="tune")]),
 dict(slug="note-taking",label="3.4 · note-taking",head=["note-taking"],body=[
   F(["write notes outside the context window","NOTES.md, a to-do file, a memory tool","read them back later"],["writes","NOTES.md","reads"],y=340),
   R([dict(n="→",t="progress survives resets, with minimal overhead")],["preserves"],y=700)]),
 dict(slug="sub-agents",label="3.4 · sub-agents",head=["sub-agents"],body=[
   F(["hand a focused task to a sub-agent with a clean context","it explores, using many tokens","it returns a condensed summary, often 1–2K tokens"],["hand","exploring.","returns"],y=340),
   R([dict(n="→",t="the lead agent's context stays clean")],["separation"],y=720)]),
 dict(slug="choosing",label="3.4 · which technique",head=["which, when"],body=[
   dict(k="table",head=["the work","technique"],w=[980,728],y=340,
        rows=[["long back-and-forth needing continuity","compaction"],["iterative work with clear milestones","note-taking, memory"],["complex research, parallel exploration","sub-agents"]],
        cues=["long","Iterative","complex"])]),
],
"06":[
 dict(slug="six-levers",label="3.5 · managing token usage",head=["six levers"],body=[
   R([dict(n="01",t="trim system prompts"),dict(n="02",t="concise tool outputs"),dict(n="03",t="fewer, better chunks"),dict(n="04",t="clear old tool results"),dict(n="05",t="count tokens, set max_tokens"),dict(n="06",t="cache stable prefixes")],["practical","manage","day","six","Here","through"],cols=2,y=330)]),
 dict(slug="trim",label="3.5 · trim the prompt",head=["trim the prompt"],body=[
   F(["take out redundant instructions","move rarely used procedures into Skills"],["redundant","rarely"],y=380,hot=[1]),
   R([dict(n="→",t="Skills come later in this chapter")],[["Skills",1]],y=700)]),
 dict(slug="tool-outputs",label="3.5 · an example",head=["tool outputs"],body=[
   dict(k="quote",t="showing 20 of 340; refine your query",cue="showing",y=340),
   C(["only the fields you need","paginate","filter","truncate, with a hint"],["fields","Paginate,","filter,","truncate."],y=640,fs=40,label="concise outputs")]),
 dict(slug="the-rest",label="3.5 · the other levers",head=["the other levers"],body=[
   R([dict(n="03",t="fewer, better chunks",s="reranking beats top-100"),dict(n="04",t="clear old tool results",s="in long sessions"),dict(n="05",t="count tokens first",s="and set a sensible max_tokens"),dict(n="06",t="cache stable prefixes",s="the next section")],["chunks.","summarise","count","Cache"],y=330,hot=[3])]),
],
"07":[
 dict(slug="what",label="3.6 · prompt caching",head=["prompt caching"],body=[
   F(["stores the processed state of a prompt prefix","later requests with the same prefix skip reprocessing","lower cost, lower time to first token"],["stores","skip","benefits"],y=380,hot=[2])]),
 dict(slug="order",label="3.6 · how it works",head=["a fixed order"],body=[
   F(["tools","system prompt","messages"],["Tools","system","messages."],y=360),
   C(["a byte-for-byte identical prefix"],["identical."],y=720,hot=[0],label="a cache hit needs")]),
 dict(slug="breakpoints",label="3.6 · breakpoints",head=["breakpoints"],body=[
   R([dict(n="01",t="explicit: cache_control on content blocks"),dict(n="02",t="automatic: caches the conversation as it grows"),dict(n="03",t="up to four explicit breakpoints per request")],["breakpoints,","automatic","four"],y=340,hot=[2])]),
 dict(slug="layers",label="3.6 · why several breakpoints",head=["layers change","at different rates"],body=[
   dict(k="table",head=["layer","changes"],w=[760,948],y=440,rows=[["tools","rarely"],["system prompt","occasionally"],["documents","per session"],["conversation","every turn"]],cues=["rarely","occasionally","session.","turn."])]),
 dict(slug="pricing",label="3.6 · lifetime and cost",head=["lifetime and cost"],body=[
   dict(k="table",head=["cache","lifetime","vs base input"],w=[560,620,528],y=330,rows=[["5-minute","default, refreshed on each hit","1.25× to write"],["1-hour","for longer gaps","2× to write"],["read","a small fraction of input","0.1×"]],cues=["five","one","reads"],hot=[2]),
   R([dict(n="→",t="check the pricing page for exact multipliers")],["pricing"],y=800)]),
 dict(slug="minimum",label="3.6 · minimum length",head=["minimum length"],body=[
   F(["a minimum cacheable length per model","too short? no caching, and no error",["check the usage fields"][0]],["minimum","shorter,",["check",1]],y=360),
   C(["cache_creation_input_tokens: 0","cache_read_input_tokens: 0"],["cache_creation_input_tokens,","cache_read_input_tokens,"],y=760,mono=True,hot=[0,1],label="both zero means nothing was cached")]),
],
"08":[
 dict(slug="breaks",label="3.6 · what breaks the cache",head=["what breaks it"],body=[
   R([dict(n="01",t="any change inside the prefix",s="a timestamp, a user name, a reordered tool list"),dict(n="02",t="calls spaced beyond the TTL"),dict(n="03",t="changes between calls",s="tool choice, images, thinking configuration, effort")],["change","Calls","changes"],y=330,hot=[0])]),
 dict(slug="setup",label="3.6 · a worked example",head=["the setup"],body=[
   R([dict(n="01",t="8,000 static prefix tokens"),dict(n="02",t="about 200 dynamic tokens"),dict(n="03",t="100,000 requests a day"),dict(n="04",t="Opus 5.5 · $4 per million input tokens")],["8,000","200","100,000","$4"],y=340)]),
 dict(slug="without",label="3.6 · a worked example",head=["without caching"],body=[
   dict(k="stat",t="800M",s="prefix tokens a day: 8,000 × 100,000",cue="800M",y=340),
   dict(k="stat",t="$3,200",s="a day, with no caching",cue="$3,200",y=620,hot=True)]),
 dict(slug="with",label="3.6 · a worked example",head=["with caching"],body=[
   dict(k="stat",t="$320",s="a day: reads at 0.1×, steady traffic, writes negligible",cue="$320",y=330,hot=True),
   C(["faster first tokens"],["faster"],y=620,label="and"),
   R([dict(n="→",t="Sample Question 2: static first, plus caching")],["Sample"],y=760)]),
 dict(slug="one-hour",label="3.6 · the one-hour TTL",head=["one-hour cache"],body=[
   F(["traffic gaps longer than 5 minutes","a user returns every 15 minutes in a long session","or spaced-out, batch-like jobs"],["gaps","comes","batch-like"],y=340),
   R([dict(n="→",t="a 5-minute cache would expire and be rewritten again and again")],["expire,"],y=740,hot=[0])]),
 dict(slug="no-help",label="3.6 · when caching doesn't help",head=["when it won't help"],body=[
   R([dict(n="01",t="every request has a unique prefix"),dict(n="02",t="the static part is below the minimum"),dict(n="03",t="the prefix changes constantly")],["unique","below","constantly."],y=340)]),
],
"09":[
 dict(slug="modular",label="3.7 · modular prompts",head=["modular prompts"],body=[
   C(["persona","policy","task instructions","output format"],["Persona,","policy,","task","output"],y=380,label="versioned modules"),
   R([dict(n="→",t="assembled by code")],["assembled"],y=700)]),
 dict(slug="why-modules",label="3.7 · why modules",head=["why modules"],body=[
   dict(k="cols",items=[dict(l="one change",t="updates every prompt that uses it",s="and each module can be tested on its own"),dict(l="caching bonus",t="stable modules first, dynamic last",s="stable modules can be cached; the user profile and retrieved data go at the end")],cues=["change","caching"],y=380,hot=[1])]),
 dict(slug="skills",label="3.8 · agent skills",head=["agent skills"],body=[
   R([dict(n="01",t="procedural knowledge, packaged as a folder"),dict(n="02",t="loaded by the agent on demand")],["procedural","loads"],y=380,hot=[1])]),
 dict(slug="anatomy",label="3.8 · inside a skill",head=["inside a skill"],body=[
   F(["a directory containing SKILL.md","YAML frontmatter: a required name and description, then instructions","optional reference files and scripts"],["directory","YAML","bundle"],y=380)]),
 dict(slug="three-levels",label="3.8 · progressive disclosure",head=["three levels"],body=[
   R([dict(n="1",t="metadata",s="name and description of every skill, always in the system prompt"),dict(n="2",t="the SKILL.md body",s="read only when Claude decides the skill is relevant"),dict(n="3",t="bundled files and scripts",s="read or run only if the task needs them; scripts run without entering context")],["metadata.","SKILL.md","bundled"],y=330,hot=[2])]),
 dict(slug="unbounded",label="3.8 · why it scales",head=["effectively unbounded"],body=[
   R([dict(n="→",t="only the metadata is always loaded"),dict(n="→",t="so the knowledge you can bundle in skills is effectively unbounded")],["metadata","unbounded."],y=380,hot=[1])]),
],
"10":[
 dict(slug="five-mechanisms",label="3.8 · reuse mechanisms",head=["five mechanisms"],body=[
   C(["prompt caching","modular prompts","Skills","MCP server","RAG"],["several","choose","between","compare","five."],y=420,fs=54)]),
 dict(slug="always-loaded",label="3.8 · reuse mechanisms",head=["always loaded"],body=[
   dict(k="table",head=["mechanism","use when","loaded"],w=[420,810,478],y=380,rows=[["prompt caching","same large static prefix, one app","always, cheaply"],["modular prompts","shared policy or persona, many apps","always"]],cues=["Prompt","Modular"])]),
 dict(slug="on-demand",label="3.8 · reuse mechanisms",head=["on demand"],body=[
   dict(k="table",head=["mechanism","use when","loaded"],w=[420,810,478],y=340,rows=[["Skills","reusable procedures, across agents","on demand"],["MCP server","external systems, data, actions","tool definitions, or on demand"],["RAG","large factual knowledge base","retrieved per query"]],cues=["Skills.","MCP","RAG"],hot=[0])]),
 dict(slug="security",label="3.8 · a security note",head=["security note"],body=[
   dict(k="quote",t="skills can include executable scripts",cue="executable",y=340),
   R([dict(n="01",t="install only from trusted sources"),dict(n="02",t="audit third-party skills, like any code dependency")],["install","audit"],y=640,hot=[1])]),
],
"11":[
 dict(slug="traps",label="3.9 · exam traps",head=["four exam traps"],body=[
   R([dict(n="01",t="use the 1M window, include everything"),dict(n="02",t="assume caching is on because cache_control is set"),dict(n="03",t="per-user data before static instructions"),dict(n="04",t="truncate required policy instead of caching it")],["First:","Second:","Third:","fourth:"],y=330)]),
 dict(slug="self-check",label="self-check",head=["self-check"],body=[
   R([dict(n="01",t="cache hit rate zero: three causes?"),dict(n="02",t="three levels of progressive disclosure"),dict(n="03",t="just-in-time over pre-loading: when?"),dict(n="04",t="three long-horizon techniques"),dict(n="05",t="1M window, so context doesn't matter: why wrong?")],[["Question",0],["Question",1],["Question",2],["Question",3],["Question",4]],y=330)]),
 dict(slug="answers",label="self-check · answers",head=["answers"],body=[
   R([dict(n="01",t="short prefix · dynamic prefix · TTL · settings"),dict(n="02",t="metadata · SKILL.md body · bundled files"),dict(n="03",t="large, changing data or an unpredictable path"),dict(n="04",t="compaction · note-taking · sub-agents"),dict(n="05",t="context rot, plus token cost and latency")],["one:","Two:","Three:","Four:","Five:"],y=330,hot=[4])]),
],
}
TRACK=["Context","Anatomy","Retrieval","Long-horizon","Tokens","Caching","Reuse","Traps"]
TRACKMAP={"02":0,"03":1,"04":2,"05":3,"06":4,"07":5,"08":5,"09":6,"10":6,"11":7}
