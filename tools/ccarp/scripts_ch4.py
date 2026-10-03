# Writes segments/NN/script.md for CCAR-P Chapter 4 (spoken layer with pause markers; display layer derived via lexicon).
# usage: CCARP_DIR=<dir>/ python3 scripts_ch4.py
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
   ("Let's talk about tools, M C P, and access control.",["h001"])]),
 ("the problem","definition card",None,[
   ("Picture this. {beat} Your agent can call tools, and it can reach your data. {beat} So what could go wrong?",["p002"]),
   ("That's exactly the question the exam asks. {beat} Integration is the heaviest domain, at nineteen percent. And most of its objectives start with evaluate, or analyze.",["p002"]),
   ("You'll be shown a configuration. {pause} And you'll be asked what's wrong with it, or which option is the most defensible.",["p002"]),
   ("This chapter covers the action side: tools, protocols, and security. {beat} The data side, retrieval and observability, comes in Chapter five.",["p002"])]),
 ("what you'll be able to do","decomposition",None,[
   ("So here's where we're headed. {beat} By the end, you'll evaluate a tool or agent configuration for capability bloat.",["p003"]),
   ("You'll analyze authentication and authorization, and find the security gaps. {beat} And you'll choose between M C P, an A P I or a C L I, and agent to agent.",["p003"]),
   ("You'll also weigh progressive discovery against a monolithic context. {pause} But first, how does tool use actually work?",["p003"])]),
]
S["02"]=[
 ("the loop","staged flow",None,[
   ("Let's start with how tool use works. {pause} It's a loop.",["p005"]),
   ("You describe your tools to Claude. {beat} Each one has a name, a description, and a J S O N input schema. You write all of that.",["p005"]),
   ("Claude decides whether to call one, and returns a structured tool-use request. {beat} Your code runs the tool, and sends back the result. Then Claude continues.",["p005"])]),
 ("who executes","definition card",None,[
   ("Now, here's the consequence that matters most. {pause} So who actually runs the tool? {beat} Not the model. The model never executes anything itself.",["p005"]),
   ("Your execution layer does. {beat} So that's where authorization, validation, and logging belong.",["p005"])]),
 ("two costs","split panel",None,[
   ("There are two costs to keep in mind. {pause} First, tool definitions consume context on every single request.",["p005"]),
   ("Second, tool results are context too. {beat} Verbose results crowd out reasoning.",["p005"])]),
 ("tool choice","decomposition",None,[
   ("Now, you also control how Claude picks. {pause} Tool choice has four settings.",["p005"]),
   ("You can let Claude decide, which is auto. {beat} You can force it to use some tool, which is any. You can force one specific tool. Or you can disable tools entirely.",["p005"])]),
 ("server and client tools","split panel",None,[
   ("Finally, one last distinction. {pause} Anthropic provides server-side tools, like web search and code execution, that run on Anthropic's infrastructure.",["p006"]),
   ("Client-side tools are the ones you implement yourself.",["p006"])]),
]
S["03"]=[
 ("six ideas","decomposition",None,[
   ("Now, how do you design a good tool? {pause} This comes from Anthropic's engineering guidance on writing tools for agents.",["p008"]),
   ("There are six ideas. {beat} Let's go through them in order.",["p008"])]),
 ("fewer, more capable tools","split panel","chapter",[
   ("First, fewer, more capable tools. {beat} Consolidate multi-step operations. Let's look at it through an example.",["p008"]),
   ("Instead of list users, list events, and create event, build one schedule event tool. {beat} It finds availability, and books the meeting.",["p008"]),
   ("And don't wrap every A P I endpoint one to one.",["p008"])]),
 ("namespacing","definition card",None,[
   ("Second, clear namespacing. {pause} Prefix each tool by service and resource, like C R M search contacts, or jira create issue.",["p008"]),
   ("That way the model can tell overlapping tools apart.",["p008"])]),
 ("descriptions","staged flow",None,[
   ("Third, write descriptions for a new colleague. {pause} Say what the tool does, and when to use it.",["p008"]),
   ("Say what each parameter means, and what the tool returns. {beat} And keep parameter names unambiguous. User I D, not just user.",["p008"])]),
 ("returns","staged flow",None,[
   ("Now, fourth, meaningful, token-efficient returns. {pause} Return the human-readable fields the model needs. Names, not opaque identifiers.",["p008"]),
   ("Support pagination, filtering, and truncation, with sensible defaults. {beat} And offer a response format option: concise, or detailed.",["p008"])]),
 ("helpful errors","worked example","chapter",[
   ("Now, fifth, helpful errors. {pause} Return an actionable message, so the agent can correct itself instead of looping.",["p008"]),
   ("Let's look at it through an example. {beat} Something like: date must be I S O eight six oh one, with an example date.",["p008"])]),
 ("evaluate","definition card",None,[
   ("And sixth, evaluate your tools, the way you'd evaluate prompts. {pause} Run realistic tasks, and read the transcripts.",["p008"]),
   ("Measure tool-call accuracy. {beat} Then refine your descriptions.",["p008"])]),
]
S["04"]=[
 ("what it is","definition card",None,[
   ("Now, capability bloat. {pause} What is it? {beat} It means an agent has more tools, permissions, or connected servers than its role needs.",["p010"])]),
 ("two problems","split panel",None,[
   ("So that causes two separate problems. {pause} The first is security. Every unnecessary capability is attack surface.",["p010"]),
   ("Prompt injection, or a plain model error, can only misuse tools that exist.",["p010"]),
   ("The second is quality and cost, and you'll feel it in every request. {beat} Many overlapping tools confuse tool selection, and they consume context on every request.",["p010"])]),
 ("sample question one","worked example","chapter",[
   ("Let's look at it through an example. {pause} This is official Sample Question one.",["p011"]),
   ("A support agent can read tickets, draft replies, issue refunds, and delete accounts. {beat} But staff only need to read and draft.",["p011"])]),
 ("the answer","staged flow","chapter",[
   ("So what's the right answer? {think} Remove the refund and delete tools.",["p011"]),
   ("Why not logging, or confirmation prompts? {beat} Because the capability still exists. Logging is detective, and confirmation is compensating. So both are weaker.",["p011"]),
   ("And a bigger model? {beat} That's irrelevant to authorization scope.",["p011"])]),
 ("scope and split","staged flow",None,[
   ("So how do you fix bloat? {pause} There are five remedies.",["p012"]),
   ("First, scope tools per role. {beat} In multi-agent systems, each sub-agent gets only the tools for its task. The coordinator doesn't inherit everything.",["p012"]),
   ("Second, split read tools from write tools. {beat} And grant write only where it's needed.",["p012"])]),
 ("narrow, audit, discover","staged flow",None,[
   ("Third, replace broad tools with narrow ones. {pause} Instead of run S Q L, give the agent get order status, taking an order I D. That's where the use case allows.",["p012"]),
   ("Fourth, audit your connected M C P servers, and disable the ones you don't use.",["p012"]),
   ("And fifth, when you genuinely need a large tool set, use progressive discovery. {beat} We'll get to that at the end of the chapter.",["p012"])]),
 ("the control hierarchy","staged flow",None,[
   ("Finally, there's a ladder to remember. {pause} The control hierarchy, strongest first.",["p013"]),
   ("Eliminate the capability. {beat} Then you restrict it, with narrow scope, allow-lists, and parameter limits. Then you require approval.",["p013"]),
   ("Then detect, with logging and alerting. {beat} And last, respond, with an incident process.",["p013"]),
   ("And here's the exam rule. {beat} Answers favour the highest feasible level.",["p013"])]),
]
S["05"]=[
 ("two words","split panel",None,[
   ("Now let's talk about authentication and authorization. {pause} They sound alike, but they're different. {beat} Authentication is who is calling. Authorization is what they may do.",["p015"]),
   ("The exam shows you common gaps, and there are eight of them. {beat} We'll go through them in pairs.",["p016"])]),
 ("identity and prompt","comparison table",None,[
   ("First gap: the agent uses one shared service account, with broad access. {beat} Then any user can reach any data, through the agent. That's the confused deputy problem.",["p016"]),
   ("The fix? {beat} Act with the end user's identity and permissions. Use per-user oh auth, or delegated tokens, and enforce row-level access.",["p016"]),
   ("Second gap: authorization written only in the system prompt. {beat} Prompt injection, or a model error, can bypass it.",["p016"]),
   ("So you enforce it in the tool or A P I layer. {pause} The model can request. Code decides.",["p016"])]),
 ("retrieval and secrets","comparison table",None,[
   ("Third gap: retrieval returns documents the user can't see. {beat} Data leaks through R A G answers. So you filter by the user's entitlements at retrieval time, using metadata or A C L filters.",["p016"]),
   ("Fourth: A P I keys or secrets placed in prompts or tool outputs. {beat} They can leak in outputs, or in logs.",["p016"]),
   ("So you use a secrets manager, and inject them at execution time. {beat} Never put them in context.",["p016"])]),
 ("tokens","comparison table",None,[
   ("Now, fifth gap: long-lived, broad tokens. {beat} If one leaks, the blast radius is large. Use short-lived, least-privilege, scoped tokens, and rotate them.",["p016"]),
   ("Sixth: an M C P server passes the client's token through to downstream A P I endpoints. {pause} That breaks audience validation, and it causes privilege confusion.",["p016"]),
   ("The server should obtain its own, properly scoped tokens. {beat} In fact, the M C P spec forbids token passthrough.",["p016"])]),
 ("audit and policy","comparison table",None,[
   ("Next, seventh gap: no audit trail of tool calls. {beat} You can't investigate, and you can't prove compliance.",["p016"]),
   ("So you log who called which tool, with what parameters, what came back, and when.",["p016"]),
   ("Eighth: high-impact actions with no policy check. {pause} One bad call can do irreversible damage.",["p016"]),
   ("So you add tool-call authorization: a policy engine, an allow-list, or human approval. {beat} And fail closed.",["p016"])]),
 ("the key idea","definition card",None,[
   ("Here's the key idea. {pause} The model will follow the instruction not to access other customers' data. {beat} That is never a control.",["p017"]),
   ("Authorization is enforced by systems the model can't talk its way past.",["p017"])]),
]
S["06"]=[
 ("what MCP is","definition card",None,[
   ("Now, the Model Context Protocol, or M C P. {pause} It's an open standard for connecting AI applications to external tools and data.",["p019"]),
   ("Anthropic introduced it in November twenty twenty-four.",["p019"])]),
 ("architecture","staged flow",None,[
   ("So how is it organised? {beat} A host runs one or more clients. A host might be Claude Desktop, Claude Code, or your own agent app.",["p020"]),
   ("Each client connects to one server. {beat} Servers expose capabilities, and clients consume them.",["p020"])]),
 ("the three primitives","comparison table",None,[
   ("Now, servers expose three primitives. {pause} The question is, who controls each one?",["p021","p022"]),
   ("Tools are model-controlled. {beat} Claude decides to call them, like create ticket, or query orders.",["p022"]),
   ("Resources are application-controlled. {beat} The host decides what to attach. Files, database records, documents.",["p022"]),
   ("And prompts are user-controlled. {beat} You choose them explicitly, like a slash command that runs a summarise this P R template.",["p022"]),
   ("Remember which one is model-controlled. It comes back in the self-check.",["p022"])]),
 ("transports","split panel",None,[
   ("Next, how does it connect? {pause} There are two transports.",["p023"]),
   ("Standard I O is for local servers, running as a subprocess. {beat} Streamable H T T P is for remote servers.",["p023"]),
   ("And remote servers use oh auth two point one based authorization.",["p023"])]),
 ("MCP security","decomposition",None,[
   ("And now, the security side. {pause} Only connect trusted servers. {beat} A malicious server can inject instructions through tool descriptions, or through results.",["p024"]),
   ("So you review tool descriptions, and you scope credentials per server. {beat} Treat tool results as untrusted data. And pin your server versions.",["p024"])]),
]
S["07"]=[
 ("four mechanisms","decomposition",None,[
   ("So when do you use which? {pause} There are four mechanisms. M C P, direct A P I or function tools, a C L I, and agent to agent.",["p026"]),
   ("Let's take them one at a time, starting with M C P.",["p026"])]),
 ("MCP","split panel",None,[
   ("So, M C P first. {beat} Choose it when the same integration serves multiple clients or agents. {beat} Or when a maintained vendor server already exists. Or when you want standard discovery and auth.",["p026"]),
   ("Avoid it for one small app with two custom functions. {beat} That's just extra moving parts.",["p026"])]),
 ("direct API","split panel",None,[
   ("Now, the direct A P I, or function tools. {pause} Choose them for a single application, with custom business logic, where you want the lowest latency and full control.",["p026"]),
   ("Avoid them when many teams are re-implementing the same integration.",["p026"])]),
 ("CLI","split panel",None,[
   ("Next, the C L I. {pause} Choose it when the agent works in a shell, like Claude Code, and a mature C L I exists that the model already knows well. Think git, G H, or the cloud C L I tools.",["p026"]),
   ("Avoid it when there's no shell, or when the output is huge and unstructured.",["p026"])]),
 ("agent to agent","split panel",None,[
   ("Then, agent to agent. {pause} Choose it when you're delegating a whole task to an autonomous agent owned by another team or vendor.",["p026"]),
   ("You exchange tasks and results, not function calls. {beat} And if you just need a deterministic function, use a tool instead.",["p026"])]),
 ("how they relate","definition card",None,[
   ("So how do M C P and A two A relate? {pause} M C P standardises how an agent reaches tools and data.",["p027"]),
   ("A two A standardises how agents delegate to other agents. {beat} They're complementary, not competing.",["p027"])]),
 ("accuracy and latency","staged flow",None,[
   ("One more angle: accuracy versus latency. {pause} Integration choices change both.",["p029"]),
   ("Each extra tool round trip adds a model turn, so more latency and more tokens. {beat} A remote M C P server adds network hops.",["p029"]),
   ("A code-execution approach can cut round trips, by doing several operations in one script.",["p029"]),
   ("And when the question gives you an S L A, do the arithmetic. {beat} Steps, times model latency plus tool latency, has to fit.",["p029"])]),
]
S["08"]=[
 ("monolithic","split panel",None,[
   ("Now, the last big idea. {pause} Monolithic, versus progressive discovery.",["p031"]),
   ("Monolithic means all tool definitions and reference material load at the start of every request.",["p031"]),
   ("The pros? {beat} It's simple and predictable. There are no discovery round trips, and it's cacheable.",["p031"]),
   ("The cons? {beat} Token cost grows with every tool. Many similar tools hurt selection accuracy. And you get context rot.",["p031"])]),
 ("progressive","staged flow",None,[
   ("Now, progressive discovery flips that. {pause} The agent loads definitions or knowledge only when it needs them.",["p032"]),
   ("There are three ways to do it. {beat} The first is tool search. The agent sees a search tool, and loads matching tool definitions on demand.",["p032"])]),
 ("code execution","staged flow",None,[
   ("Second, code execution with M C P. {pause} Tools are presented as code files in a filesystem.",["p032"]),
   ("The agent browses to find what it needs, and writes code that calls them in a sandbox.",["p032"]),
   ("Intermediate data stays in the sandbox, instead of passing through the model. {beat} That's a privacy benefit, too.",["p032"])]),
 ("the numbers","worked example","chapter",[
   ("Let's look at it through an example. {pause} Anthropic's example was a Google Drive to Salesforce task.",["p032"]),
   ("It dropped from about one hundred fifty thousand tokens, to two thousand. {beat} That's ninety-eight point seven percent.",["p032"])]),
 ("skills","definition card",None,[
   ("Third, Skills. {pause} Metadata first, then the Skill dot M D body, then the bundled files.",["p032"]),
   ("You saw that in Chapter three.",["p032"])]),
 ("which to choose","comparison table",None,[
   ("So which do you choose? {pause} Monolithic suits a small, stable tool set. Roughly a handful, up to a couple dozen.",["p033"]),
   ("It also suits latency-critical work, or tools that are often used together.",["p033"]),
   ("Progressive suits many servers or tools, where each task uses a small subset. {beat} Or large intermediate data, or pressure on your context budget.",["p033"])]),
 ("the trade-off","definition card",None,[
   ("But there's a trade-off. {pause} Progressive discovery adds exploration steps, which means latency.",["p034"]),
   ("And code execution needs a secure sandbox, with resource limits and monitoring.",["p034"])]),
]
S["09"]=[
 ("five exam traps","decomposition",None,[
   ("Before you go, watch for five exam traps. {pause} First: choosing logging or confirmation, when you could remove the capability.",["p036"]),
   ("Second: prompt-only authorization.",["p036"]),
   ("Third: a shared super-user credential behind a multi-user agent.",["p036"]),
   ("Fourth: picking M C P for a single-app, two-function integration, just because it's the standard.",["p036"]),
   ("And fifth: loading one hundred fifty tool definitions monolithically, and then blaming the model for picking the wrong tool.",["p036"])]),
 ("the self-check","staged flow",None,[
   ("Now, let's check yourself. {pause} Take your time with these. {beat} Question one: rank these controls, strongest to weakest. Logging, removing the tool, a confirmation prompt, and narrowing its scope. {think}",["p038"]),
   ("Question two: what is the confused-deputy risk in agent design? {think}",["p038"]),
   ("Question three: which M C P primitive is model-controlled? {think}",["p038"]),
   ("Question four: when is a C L I better than an M C P server? {think}",["p038"]),
   ("And question five: name two costs of progressive discovery. {think} Ready? {beat} Here's how you did.",["p038"])]),
 ("the answers","definition card",None,[
   ("So, one: remove it first. {beat} Then narrow its scope, then a confirmation prompt, and logging last.",["p039"]),
   ("Two: the agent holds broader privileges than the user, and it can be induced to act on data the user shouldn't reach.",["p039"]),
   ("Three: tools.",["p039"]),
   ("Four: in a shell-based agent, where a mature, well-known C L I already exists.",["p039"]),
   ("Five: extra latency and round trips, plus sandbox infrastructure and security overhead, for code execution.",["p039"]),
   ("That's chapter four. {beat} Remove what the agent doesn't need. Enforce authorization where the model can't argue. And load tools only when you need them. {pause} See you in the next one.",["p013","p017","p032"])]),
]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"writer_tail.py")).read())
