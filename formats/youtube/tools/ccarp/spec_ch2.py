# Per-scene visual spec for CCAR-P Chapter 2 (v3). Copy is short on-screen text, never a narrated sentence;
# each cue is a word from that scene's own captions (display layer): a string, or [string, nth occurrence].
R=lambda items,cues,**kw: dict(k="rows",items=items,cues=cues,**kw)
C=lambda items,cues,**kw: dict(k="chips",items=items,cues=cues,**kw)
SPEC={
"01":[
 dict(slug="title",label="CCAR-P · Chapter 2",head=["claude models","& prompting"],big=True,body=[]),
 dict(slug="thesis",label="the idea",head=["the trade-off"],body=[
   R([dict(n="01",t="capability · speed · cost"),dict(n="02",t="effort inside one model"),dict(n="03",t="clear, structured instructions")],["capability","effort","structured"],hot=[1])]),
 dict(slug="outcomes",label="by the end",head=["you can"],body=[
   R([dict(n="01",t="select a model on trade-offs"),dict(n="02",t="design prompts, templates, guardrails"),dict(n="03",t="zero-shot · few-shot · chain-of-thought")],["pick","design","zero-shot"])]),
],
"02":[
 dict(slug="tiers",label="2.1 · the model family",head=["tiers"],body=[
   R([dict(n="↑",t="more capable"),dict(n="↓",t="slower"),dict(n="$",t="more expensive"),dict(n="src",t="Anthropic's models overview")],["capable","slower","cost","overview"])]),
 dict(slug="models",label="2.1 · the model family",head=["four models"],body=[
   dict(k="table",head=["model","best for","in / out per M tokens"],w=[360,860,488],y=330,
        rows=[["Fable 5.1","demanding reasoning, long-horizon agentic work","$10 / $50"],
              ["Opus 5.5","recommended default","$4 / $20"],
              ["Sonnet 5","balance of speed and intelligence","$2 / $10"],
              ["Haiku 4.5","fastest, cheapest · 200K context","$1 / $5"]],
        cues=["Fable","Opus","Sonnet","Haiku"],hot=[1])]),
 dict(slug="retirement",label="2.1 · the model family",head=["plan for retirement"],body=[
   dict(k="flow",items=[dict(t="every model page lists a retirement date"),dict(t="pin versions in production"),dict(t="regression evals, then migrate")],cues=["retirement","pin","schedule"],hot=[2],y=380)]),
 dict(slug="platforms",label="2.1 · the model family",head=["where it runs"],body=[
   C(["Claude API","Amazon Bedrock","Google Cloud Vertex AI","other platforms"],["Claude","Amazon","Google","other"],y=340,fs=38),
   C(["data residency","cloud agreements","compliance boundaries","procurement"],["residency,","agreements,","boundaries","procurement."],y=520,hot=[2],label="usually decided by",fs=38),
   R([dict(n="→",t="compliance returns in Chapter 8")],["Chapter"],y=700)]),
],
"03":[
 dict(slug="criteria",label="2.2 · how to select a model",head=["three criteria","one lever"],body=[
   C(["capabilities","speed","cost"],["capabilities,","speed","cost."],y=470),
   C(["effort"],["Effort"],y=680,hot=[0],label="the fourth lever")]),
 dict(slug="capability-first",label="2.2 · the current default",head=["capability-first"],body=[
   dict(k="flow",items=[dict(t="implement with Opus, optimise prompts, evaluate"),dict(t="still short at top effort? move up to Fable"),dict(t="later: test cheaper tiers for part of the traffic")],cues=["begin","Say","later"],hot=[1],y=380)]),
 dict(slug="efficiency-first",label="2.2 · the alternative",head=["efficiency-first"],body=[
   dict(k="flow",items=[dict(t="start with a fast, cheap model"),dict(t="test thoroughly"),dict(t="move up only for specific gaps")],cues=["Efficiency-first","test","move"],y=380),
   C(["prototyping","tight latency","high-volume","simple tasks"],["prototyping,","latency,","high-volume","simple"],y=700,label="best for")]),
 dict(slug="effort",label="2.2 · the effort parameter",head=["effort"],body=[
   C(["intelligence","speed","cost"],["intelligence","speed","cost"],y=380,label="trades"),
   dict(k="scale",ticks=["low","medium","high"],marks=[dict(at=2,l="Fable 5.1 default"),dict(at=1,l="Opus 5.5 default")],cues=["Fable","Opus"],y=480),
   R([dict(n="↑",t="harder problems, more tokens and time")],["Turn"],y=780)]),
 dict(slug="worked-example",label="2.2 · a worked example",head=["worked example"],body=[
   dict(k="bars",items=[dict(l="document-analysis app on Opus passes evals",v=90),dict(l="complex multi-party contracts fail",v=10,hot=True)],cues=["90%","fails"],y=320),
   C(["raise effort for that class","route only complex contracts up"],["raise","route"],y=640,label="the cheapest fix"),
   dict(k="stat",t="2.5×",s="cost of moving all traffic to Fable, for 10% of requests",cue="2.5×",y=730,hot=True)]),
 dict(slug="other-levers",label="2.2 · other levers",head=["other levers"],body=[
   R([dict(n="01",t="routing by difficulty",s="Haiku-level cost on easy traffic"),dict(n="02",t="batch processing",s="roughly half price for asynchronous work"),dict(n="03",t="fast mode",s="research preview on some Opus models"),dict(n="04",t="context window",s="1M tokens, or 200K on Haiku 4.5")],["routing","batch","fast","very"],y=330)]),
],
"04":[
 dict(slug="what-thinking-does",label="2.3 · thinking",head=["thinking"],body=[
   R([dict(n="→",t="reasons step by step before answering")],["reason"],y=330),
   C(["math","analysis","multi-step logic","complex coding"],["math,","analysis","multi-step","complex"],y=480,label="improves")]),
 dict(slug="adaptive-extended",label="2.3 · thinking",head=["two kinds"],body=[
   dict(k="cols",items=[dict(l="adaptive",t="current top models",s="the model decides how much to think; effort steers it"),dict(l="extended",t="Haiku 4.5",s="an explicit thinking budget")],cues=["adaptive","Haiku"],y=360)]),
 dict(slug="trade-off",label="2.3 · the trade-off",head=["the trade-off"],body=[
   dict(k="flow",items=[dict(t="better accuracy on hard tasks"),dict(t="more latency and output tokens"),dict(t="simple, high volume: minimal thinking, smaller model")],cues=["accuracy","latency","simple"],hot=[2],y=360),
   C(["test your exact configuration"],["test"],y=700,hot=[0],label="and")]),
],
"05":[
 dict(slug="six-parts",label="2.4 · system prompts",head=["six parts"],body=[
   R([dict(n="01",t="role and context"),dict(n="02",t="task definition"),dict(n="03",t="rules and constraints"),dict(n="04",t="output contract"),dict(n="05",t="examples (optional)"),dict(n="06",t="dynamic content last")],["Role","task","rules","output","optional","dynamic"],cols=2,hot=[5],y=330)]),
 dict(slug="role-example",label="2.4 · role and context",head=["role and context"],body=[
   dict(k="quote",t="you are a support assistant for Acme's billing team, and users are small-business owners",cue="support",y=380)]),
 dict(slug="static-dynamic",label="2.4 · cache-friendly order",head=["static first","dynamic last"],body=[
   dict(k="cols",items=[dict(l="static first",t="stable instructions",s="what lets prompt caching work"),dict(l="dynamic last",t="retrieved documents, user data, the question",s="goes at the end")],cues=["static","Retrieved"],y=420,hot=[1]),
   R([dict(n="→",t="prompt caching: Chapter 3")],["caching"],y=760)]),
 dict(slug="clear-direct",label="2.4 · be clear and direct",head=["clear and direct"],body=[
   R([dict(n="01",t="state the goal"),dict(n="02",t="state the audience"),dict(n="03",t="say what good looks like"),dict(n="04",t="explain why a rule exists")],["goal,","audience,","good","explain"],hot=[3],y=330)]),
 dict(slug="xml-tags",label="2.4 · XML tags",head=["xml tags"],body=[
   C(["<instructions>","<policy>","<documents>","<examples>","<user_query>"],["Instructions,","policy,","documents,","more:","each"],y=330,mono=True),
   R([dict(n="01",t="less confusion between instructions and data"),dict(n="02",t="easier to maintain"),dict(n="03",t="tagged output that code can parse")],["confusing","easier","parse"],y=500)]),
 dict(slug="long-documents",label="2.4 · long documents",head=["long documents"],body=[
   dict(k="flow",items=[dict(t="reference material near the top"),dict(t="the question after it"),dict(t="ask Claude to quote relevant passages first")],cues=["put","question","quote"],hot=[2],y=380)]),
 dict(slug="templates",label="2.5 · templates",head=["templates"],body=[
   C(["{{policy}}","{{retrieved_docs}}","{{user_question}}"],["policy,","retrieved","user"],y=360,mono=True,label="a fixed scaffold with variables"),
   R([dict(n="01",t="stable instructions apart from per-request data"),dict(n="02",t="testable against the eval set"),dict(n="03",t="untrusted input stays in labelled data tags"),dict(n="04",t="treat templates as code")],["stable","testing","untrusted","treat"],y=500,hot=[3])]),
],
"06":[
 dict(slug="not-security",label="2.6 · prompt-level guardrails",head=["not security","controls"],body=[
   C(["they shape behaviour"],["shape"],y=440),
   C(["not security controls on their own"],["not"],y=560,hot=[0]),
   R([dict(n="→",t="see Chapter 7")],["Chapter"],y=700)]),
 dict(slug="seven",label="2.6 · seven guardrails",head=["seven guardrails"],body=[
   R([dict(n="01",t="permission to say “I don't know”"),dict(n="02",t="a grounding rule"),dict(n="03",t="quote, then answer"),dict(n="04",t="citations"),dict(n="05",t="scope limits"),dict(n="06",t="escalation rules"),dict(n="07",t="consistency aids")],["permission","grounding","quote","citations","scope","escalation","consistency"],cols=2,y=330)]),
],
"07":[
 dict(slug="zero-shot",label="2.7 · prompting techniques",head=["zero-shot"],body=[
   R([dict(n="→",t="instructions only, no examples")],["instructions"],y=330),
   C(["common, well-specified tasks","capable models"],["common,","capable"],y=480,label="works for"),
   C(["format can vary","edge cases can vary"],["format","edge-case"],y=640,hot=[0],label="weakness")]),
 dict(slug="few-shot",label="2.7 · prompting techniques",head=["few-shot"],body=[
   R([dict(n="01",t="a small set of diverse, canonical examples"),dict(n="02",t="wrapped in example tags"),dict(n="03",t="not every edge case"),dict(n="04",t="varied, so superficial features aren't copied")],["small","wrapped","edge","varied"],y=330,hot=[0])]),
 dict(slug="chain-of-thought",label="2.7 · prompting techniques",head=["chain-of-thought"],body=[
   dict(k="flow",items=[dict(t="reason before answering"),dict(t="in a separate section, or built-in thinking"),dict(t="code shows users only the answer")],cues=["reason","separate","because"],y=380),
   C(["more output tokens","more latency"],["tokens","latency."],y=730,label="the cost")]),
 dict(slug="four-more",label="2.7 · prompting techniques",head=["four more"],body=[
   R([dict(n="01",t="prompt chaining",s="simpler prompts, easier to test"),dict(n="02",t="role prompting",s="domain tone and focus"),dict(n="03",t="prefilling",s="force a format, where supported"),dict(n="04",t="structured outputs",s="schema beats asking in prose and hoping")],["chaining","Role","Prefilling","Structured"],y=330)]),
 dict(slug="choose",label="2.7 · which technique when",head=["which, when"],body=[
   dict(k="table",head=["situation","technique"],w=[760,948],y=340,
        rows=[["code must parse the output","structured outputs, schema + validation"],
              ["inconsistent tone or format","few-shot examples + format spec"],
              ["wrong multi-step answers","thinking or chain-of-thought, higher effort"],
              ["one prompt does too much","prompt chaining"],
              ["hallucinated facts in document Q&A","grounding, quote-then-answer, citations, “I don't know”"],
              ["model ignores a rule","explicit, explain why, move it up, add an example"]],
        cues=["output","tone","Wrong","doing","Hallucinated","ignores"])]),
],
"08":[
 dict(slug="traps",label="2.8 · exam traps",head=["four exam traps"],body=[
   R([dict(n="01",t="the largest model for a prompt, retrieval or caching problem"),dict(n="02",t="moving all traffic up a tier when a subset fails"),dict(n="03",t="a system prompt as a security boundary"),dict(n="04",t="few-shot examples as a document store")],["switching","moving","treating","using"],y=330)]),
 dict(slug="self-check",label="self-check",head=["self-check"],body=[
   R([dict(n="01",t="two ways to improve hard cases without a bigger model"),dict(n="02",t="why dynamic content last?"),dict(n="03",t="structured output or few-shot formatting?"),dict(n="04",t="two techniques against hallucination"),dict(n="05",t="the default starting model strategy")],["Name","Why","When","Give","What"],y=330)]),
 dict(slug="answers",label="self-check · answers",head=["answers"],body=[
   R([dict(n="01",t="raise effort, or route hard cases up"),dict(n="02",t="a static prefix stays identical, so it caches"),dict(n="03",t="when code parses the output"),dict(n="04",t="any two: “I don't know”, quote, citations, grounding"),dict(n="05",t="the most capable model, Opus, tuned with effort")],["one:","Two:","Three:","Four:","Five:"],y=330,hot=[4])]),
],
}
TRACK=["Family","Choosing","Thinking","Prompt","Guardrails","Techniques","Traps"]
