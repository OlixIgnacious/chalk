# Per-scene visual spec for CCAR-P Chapter 7. Copy is short on-screen text, never a narrated sentence;
# each cue is a word from that scene's own captions (display layer): a string, or [string, nth occurrence].
R=lambda items,cues,**kw: dict(k="rows",items=items,cues=cues,**kw)
C=lambda items,cues,**kw: dict(k="chips",items=items,cues=cues,**kw)
F=lambda items,cues,**kw: dict(k="flow",items=[dict(t=t) for t in items],cues=cues,**kw)
N=lambda *ts: [dict(n=f"{i+1:02d}",t=t) for i,t in enumerate(ts)]
def COLS(a,b,cues,hot=None,y=380): return dict(k="cols",items=[dict(l=a[0],t=a[1],s=a[2]),dict(l=b[0],t=b[1],s=b[2])],cues=cues,y=y,**({"hot":hot} if hot else {}))
def TBL(head,w,rows,cues,y=330,hot=None): return dict(k="table",head=head,w=w,y=y,rows=rows,cues=cues,**({"hot":hot} if hot else {}))
MIT=lambda rows,cues: TBL(["failure","mitigations"],[520,1188],rows,cues)
SPEC={
"01":[
 dict(slug="title",label="CCAR-P · Chapter 7",head=["safety, risk","& governance"],big=True,titlecues=["safety,","governance."],body=[]),
 dict(slug="problem",label="the problem",head=["what happens on failure"],body=[
   R(N("a control times out, a service goes down","does the action go ahead, or stop?","safety is a stack of layered controls","each fails in a defined way","fail closed, not open"),["Picture","ahead,","stack","specific","closed,"],hot=[4])]),
 dict(slug="outcomes",label="by the end",head=["you can"],body=[
   R(N("implement guardrails and safety controls","identify risks and failure modes","apply human-in-the-loop validation","address bias, fairness, transparency"),["implement","identify","apply","address"])]),
],
"02":[
 dict(slug="picture",label="7.1 · defence in depth",head=["a request, six layers"],body=[
   F(["a request moves through six layers","each layer catches what the one before misses","defence in depth"],["request","catches","depth."],y=380,hot=[2])]),
 dict(slug="six",label="7.1 · the safety stack",head=["six layers"],body=[
   R(N("input screening","model instructions","tool-call authorization","output screening","human review","monitoring, audit, response"),["Input","Model","Tool-call","output","Human","monitoring,"],cols=2,y=330)]),
 dict(slug="input",label="7.1 · layer one",head=["layer one: input screening"],body=[
   R([dict(n="01",t="before the main model"),dict(n="02",t="a policy classifier on the user's input",s="a lightweight, fast pre-screen, such as Haiku")],["before","harmlessness"],y=360)]),
 dict(slug="more-input",label="7.1 · layer one",head=["more input screening"],body=[
   R(N("PII / PHI detection and redaction","prompt-injection detection on untrusted content","retrieved docs, emails, web pages, tool results","size limits, rate limits, authentication"),["PII","prompt-injection","Retrieved","size"],y=330,hot=[1])]),
],
"03":[
 dict(slug="model-instructions",label="7.1 · layer two",head=["model instructions"],body=[
   R(N("a scoped role and task","refusal, escalation and grounding rules","untrusted text in tags: data, not instructions"),["Scope","refusal","Wrap"],y=360,hot=[2])]),
 dict(slug="baseline",label="7.1 · layer two",head=["a baseline"],body=[
   COLS(("Claude's safety training","a baseline",""),("application controls","still required","not replaced by training"),["safety","substitute"],hot=[1])]),
 dict(slug="tool-auth",label="7.1 · layer three",head=["tool-call authorization"],body=[
   R(N("a least-privilege tool set (Chapter 4)","per-call policy checks, in code","user · action · record · parameters"),["least-privilege","per-call","allowed"],y=360)]),
 dict(slug="more-tools",label="7.1 · layer three",head=["more on tools"],body=[
   R(N("allow-lists: email only to internal domains","amount limits and rate limits","approval for irreversible or high-impact actions","sandboxed code, restricted network egress"),["allow-lists","amount","Require","sandboxed"],y=330)]),
],
"04":[
 dict(slug="output",label="7.1 · layer four",head=["output screening"],body=[
   R(N("schema validation","PII and secret leakage scan; policy classifier","grounding and citation check","block, redact, regenerate or escalate"),["Validate","Scan","grounding","block,"],y=330,hot=[3])]),
 dict(slug="human",label="7.1 · layer five",head=["human review"],body=[
   R(N("layer five: human review","routed by risk: how, in a few minutes"),["layer","risk,"],y=380)]),
 dict(slug="monitoring",label="7.1 · layer six",head=["monitoring and response"],body=[
   C(["logging and alerts","red-teaming","incident response runbooks","kill switch"],["Logging","red-teaming.","Incident","kill"],y=420,hot=[3],fs=50)]),
],
"05":[
 dict(slug="fails",label="7.2 · fail closed vs fail open",head=["what if it fails?"],body=[
   C(["a classifier times out","a policy service is down","a reviewer queue is full"],["classifier","service","queue"],y=420,label="every control can fail",fs=50)]),
 dict(slug="closed-open",label="7.2 · fail closed vs fail open",head=["closed vs open"],body=[
   COLS(("fail closed","the action doesn't proceed","block, hold, or route to a human"),("fail open","the action proceeds unchecked",""),["closed","open"],hot=[1])]),
 dict(slug="which",label="7.2 · which is right",head=["which is right?"],body=[
   TBL(["context","right behaviour"],[820,888],[["money, accounts, deletion, clinical or legal advice","fail closed: hold, route to a human"],["sending external communications","fail closed: hold as a draft"],["low-risk internal UX","degrade gracefully; never skip authorization"]],["Money","external","UX,"])]),
 dict(slug="key",label="7.2 · the key idea",head=["the exam answer"],body=[
   dict(k="quote",t="for regulated or high-impact paths: fail closed",cue="regulated",y=350),
   R([dict(n="→",t="“log the failure and continue” is fail open")],["continue?"],y=640,hot=[0])]),
],
"06":[
 dict(slug="thirteen",label="7.3 · risks and failure modes",head=["thirteen failure modes"],body=[
   C(["hallucination","direct injection","indirect injection","data leakage","excessive agency","runaway loops","over-refusal","inconsistency","bias","knowledge limits","compounding errors","sycophancy","supply chain"],["Now,","failure","modes","LLM","systems.","There","thirteen","them,","each","own","mitigations.","take","groups."],y=400,fs=42)]),
 dict(slug="hallucination",label="7.3 · hallucination",head=["hallucination"],body=[
   COLS(("what it is","plausible but false content","including invented citations"),("mitigations","grounding, quote-then-answer","retrieval quality, citations with verification, permission to say “I don't know”"),["Plausible","mitigations:"],hot=[1])]),
 dict(slug="direct",label="7.3 · direct injection",head=["direct injection"],body=[
   COLS(("what it is","the user tries to override instructions or policies",""),("mitigations","input and output screening, a robust prompt","and tool authorization, in code"),["override","mitigations:"],hot=[1])]),
 dict(slug="indirect",label="7.3 · indirect injection",head=["indirect injection"],body=[
   COLS(("what it is","instructions hidden in documents, web pages, emails, tool results",""),("mitigation","treat retrieved and tool content as untrusted","never let it grant permissions; restrict tools; screen content"),["hidden","mitigation:"],hot=[1])]),
 dict(slug="leak-agency",label="7.3 · leakage and agency",head=["leakage and agency"],body=[
   MIT([["data leakage","per-user retrieval filters, no secrets in context, output scanning, tenant isolation"],["excessive agency","least privilege, approval gates, step and budget limits"]],["leakage.","agency."])]),
 dict(slug="runaway",label="7.3 · runaway loops",head=["runaway loops and cost"],body=[
   COLS(("what it is","the agent repeats calls","and burns through the budget"),("mitigations","max iterations, token budgets","timeouts and loop detection"),["repeats","mitigations:"],hot=[1])]),
],
"07":[
 dict(slug="refusal-consistency",label="7.3 · the second group",head=["refusal and consistency"],body=[
   MIT([["over-refusal","tune policies; measure over-refusal in evals"],["inconsistency","structured outputs, examples, lower-variance settings, consistency evals"]],["over-refusal.","inconsistency."])]),
 dict(slug="bias-knowledge",label="7.3 · the second group",head=["bias and knowledge"],body=[
   MIT([["bias","slice-based evals, fairness review, human oversight"],["knowledge limits","retrieval, tools for current data, state uncertainty"]],["bias.","knowledge"])]),
 dict(slug="compounding-syco",label="7.3 · the second group",head=["compounding and sycophancy"],body=[
   MIT([["compounding errors","validation gates, checkpoints, verification steps"],["sycophancy","instruct Claude to correct errors; false-premise evals"]],["compounding","sycophancy."])]),
 dict(slug="supply",label="7.3 · supply-chain risk",head=["supply-chain risk"],body=[
   COLS(("the risk","malicious MCP servers or skills",""),("mitigations","trusted sources only","review, pin, sandbox"),["Malicious","trusted"],hot=[1])]),
],
"08":[
 dict(slug="when",label="7.4 · human-in-the-loop validation",head=["when to use humans"],body=[
   C(["confidence","reversibility","cost or impact"],["Confidence,","reversibility,","impact."],y=360,label="three routing factors",fs=54),
   R([dict(n="→",t="review is expensive and slow: apply it where risk justifies")],["expensive"],y=640)]),
 dict(slug="routing",label="7.4 · the routing table",head=["the routing table"],body=[
   TBL(["confidence · reversible · impact","route"],[900,808],[["high · yes · low","automate; sample-audit"],["low · yes · low","clarify, or queue for review"],["any · no · high","human approval first"],["any · any · legal effect on a person","human decides; Claude assists"]],["High","Low","Irreversible,","legal"])]),
 dict(slug="gate-queue",label="7.4 · an example",head=["gate and queue"],body=[
   COLS(("approval gate","the agent proposes, a human approves","e.g. refunds above $500"),("review queue","low-confidence outputs wait","for a reviewer"),["approval","Second,"])]),
 dict(slug="shadow-audit-esc",label="7.4 · patterns",head=["shadow, audit, escalation"],body=[
   R([dict(n="03",t="shadow mode",s="decisions recorded, humans still decide: build trust, calibrate thresholds"),dict(n="04",t="sampling audit",s="a fixed percentage reviewed after the fact"),dict(n="05",t="escalation",s="hand over with summary and context: legal threats, distress, VIP customer")],["shadow","Fourth,","escalation."],y=330)]),
 dict(slug="making",label="7.4 · making it work",head=["making it work"],body=[
   R(N("give reviewers the evidence, not a rubber stamp","measure reviewer agreement and time","track automation bias","feed corrections back into evals"),["evidence:","Measure","automation-bias","feed"],y=330)]),
 dict(slug="signals",label="7.4 · confidence signals",head=["confidence signals"],body=[
   C(["classifier scores","calibrated self-report","agreement across samples","retrieval scores","rule-based triggers"],["Classifier","Self-reported","Agreement","Retrieval","rule-based"],y=360,label="where confidence comes from",fs=44),
   R([dict(n="→",t="uncalibrated self-report alone is weak evidence")],["uncalibrated,"],y=640,hot=[0])]),
],
"09":[
 dict(slug="bias",label="7.5 · ethical AI",head=["bias and fairness"],body=[
   R(N("evaluation slices by relevant groups","humans stay accountable for people decisions","document the model's role","watch retrieved content and prompt examples"),["slices","accountable","document","biased"],y=330)]),
 dict(slug="transparency",label="7.5 · ethical AI",head=["transparency"],body=[
   R(N("tell users they're talking to AI","show sources and reasoning","document use, limits, failure modes","explain how to contest an outcome"),["Tell","Show","Document","explain"],y=330)]),
 dict(slug="accountability",label="7.5 · ethical AI",head=["accountability"],body=[
   R(N("name an owner for the system and each control","keep audit trails of decisions, prompts, versions","a governance forum for high-risk use cases"),["Name","audit","governance"],y=360)]),
],
"10":[
 dict(slug="tiering-change",label="7.6 · governance operating model",head=["five parts"],body=[
   R([dict(n="01",t="use-case risk tiering",s="low, medium, high risk: controls in proportion"),dict(n="02",t="change management",s="prompt, model and tool changes pass the eval gate and are recorded")],["tiering.","Second,"],y=360)]),
 dict(slug="rest",label="7.6 · governance operating model",head=["the other three"],body=[
   R([dict(n="03",t="red-teaming",s="scheduled adversarial testing, before launch and after major changes"),dict(n="04",t="incident response",s="reported, triaged, contained (kill switch), fixed, turned into eval cases"),dict(n="05",t="policy alignment",s="must also comply with Anthropic's Usage Policy")],["Third,","Fourth,","fifth,"],y=330)]),
],
"11":[
 dict(slug="traps",label="7.7 · exam traps",head=["five exam traps"],body=[
   R(N("a line in the system prompt as the fix","screening only the user message","HITL on everything, or on nothing","fail-open classifier timeouts, high impact","monitoring where prevention is possible"),["First:","Second:","Third:","Fourth:","fifth:"],y=330)]),
 dict(slug="self-check",label="self-check",head=["self-check"],body=[
   R(N("the six layers, in order","forwarding email agent: risk and control?","three factors that route to a human","what is shadow mode for?","two transparency measures"),[["Question",0],["Question",1],["Question",2],["Question",3],["Question",4]],y=330)]),
 dict(slug="answers",label="self-check · answers",head=["answers"],body=[
   R(N("input to audit: six layers in order","indirect injection: restrict forwarding, in code","confidence, reversibility, cost or impact","compare with humans, calibrate before automating","disclose AI use; show sources; offer a human"),["one:","Two:","Three:","Four:","Five:"],y=330,hot=[1])]),
],
}
TRACK=["Layers","Fail closed","Risks","HITL","Ethics","Governance","Traps"]
TRACKMAP={"02":0,"03":0,"04":0,"05":1,"06":2,"07":2,"08":3,"09":4,"10":5,"11":6}
