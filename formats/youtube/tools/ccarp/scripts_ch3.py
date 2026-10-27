# Writes segments/NN/script.md for CCAR-P Chapter 3 (spoken layer with pause markers; display layer derived via lexicon).
# usage: CCARP_DIR=<dir>/ python3 scripts_ch3.py
import json, math, os, re
O=os.environ["CCARP_DIR"]
LEX=json.load(open(O+"lexicon.json"))["terms"]
def strip(s):
    s=re.sub(r"\{(beat|pause|think)\}"," ",s); s=re.sub(r"\s+"," ",s); return re.sub(r"\s+([.,;:!?])",r"\1",s).strip()
def disp(s):
    s=strip(s)
    for t in sorted(LEX,key=lambda t:-len(t["spoken"])):
        s=re.sub(r"(?<![A-Za-z])"+re.escape(t["spoken"])+r"(?![A-Za-z])",t["display"].replace("\\","\\\\"),s,flags=re.I)
    return s
GAP={"beat":0.55,"pause":1.0,"think":2.5}
S={}
S["01"]=[
 ("the title","definition card",None,[
   ("Let's talk about context, and how to reuse it.",["h001"])]),
 ("the problem","definition card",None,[
   ("Picture this. {beat} Your model has a one million token window. So you put everything in it. {beat} Does that make the answer better?",["p002","p006"]),
   ("Not necessarily. {beat} Every token you add competes for the model's attention. And every token costs money.",["p002"]),
   ("So the job isn't to fill the window. {pause} It's to give the model the smallest set of high-signal tokens for the step it's on.",["p002"]),
   ("And once you've got that right, there are two main ways to reuse your context efficiently. {beat} Prompt caching, and Skills.",["p002"])]),
 ("what you'll be able to do","decomposition",None,[
   ("So here's where we're headed. {beat} By the end, you'll know how to optimise a context window, and how to manage your token usage.",["p003"]),
   ("And you'll know the reuse strategies. {beat} Caching, modular prompts, and Skills. {pause} But first, what even is context engineering?",["p003"])]),
]
S["02"]=[
 ("two disciplines","split panel",None,[
   ("Let's start with a distinction. {pause} Prompt engineering, versus context engineering.",["p005"]),
   ("Prompt engineering is about writing instructions. {beat} Context engineering is wider than that.",["p005"]),
   ("Anthropic defines it as curating and maintaining the optimal set of tokens available to the model during inference.",["p005"])]),
 ("what counts as context","decomposition",None,[
   ("So what counts as context? {beat} Everything you put in the window.",["p005"]),
   ("The system prompt, the tool definitions, and your examples. {beat} Then the message history, the retrieved data, and the tool results.",["p005"]),
   ("All of it is competing for the model's attention.",["p002","p005"])]),
 ("why it's finite","staged flow",None,[
   ("Now, here's a fair question. {pause} Windows are huge these days, up to one million tokens. So why is context still finite?",["p006"]),
   ("It comes down to how attention works. {beat} A transformer compares every token with every other token.",["p006"]),
   ("So as the context grows, the model's ability to use any single piece of it thins out.",["p006"])]),
 ("context rot","definition card",None,[
   ("Now, Anthropic has a name for the result. {beat} Context rot.",["p006"]),
   ("It's a gradient, not a cliff. {beat} Models stay capable at long context. But precision on retrieval, and on long-range reasoning, declines.",["p006"]),
   ("So a bigger window doesn't remove the need to curate. {pause} Keep that in mind, because everything you'll see from here is about curating well.",["p006"])]),
]
S["03"]=[
 ("five components","decomposition",None,[
   ("Now let's look at what good context is made of. {pause} There are five components, and each one has a rule of thumb.",["p008"]),
   ("Let's take them one at a time.",["p008"])]),
 ("the system prompt","plot / number line",None,[
   ("First, the system prompt. {beat} How specific should it be? Aim for the right altitude.",["p008"]),
   ("That means specific enough to guide behaviour. {beat} But general enough to let the model use judgement.",["p008"]),
   ("So avoid two extremes. {beat} Brittle if-else rule lists on one side, and vague platitudes on the other.",["p008"]),
   ("And organise it with headed sections, or X M L tags.",["p008"])]),
 ("tools","definition card",None,[
   ("Second, tools. {beat} Which tools should you give the model? Keep the set minimal, and don't let tools overlap. Give them clear names and descriptions, and outputs that don't waste tokens.",["p008"]),
   ("Here's a good test you can run on your own tools. {beat} If a human engineer can't say which tool to use, the model can't either.",["p008"])]),
 ("examples, history and data","decomposition",None,[
   ("Then three more. {pause} What should you do about examples? Give a few diverse, canonical ones. Not a laundry list of edge cases.",["p008"]),
   ("Message history grows without bound in agents, so you have to manage it. {beat} We'll see how, in a few minutes.",["p008"]),
   ("And for retrieved data, load what the current step needs. {pause} That's exactly where we're going next.",["p008"])]),
]
S["04"]=[
 ("two approaches","definition card",None,[
   ("Next question. {beat} How does data get into the context in the first place? {pause} There are two approaches.",["p010"])]),
 ("pre-loading","staged flow",None,[
   ("First, pre-loading, also called up-front retrieval. {beat} You fetch everything that might be relevant, before the model starts. Classic R A G works this way.",["p010"]),
   ("It's fast and predictable, and you can cache it. {beat} The risk? Stale or noisy context.",["p010"])]),
 ("just-in-time","staged flow",None,[
   ("Now, the second one: just-in-time. {pause} Here the agent doesn't load the content up front.",["p010"]),
   ("Instead, it keeps lightweight identifiers, like file paths or links. {beat} Then it loads the content with tools, when it needs it.",["p010"])]),
 ("Claude Code","split panel","chapter",[
   ("Let's look at it through an example. {pause} Claude Code works this way.",["p010"]),
   ("Claude dot M D is loaded up front. {beat} But the files themselves are found with glob and grep, and read on demand.",["p010"]),
   ("So the small, always-needed part is pre-loaded. And everything else is fetched just in time.",["p010","p012"])]),
 ("progressive disclosure","staged flow",None,[
   ("Now, that leads to something called progressive disclosure. {pause} The agent discovers context layer by layer.",["p011"]),
   ("It uses metadata as signals, like file names, folder structure, and timestamps. {beat} And it keeps only what's needed in working memory.",["p011"]),
   ("The cost? Speed. {beat} Exploring at runtime is slower than pre-computed retrieval, and it needs well-designed tools.",["p011"])]),
 ("hybrid","staged flow",None,[
   ("So which should you choose? {beat} Often, you choose both. {pause} Hybrid is common.",["p012"]),
   ("Pre-load a small amount of always-needed context, like policies, or Claude dot M D. Then let the agent fetch the rest.",["p012"]),
   ("And choose based on two things. {beat} How dynamic the data is, and how predictable the task is.",["p012"])]),
]
S["05"]=[
 ("beyond one window","definition card",None,[
   ("Now, what happens when the job is bigger than one window? {pause} Think of long agent sessions, multi-hour coding, or large migrations.",["p014"]),
   ("There are three techniques for that. {beat} Let's take them one at a time.",["p014"])]),
 ("compaction","staged flow",None,[
   ("First, compaction. {beat} When the context nears its limit, you summarise the conversation. Keep the decisions, the open issues, and the key details.",["p015"]),
   ("Then you continue in a fresh window, with that summary.",["p015"]),
   ("Tune for recall first, so you don't drop what matters. {beat} Then tune for precision.",["p015"]),
   ("And a lighter version is simply clearing old tool results you no longer need.",["p015"])]),
 ("note-taking","staged flow",None,[
   ("Second, structured note-taking, also called agentic memory. {pause} The agent writes notes to storage outside the context window.",["p016"]),
   ("A Notes dot M D file, a to-do file, or a memory tool. {beat} Later, it reads them back.",["p016"]),
   ("That preserves progress across resets, with minimal overhead.",["p016"])]),
 ("sub-agents","staged flow",None,[
   ("Third, sub-agents. {pause} You hand a focused task to a sub-agent with a clean context.",["p017"]),
   ("It might use a lot of tokens exploring. {beat} But it returns just a condensed summary to the lead agent, often one or two thousand tokens.",["p017"]),
   ("That separation of concerns keeps the lead agent's context clean.",["p017"])]),
 ("choosing","comparison table",None,[
   ("So which do you reach for? {beat} It depends on the work you're doing.",["p018"]),
   ("A long back-and-forth conversation that needs continuity? {beat} Compaction.",["p018"]),
   ("Iterative work with clear milestones? Note-taking, or memory.",["p018"]),
   ("And complex research or analysis, where parallel exploration pays off? {beat} Sub-agents.",["p018"])]),
]
S["06"]=[
 ("six levers","decomposition",None,[
   ("Now let's get practical. {pause} How do you actually manage token usage day to day? {beat} There are six levers.",["p020"]),
   ("Here they are, and then we'll go through them.",["p020"])]),
 ("trim the prompt","definition card",None,[
   ("First, trim your system prompts. {beat} Take out redundant instructions.",["p020"]),
   ("And move rarely used procedures into Skills. {beat} We'll see how Skills work in a few minutes.",["p020"])]),
 ("tool outputs","worked example","chapter",[
   ("Second, make your tool outputs concise. {pause} Let's look at it through an example.",["p020"]),
   ("Return only the fields you need. Paginate, filter, or truncate. {beat} And when you truncate, leave a hint.",["p020"]),
   ("Something like: showing twenty of three hundred forty; refine your query. {beat} The model knows there's more, and knows what to do next.",["p020"])]),
 ("the rest","decomposition",None,[
   ("Now, the other levers. {pause} Retrieve fewer, better chunks. {beat} Reranking beats grabbing the top one hundred.",["p020"]),
   ("In long sessions, summarise or clear old tool results.",["p020"]),
   ("Before you send a large request, count the tokens. {beat} Then you know what you're paying for. And set a sensible max tokens.",["p020"]),
   ("And the sixth lever? {beat} Cache your stable prefixes. {pause} That one deserves its own section.",["p020"])]),
]
S["07"]=[
 ("what caching is","definition card",None,[
   ("Let's talk about prompt caching. {pause} What is it, and why should you care? {beat} It stores the processed state of a prompt prefix.",["p022"]),
   ("So later requests with the identical prefix skip reprocessing.",["p022"]),
   ("The benefits are lower cost, and lower time to first token.",["p022"])]),
 ("the order","staged flow",None,[
   ("So how does it work? {beat} Think of the order first. Content is cached in a fixed order. Tools first, then the system prompt, then the messages.",["p023"]),
   ("And here's the rule. {beat} A cache hit needs the prefix, up to the breakpoint, to be byte for byte identical.",["p023"])]),
 ("breakpoints","comparison table",None,[
   ("Now, where does the cache start and stop? {pause} You mark breakpoints, using cache control, set to ephemeral, on your content blocks. That's the explicit way.",["p023"]),
   ("Or you can use request-level automatic caching, which caches the conversation as it grows.",["p023"]),
   ("You get up to four explicit breakpoints per request.",["p023"])]),
 ("layers","comparison table",None,[
   ("Why would you want more than one? {beat} Because different layers change at different rates.",["p023"]),
   ("Tools rarely change. {beat} The system prompt, occasionally. Documents change per session. And the conversation changes every turn.",["p023"])]),
 ("ttl and pricing","comparison table",None,[
   ("Next, what does it cost? {pause} Check the pricing page for the exact multipliers. But here's the shape of it.",["p024"]),
   ("By default, the cache lives for five minutes, and that timer refreshes every time you hit the cache.",["p024"]),
   ("There's also a one hour option. {beat} Writing to the cache costs two times the base input price for the one hour version, versus one point two five times for five minutes.",["p024"]),
   ("And reads? {beat} Reads are billed at a small fraction of base input. Zero point one times, on Anthropic's pricing at the time of writing.",["p024"])]),
 ("minimum length","staged flow",None,[
   ("One more thing to check. {pause} Every model has a minimum cacheable prompt length.",["p025"]),
   ("If your prefix is shorter, it's processed without caching. {beat} And here's the catch. No error comes back.",["p025"]),
   ("So how do you know? {beat} You check the usage fields. If both cache creation input tokens, and cache read input tokens, are zero, then nothing was cached.",["p025"])]),
]
S["08"]=[
 ("what breaks the cache","decomposition",None,[
   ("So what breaks the cache? {pause} Remember, the prefix has to match exactly. {beat} So any change inside it breaks the cache.",["p026"]),
   ("A timestamp. {beat} A user name. Even a reordered tool list.",["p026"]),
   ("Calls spaced further apart than the TTL will miss, too. {beat} And per the docs, changes to tool choice, image usage, thinking configuration or effort between calls can break it as well.",["p026"])]),
 ("the setup","worked example","chapter",[
   ("Let's look at it through an example. {pause} Say an app sends a static prefix of eight thousand tokens, plus about two hundred dynamic tokens.",["p027"]),
   ("It does that one hundred thousand times a day, on Opus five point five. {beat} Input costs four dollars per million tokens.",["p027"])]),
 ("without caching","worked example","chapter",[
   ("First, without caching. {pause} Here's what you pay. That's eight thousand tokens, one hundred thousand times a day.",["p027"]),
   ("Eight hundred million prefix tokens, every day. {beat} About three thousand two hundred dollars a day.",["p027"])]),
 ("with caching","worked example","chapter",[
   ("Now turn caching on. {pause} Reads cost zero point one times the normal rate. And with steady traffic, writes are negligible.",["p027"]),
   ("So you're down to about three hundred twenty dollars a day. {beat} Plus faster first tokens.",["p027"]),
   ("This is exactly the official Sample Question Two. {beat} Put static content first, and turn on caching. That addresses both latency and cost.",["p028"])]),
 ("one hour TTL","staged flow",None,[
   ("When is the one hour T T L worth it? {pause} When traffic arrives with gaps longer than five minutes.",["p029"]),
   ("Say a user comes back every fifteen minutes, in a long agent session. Or you have batch-like jobs, spaced out.",["p029"]),
   ("{beat} With only five minutes of cache, it would expire, and get rewritten again and again.",["p029"])]),
 ("when it doesn't help","decomposition",None,[
   ("And when does caching not help? {pause} If every request has a unique prefix.",["p030"]),
   ("If the static part is below the minimum. {beat} Or if the prefix changes constantly.",["p030"])]),
]
S["09"]=[
 ("modular prompts","staged flow",None,[
   ("Caching isn't the only way to reuse context. {pause} Next, modular prompts.",["p032"]),
   ("The idea is to build your system prompts from versioned modules. {beat} Persona, policy, task instructions, and output format. All assembled by code.",["p032"])]),
 ("why modules","split panel",None,[
   ("Why bother? {beat} Because when you change a policy once, it updates every prompt that uses it. And you can test each module individually.",["p032"]),
   ("There's a caching bonus, too. {pause} Stable modules sit at the front, where they can be cached.",["p032"]),
   ("And dynamic modules, like the user profile or retrieved data, go at the end.",["p032"])]),
 ("agent skills","definition card",None,[
   ("Now, Agent Skills. {pause} A skill packages procedural knowledge as a folder, which the agent loads on demand.",["p034"])]),
 ("anatomy of a skill","staged flow",None,[
   ("So what's inside? {beat} A skill is a directory with a Skill dot M D file in it.",["p035"]),
   ("That file starts with yamel frontmatter, holding a required name and description. {beat} Then come the instructions.",["p035"]),
   ("The folder can also bundle extra reference files, and scripts.",["p035"])]),
 ("three levels","staged flow",None,[
   ("And now the key idea. {pause} Progressive disclosure, in three levels.",["p036"]),
   ("Level one is the metadata. {beat} The name and description of every installed skill sits in the system prompt. Just enough for Claude to know when a skill applies.",["p036"]),
   ("Level two is the Skill dot M D body. {beat} It's read into context only when Claude decides the skill is relevant.",["p036"]),
   ("Level three is the bundled files. {beat} Those are read, or run, only if the task needs them. And scripts can run without their code entering context.",["p036"])]),
 ("unbounded","definition card",None,[
   ("So what does all that buy you? {pause} Only the metadata is always loaded.",["p037"]),
   ("Which means the amount of knowledge you can bundle in skills is effectively unbounded.",["p037"])]),
]
S["10"]=[
 ("five mechanisms","comparison table",None,[
   ("Now you've got several ways to reuse context. {pause} So how do you choose between them? {beat} Let's compare five.",["p039"])]),
 ("caching and modules","comparison table",None,[
   ("First, prompt caching. It's for the same large static prefix, on every request of one app. {beat} It's always loaded, but cheaply.",["p039"]),
   ("Modular prompts suit a shared policy or persona across many apps. {beat} Those are always loaded too.",["p039"])]),
 ("skills, MCP and RAG","comparison table",None,[
   ("Now, Skills. They're for reusable procedures you use sometimes, across agents and surfaces. {beat} They load on demand.",["p039"]),
   ("An M C P server gives you access to external systems, data, and actions. {beat} Its tool definitions load, or load on demand with tool search.",["p039"]),
   ("And R A G is for a large factual knowledge base. {beat} It's retrieved per query.",["p039"])]),
 ("security","definition card",None,[
   ("Before we move on, one security note. {pause} Skills can include executable scripts.",["p040"]),
   ("So install only from trusted sources. {beat} And audit third-party skills, like any code dependency.",["p040"])]),
]
S["11"]=[
 ("four exam traps","decomposition",None,[
   ("Before you go, watch for four exam traps. {pause} First: use the one million window, and include everything. {beat} That ignores context rot, and it ignores cost.",["p042"]),
   ("Second: assuming caching is active, just because cache control is set.",["p042"]),
   ("Third: putting per-user data before static instructions.",["p042"]),
   ("And fourth: truncating required policy to save tokens, instead of caching it.",["p042"])]),
 ("the self-check","staged flow",None,[
   ("Now, let's check yourself. {pause} Take your time with these. {beat} Question one: your cache hit rate is zero, though cache control is set on the system prompt. Name three possible causes. {think}",["p044"]),
   ("Question two: what are the three levels of progressive disclosure in Skills? {think}",["p044"]),
   ("Question three: when would you choose just-in-time retrieval over pre-loading? {think}",["p044"]),
   ("Question four: name three long-horizon context techniques. {think}",["p044"]),
   ("And question five: why is it wrong to say: we have a one million window, so context doesn't matter? {think} Ready? {beat} Here's how you did.",["p044"])]),
 ("the answers","definition card",None,[
   ("So, one: the prefix is below the minimum length. Or something dynamic sits in the prefix, like a timestamp or a user name.",["p045"]),
   ("Or your calls are further apart than the T T L. {beat} Or tool choice, thinking or effort changes between calls.",["p045"]),
   ("Two: metadata is always loaded. The Skill dot M D body loads when it's relevant. And bundled files or scripts load, or run, on demand.",["p045"]),
   ("Three: when the data is large, changes often, or the task path is unpredictable.",["p045"]),
   ("Four: compaction, structured note-taking, and sub-agents with clean contexts.",["p045"]),
   ("Five: because context rot degrades precision as the context grows. And every token costs money and latency.",["p045"]),
   ("That's chapter three. {beat} Give the model the smallest set of high-signal tokens, and reuse what you can. {pause} See you in the next one.",["p002"])]),
]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"writer_tail.py")).read())
