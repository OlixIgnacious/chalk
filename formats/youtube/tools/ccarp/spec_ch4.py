# Per-scene visual spec for CCAR-P Chapter 4. Copy is short on-screen text, never a narrated sentence;
# each cue is a word from that scene's own captions (display layer): a string, or [string, nth occurrence].
R=lambda items,cues,**kw: dict(k="rows",items=items,cues=cues,**kw)
C=lambda items,cues,**kw: dict(k="chips",items=items,cues=cues,**kw)
F=lambda items,cues,**kw: dict(k="flow",items=[dict(t=t) for t in items],cues=cues,**kw)
N=lambda *ts: [dict(n=f"{i+1:02d}",t=t) for i,t in enumerate(ts)]
def COLS(a,b,cues,hot=None,y=380): return dict(k="cols",items=[dict(l=a[0],t=a[1],s=a[2]),dict(l=b[0],t=b[1],s=b[2])],cues=cues,y=y,**({"hot":hot} if hot else {}))
def TBL(head,w,rows,cues,y=330,hot=None): return dict(k="table",head=head,w=w,y=y,rows=rows,cues=cues,**({"hot":hot} if hot else {}))
GAPS=lambda rows,cues: TBL(["the gap","the fix"],[820,888],rows,cues)
SPEC={
"01":[
 dict(slug="title",label="CCAR-P · Chapter 4",head=["tools, mcp","& access control"],big=True,titlecues=["tools,","control."],body=[]),
 dict(slug="problem",label="the problem",head=["what could go wrong"],body=[
   R(N("your agent calls tools and reaches your data","integration: the heaviest domain, 19%","you'll be shown a configuration","what's wrong with it?","action side now, data side in Chapter 5"),["Picture","Integration","shown","asked","covers"],hot=[3])]),
 dict(slug="outcomes",label="by the end",head=["you can"],body=[
   R(N("evaluate tool configurations for bloat","analyze authentication and authorization","choose MCP, API, CLI or agent-to-agent","weigh progressive vs monolithic context"),["evaluate","analyze","choose","weigh"])]),
],
"02":[
 dict(slug="loop",label="4.1 · how tool use works",head=["a loop"],body=[
   F(["you describe tools: name, description, JSON schema","Claude returns a tool-use request","your code runs the tool","the result goes back; Claude continues"],["describe","decides","runs","continues."],y=380,hot=[2])]),
 dict(slug="who-executes",label="4.1 · how tool use works",head=["who executes"],body=[
   dict(k="quote",t="the model never executes anything itself",cue="never",y=350),
   C(["authorization","validation","logging"],["authorization,","validation,","logging."],y=640,label="they belong in your execution layer",hot=[0])]),
 dict(slug="two-costs",label="4.1 · how tool use works",head=["two costs"],body=[
   COLS(("every request","tool definitions","consume context on every single request"),("every result","tool results","are context too: verbose results crowd out reasoning"),["definitions","results"],hot=[1])]),
 dict(slug="tool-choice",label="4.1 · how tool use works",head=["tool choice"],body=[
   R([dict(n="auto",t="let Claude decide"),dict(n="any",t="force some tool"),dict(n="one",t="force one specific tool"),dict(n="off",t="disable tools")],["auto.","any.","specific","disable"],y=340)]),
 dict(slug="server-client",label="4.1 · how tool use works",head=["two kinds of tools"],body=[
   COLS(("server-side","web search, code execution","run on Anthropic's infrastructure"),("client-side","the ones you implement","tools you build yourself"),["server-side","Client-side"])]),
],
"03":[
 dict(slug="six",label="4.2 · designing good tools",head=["six ideas"],body=[
   R(N("fewer, more capable tools","clear namespacing","descriptions for a new colleague","token-efficient returns","helpful errors","evaluate like prompts"),["design","guidance","writing","agents.","six","order."],cols=2,y=330)]),
 dict(slug="fewer",label="4.2 · an example",head=["fewer, more capable"],body=[
   COLS(("three tools","list_users + list_events + create_event","don't wrap every endpoint 1:1"),("one tool","schedule_event","finds availability and books"),["list","schedule"],hot=[1])]),
 dict(slug="namespacing",label="4.2 · clear namespacing",head=["clear namespacing"],body=[
   C(["crm_search_contacts","jira_create_issue"],["crm_search_contacts,","jira_create_issue."],y=380,mono=True,label="service + resource"),
   R([dict(n="→",t="the model can tell overlapping tools apart")],["overlapping"],y=620)]),
 dict(slug="descriptions",label="4.2 · descriptions",head=["write for a new colleague"],body=[
   R(N("what it does, and when to use it","what each parameter means","what it returns"),["Say","parameter","returns."],y=330),
   C(["user_id","not: user"],["user_id,","user."],y=790,mono=True,hot=[0],label="unambiguous parameter names")]),
 dict(slug="returns",label="4.2 · token-efficient returns",head=["token-efficient returns"],body=[
   R(N("human-readable fields: names, not opaque IDs","pagination, filtering and truncation","a response format: concise or detailed"),["human-readable","pagination,","response"],y=340)]),
 dict(slug="errors",label="4.2 · an example",head=["helpful errors"],body=[
   dict(k="quote",t="date must be ISO 8601, e.g. 2026-10-01",cue="date",y=350),
   R([dict(n="→",t="actionable, so the agent corrects itself")],["actionable"],y=640)]),
 dict(slug="evaluate",label="4.2 · evaluate your tools",head=["evaluate like prompts"],body=[
   F(["run realistic tasks","read the transcripts","measure accuracy, refine descriptions"],["Run","read","Measure"],y=380,hot=[2])]),
],
"04":[
 dict(slug="what",label="4.3 · capability bloat",head=["capability bloat"],body=[
   R(N("more tools than the role needs","more permissions than the role needs","more connected servers than the role needs"),["tools,","permissions,","servers"],y=360)]),
 dict(slug="two-problems",label="4.3 · capability bloat",head=["two problems"],body=[
   COLS(("security","attack surface","prompt injection or a model error can only misuse tools that exist"),("quality and cost","confused tool selection","overlapping tools consume context on every request"),["security.","quality"],hot=[0])]),
 dict(slug="sample",label="4.3 · an example",head=["sample question 1"],body=[
   R(N("read tickets","draft replies","issue refunds","delete accounts"),["tickets,","replies,","refunds,","accounts."],y=340,hot=[2,3])]),
 dict(slug="answer",label="4.3 · an example",head=["the answer"],body=[
   R(N("remove the refund and delete tools","logging is detective: weaker","confirmation is compensating: weaker","a bigger model: irrelevant to scope"),["Remove","logging,","confirmation","bigger"],y=340,hot=[0])]),
 dict(slug="scope-split",label="4.3 · remedies",head=["scope and split"],body=[
   R([dict(n="01",t="scope tools per role or agent",s="each sub-agent gets only the tools for its task"),dict(n="02",t="split read and write tools",s="grant write only where it's needed")],["First,","Second,"],y=360)]),
 dict(slug="narrow",label="4.3 · remedies",head=["narrow, audit, discover"],body=[
   R(N("narrow: get_order_status, not run_sql","audit connected MCP servers","progressive discovery for large tool sets"),["replace","audit","progressive"],y=360)]),
 dict(slug="hierarchy",label="4.3 · control hierarchy",head=["control hierarchy"],body=[
   R([dict(n="1",t="eliminate the capability"),dict(n="2",t="restrict: narrow scope, allow-lists, limits"),dict(n="3",t="require approval"),dict(n="4",t="detect: logging, alerting"),dict(n="5",t="respond: incident process")],["Eliminate","restrict","approval.","detect,","respond,"],y=330,hot=[0])]),
],
"05":[
 dict(slug="two-words",label="4.4 · authentication and authorization",head=["two different words"],body=[
   COLS(("authentication","who is calling",""),("authorization","what they may do",""),["authentication","authorization"],hot=[1],y=360),
   R([dict(n="→",t="eight common gaps, taken in pairs")],["pairs."],y=720)]),
 dict(slug="identity-prompt",label="4.4 · gaps 1 and 2",head=["identity and prompt"],body=[
   GAPS([["one shared service account, broad access","act as the end user: per-user OAuth, delegated tokens"],["authorization only in the system prompt","enforce in the tool or API layer: the model requests, code decides"]],["First","Second"])]),
 dict(slug="retrieval-secrets",label="4.4 · gaps 3 and 4",head=["retrieval and secrets"],body=[
   GAPS([["retrieval returns documents the user can't see","filter by entitlements at retrieval: metadata or ACL filters"],["API keys or secrets in prompts or tool outputs","secrets manager; inject at execution time; never in context"]],["Third","Fourth"])]),
 dict(slug="tokens",label="4.4 · gaps 5 and 6",head=["tokens"],body=[
   GAPS([["long-lived, broad tokens","short-lived, least-privilege, scoped tokens; rotate them"],["MCP server passes the client's token downstream","the server gets its own scoped tokens; the spec forbids passthrough"]],["fifth","Sixth"])]),
 dict(slug="audit-policy",label="4.4 · gaps 7 and 8",head=["audit and policy"],body=[
   GAPS([["no audit trail of tool calls","log who, which tool, what parameters, the result, the time"],["high-impact actions with no policy check","policy engine, allow-list or human approval; fail closed"]],["seventh","Eighth:"])]),
 dict(slug="key-idea",label="4.4 · the key idea",head=["never a control"],body=[
   dict(k="quote",t="the model will follow the instruction not to access other customers' data",cue="follow",y=340),
   R([dict(n="→",t="enforced by systems the model can't talk its way past")],["enforced"],y=730,hot=[0])]),
],
"06":[
 dict(slug="what",label="4.5 · model context protocol",head=["model context protocol"],body=[
   R(N("an open standard","connects AI applications to external tools and data","introduced by Anthropic, November 2024"),["open","external","introduced"],y=360)]),
 dict(slug="architecture",label="4.5 · architecture",head=["host, client, server"],body=[
   F(["host: Claude Desktop, Claude Code, your agent app","client: one per server","server: exposes capabilities"],["host","client","Servers"],y=380)]),
 dict(slug="primitives",label="4.5 · server primitives",head=["three primitives"],body=[
   TBL(["primitive","controlled by","example"],[420,560,728],[["tools","the model","create_ticket, query_orders"],["resources","the application","files, records, documents"],["prompts","the user","a slash-command template"]],["Tools","Resources","prompts"],hot=[0])]),
 dict(slug="transports",label="4.5 · transports",head=["two transports"],body=[
   COLS(("local","stdio","running as a subprocess"),("remote","Streamable HTTP","OAuth 2.1-based authorization"),["stdio","Streamable"])]),
 dict(slug="security",label="4.5 · security",head=["connect with care"],body=[
   R(N("only connect trusted servers","review tool descriptions","scope credentials per server","treat results as untrusted data","pin server versions"),["trusted","review","scope","Treat","pin"],y=330,hot=[0])]),
],
"07":[
 dict(slug="four",label="4.6 · choosing the integration mechanism",head=["four mechanisms"],body=[
   C(["MCP","API / function tools","CLI","agent-to-agent (A2A)"],["MCP,","API","CLI,","agent"],y=420,fs=54)]),
 dict(slug="mcp",label="4.6 · MCP",head=["mcp"],body=[
   COLS(("choose when","many clients share one integration","a maintained vendor server exists, or you want standard discovery and auth"),("avoid when","one small app, two custom functions","extra moving parts"),["multiple","Avoid"],hot=[1])]),
 dict(slug="api",label="4.6 · direct API",head=["direct api"],body=[
   COLS(("choose when","a single application","custom business logic, lowest latency, full control"),("avoid when","many teams re-implementing","the same integration"),["single","Avoid"],hot=[1])]),
 dict(slug="cli",label="4.6 · CLI",head=["cli"],body=[
   COLS(("choose when","a shell-based agent","a mature CLI the model knows well: git, gh, cloud tools"),("avoid when","no shell, or huge output","unstructured CLI output"),["shell,","Avoid"],hot=[1])]),
 dict(slug="a2a",label="4.6 · agent to agent",head=["agent to agent"],body=[
   COLS(("choose when","delegating a whole task","to an autonomous agent owned by another team or vendor"),("avoid when","you just need a function","use a tool instead"),["delegating","function"],hot=[1])]),
 dict(slug="relate",label="4.6 · how they relate",head=["complementary"],body=[
   COLS(("mcp","agent → tools and data","standardises how an agent reaches them"),("a2a","agent → agent","standardises how agents delegate"),["MCP","A2A"],y=360),
   R([dict(n="→",t="complementary, not competing")],["complementary,"],y=720,hot=[0])]),
 dict(slug="latency",label="4.7 · accuracy vs latency",head=["accuracy vs latency"],body=[
   F(["each tool round trip adds a model turn","a remote MCP server adds network hops","code execution can cut round trips"],["Each","remote","code-execution"],y=340),
   C(["steps × (model latency + tool latency) must fit"],["arithmetic."],y=740,mono=True,hot=[0],label="when the question gives an SLA")]),
],
"08":[
 dict(slug="monolithic",label="4.8 · monolithic",head=["monolithic"],body=[
   COLS(("pros","simple, predictable","no discovery round trips; cacheable"),("cons","cost grows with every tool","similar tools hurt selection; context rot"),["pros?","cons?"],hot=[1])]),
 dict(slug="progressive",label="4.8 · progressive discovery",head=["progressive discovery"],body=[
   R([dict(n="01",t="tool search",s="a search tool loads matching definitions on demand"),dict(n="02",t="code execution with MCP",s="tools as code files, called from a sandbox"),dict(n="03",t="Skills",s="metadata → SKILL.md → bundled files")],["first","sees","demand."],y=330,hot=[0])]),
 dict(slug="code-exec",label="4.8 · code execution with MCP",head=["code execution with mcp"],body=[
   F(["tools presented as code files in a filesystem","the agent browses and writes code that calls them in a sandbox","intermediate data stays in the sandbox"],["Tools","browses","Intermediate"],y=360),
   R([dict(n="→",t="a privacy benefit, too")],["privacy"],y=730)]),
 dict(slug="numbers",label="4.8 · an example",head=["the numbers"],body=[
   dict(k="stat",t="150,000",s="tokens: a Google Drive to Salesforce task",cue="150,000",y=320),
   dict(k="stat",t="2,000",s="tokens, with code execution",cue="2,000",y=540,hot=True),
   R([dict(n="→",t="98.7% fewer tokens")],["98.7%"],y=770,hot=[0])]),
 dict(slug="skills",label="4.8 · skills",head=["skills"],body=[
   F(["metadata","SKILL.md body","bundled files"],["Metadata","SKILL.md","bundled"],y=380),
   R([dict(n="→",t="see Chapter 3")],["Chapter"],y=700)]),
 dict(slug="which",label="4.8 · which to choose",head=["which to choose"],body=[
   TBL(["choose","when"],[420,1288],[["monolithic","a small, stable tool set; latency-critical; tools used together"],["progressive","many servers or tools; each task uses a subset; large intermediate data; context budget pressure"]],["Monolithic","Progressive"],y=340)]),
 dict(slug="trade-off",label="4.8 · the trade-off",head=["the trade-off"],body=[
   COLS(("progressive discovery","adds exploration steps","which means latency"),("code execution","needs a secure sandbox","resource limits and monitoring"),["exploration","code"],hot=[1])]),
],
"09":[
 dict(slug="traps",label="4.9 · exam traps",head=["five exam traps"],body=[
   R(N("logging or confirmation when you could remove it","prompt-only authorization","a shared super-user credential","MCP for one app with two functions","150 tool definitions loaded at once"),["First:","Second:","Third:","Fourth:","fifth:"],y=330)]),
 dict(slug="self-check",label="self-check",head=["self-check"],body=[
   R(N("rank: logging, removing, confirmation, narrowing","the confused-deputy risk?","which MCP primitive is model-controlled?","a CLI over an MCP server: when?","two costs of progressive discovery"),[["Question",0],["Question",1],["Question",2],["Question",3],["Question",4]],y=330)]),
 dict(slug="answers",label="self-check · answers",head=["answers"],body=[
   R(N("remove → narrow → confirm → log","the agent outranks the user and can be misled","tools","a shell agent with a mature, known CLI","latency, plus sandbox overhead"),["one:","Two:","Three:","Four:","Five:"],y=330,hot=[0])]),
],
}
TRACK=["Tool use","Tool design","Bloat","Auth","MCP","Choosing","Discovery","Traps"]
TRACKMAP={"02":0,"03":1,"04":2,"05":3,"06":4,"07":5,"08":6,"09":7}
