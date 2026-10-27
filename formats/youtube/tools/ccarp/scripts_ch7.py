# Writes segments/NN/script.md for CCAR-P Chapter 7 (spoken layer with pause markers; display layer derived via lexicon).
# usage: CCARP_DIR=<dir>/ python3 scripts_ch7.py
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
   ("Let's talk about safety, risk, and governance.",["h001"])]),
 ("the problem","definition card",None,[
   ("Picture this. {beat} Something goes wrong in your Claude system. A classifier times out, or a policy service goes down. Does the action go ahead, or does it stop?",["p013"]),
   ("That's the heart of this chapter. {pause} Safety in a Claude system is a stack of layered controls. Each one sits at a specific point, with a defined behaviour for when it fails.",["p002"]),
   ("The goal, as the official prep course frames it, is a system that fails closed, rather than open. {beat} And prompt instructions are one layer. Never the whole stack.",["p002"])]),
 ("what you'll be able to do","decomposition",None,[
   ("So here's where we're headed. {beat} You'll implement guardrails and safety controls.",["p003"]),
   ("You'll identify the risks, limitations, and failure modes of L L M systems. {beat} You'll apply human-in-the-loop validation.",["p003"]),
   ("And you'll address the ethical side: bias, fairness, and transparency.",["p003"]),
   ("Compliance gets its own chapter, Chapter eight. {pause} For now, let's start with the safety stack.",["p003"])]),
]
S["02"]=[
 ("a picture","staged flow",None,[
   ("Let's start with a picture. {pause} Think of a request moving through six layers. {beat} Each layer catches what the one before misses.",["p005"]),
   ("That idea has a name: defence in depth.",["p005"])]),
 ("six layers","decomposition",None,[
   ("Here are the six layers, in order. {beat} Input screening. Model instructions. Tool-call authorization.",["p006","p007","p008"]),
   ("Then output screening. Human review. And monitoring, audit, and response.",["p009","p010","p011"])]),
 ("input screening","staged flow",None,[
   ("Now, layer one is input screening, before the main model. {pause} First, a harmlessness or policy classifier on the user's input.",["p006"]),
   ("Anthropic's guardrail docs suggest a lightweight, fast model, such as Haiku, as a pre-screen.",["p006"])]),
 ("more input screening","staged flow",None,[
   ("Next, P I I and P H I detection and redaction, where the data isn't needed.",["p006"]),
   ("Then prompt-injection detection. {beat} And here's the catch: it applies to untrusted content, not just the user message. Retrieved documents, emails, web pages, and tool results.",["p006"]),
   ("And finally, the basics: size limits, rate limits, and authentication.",["p006"])]),
]
S["03"]=[
 ("model instructions","worked example","chapter",[
   ("Now, layer two: model-level instructions. {pause} Scope the role and the task. Add explicit refusal and escalation rules, and grounding rules.",["p007"]),
   ("And separate trusted instructions from untrusted data. {beat} Let's look at it through an example. Wrap untrusted text in tags, and tell Claude it's data, not instructions.",["p007"])]),
 ("a baseline","definition card",None,[
   ("One more point about this layer. {pause} Claude's own safety training is a baseline. {beat} It's not a substitute for application controls.",["p007"])]),
 ("tool-call authorization","staged flow",None,[
   ("Now, layer three: tool-call authorization. {pause} Start with a least-privilege tool set. That's Chapter four.",["p008"]),
   ("Then per-call policy checks, in code. {beat} Is this user allowed this action, on this record, with these parameters?",["p008"])]),
 ("more on tools","staged flow",None,[
   ("Next, allow-lists for destinations. {beat} For example, email only to internal domains. Plus amount limits, and rate limits.",["p008"]),
   ("Require confirmation, or human approval, for irreversible or high-impact actions.",["p008"]),
   ("And use sandboxed execution for code and file operations, with network egress restrictions.",["p008"])]),
]
S["04"]=[
 ("output screening","staged flow",None,[
   ("Now, layer four: output screening, before the user or a downstream system sees anything. {pause} Validate the schema, for structured outputs.",["p009"]),
   ("Scan for P I I and secret leakage, and run a policy classifier on the output. {beat} Check grounding and citations, for factual answers.",["p009"]),
   ("And if anything fails: block, redact, regenerate, or escalate.",["p009"])]),
 ("human review","definition card",None,[
   ("Next, layer five: human review. {beat} It's routed by risk, and we'll cover how in a few minutes.",["p010"])]),
 ("monitoring","staged flow",None,[
   ("And layer six: monitoring, audit, and response. {pause} Logging and alerts. Periodic red-teaming. Incident response runbooks.",["p011"]),
   ("And the ability to disable a feature quickly. {beat} That's a kill switch.",["p011"])]),
]
S["05"]=[
 ("what happens when it fails","definition card",None,[
   ("Now, a question every control has to answer. {pause} What happens when it fails?",["p013"]),
   ("Because every control can fail. {beat} A classifier times out, a policy service is down, or a reviewer queue is full.",["p013"])]),
 ("closed and open","split panel",None,[
   ("So, fail closed means: when the control can't decide, the action doesn't proceed. {beat} You block it, hold it, or route it to a human.",["p013"]),
   ("Fail open means: when the control can't decide, the action proceeds unchecked.",["p013"])]),
 ("which is right","comparison table",None,[
   ("So which is right? {beat} It depends on the context.",["p014"]),
   ("Money movement, account changes, data deletion, clinical or legal advice? {beat} Fail closed. Hold, and route to a human.",["p014"]),
   ("Sending external communications? Fail closed. Hold it as a draft.",["p014"]),
   ("And low-risk internal U X, like suggested tags? {beat} Degrade gracefully, and show a safe default. But authorization is never skipped.",["p014"])]),
 ("the key idea","definition card",None,[
   ("Here's the key idea. {pause} For regulated or high-impact paths, the exam answer is fail closed.",["p015"]),
   ("And log the failure and continue? {beat} That's fail open.",["p015"])]),
]
S["06"]=[
 ("thirteen failure modes","decomposition",None,[
   ("Now, the failure modes of L L M systems. {pause} There are thirteen of them, and each has its own mitigations.",["p017"]),
   ("Let's take them in two groups.",["p017"])]),
 ("hallucination","comparison table",None,[
   ("First, hallucination. {beat} What is it? Plausible but false content, including invented citations.",["p017"]),
   ("The mitigations: grounding, retrieval quality, and quote-then-answer. Add citations with verification, and permission to say I don't know.",["p017"])]),
 ("direct injection","comparison table",None,[
   ("Second, direct prompt injection, or jailbreak. {pause} What is it? The user tries to override your instructions or policies.",["p017"]),
   ("The mitigations: input screening, a robust system prompt, and output screening. {beat} And tool authorization, in code.",["p017"])]),
 ("indirect injection","comparison table",None,[
   ("Third, indirect prompt injection. {pause} This one is sneakier. {beat} Malicious instructions hidden in documents, web pages, emails, or tool results.",["p017"]),
   ("The mitigation: treat all retrieved and tool content as untrusted. {beat} Never let it grant permissions. Restrict tools, and screen the content.",["p017"])]),
 ("leakage and agency","comparison table",None,[
   ("Now, fourth, data leakage. {pause} The system prompt, other users' data, secrets, or P I I get exposed.",["p017"]),
   ("Use per-user retrieval filters, keep secrets out of context, scan outputs, and isolate tenants.",["p017"]),
   ("Fifth, excessive agency. {beat} The agent takes actions beyond intent. The mitigations: least privilege, approval gates, and step and budget limits.",["p017"])]),
 ("runaway loops","comparison table",None,[
   ("Now, sixth, runaway loops and cost. {pause} The agent repeats calls, and burns through the budget.",["p017"]),
   ("The mitigations: max iterations, token budgets, timeouts, and loop detection.",["p017"])]),
]
S["07"]=[
 ("refusal and consistency","comparison table",None,[
   ("Now, the second group. {pause} Seventh, over-refusal. Legitimate requests get blocked.",["p017"]),
   ("Tune your policies, and measure over-refusal in your evals.",["p017"]),
   ("Eighth, inconsistency. {beat} Different answers to the same input. Use structured outputs, examples, lower-variance settings, and consistency evals.",["p017"])]),
 ("bias and knowledge","comparison table",None,[
   ("Now, ninth, bias. {pause} Unequal quality or outcomes across groups. The mitigations: slice-based evals, fairness review, and human oversight.",["p017"]),
   ("Tenth, knowledge limits. {beat} There's a training cutoff, and unknown internal facts. Use retrieval, and tools for current data. And state uncertainty.",["p017"])]),
 ("compounding and sycophancy","comparison table",None,[
   ("Now, eleventh, compounding errors. {pause} Early mistakes propagate in multi-step agents. Add validation gates, checkpoints, and verification steps.",["p017"]),
   ("Twelfth, sycophancy. {beat} Agreeing with the user's incorrect premise. Instruct Claude to correct errors, and add false-premise cases to your evals.",["p017"])]),
 ("supply chain","comparison table",None,[
   ("And thirteenth, supply-chain risk. {pause} Malicious M C P servers, or skills.",["p017"]),
   ("Use trusted sources only. Review, pin, and sandbox.",["p017"])]),
]
S["08"]=[
 ("when to use humans","definition card",None,[
   ("Now, human-in-the-loop validation, or H I T L. {pause} Human review is expensive and slow. {beat} So apply it where risk justifies it.",["p019"]),
   ("The prep course names three routing factors. Confidence, reversibility, and cost or impact.",["p019"])]),
 ("the routing table","comparison table",None,[
   ("Let's see how those combine. {pause} High confidence, reversible, low impact? {beat} Automate, and sample-audit a percentage.",["p020"]),
   ("Low confidence, reversible, low impact? Ask the user to clarify, or queue it for review.",["p020"]),
   ("Irreversible, and high impact, whatever the confidence? Human approval, before execution.",["p020"]),
   ("And a decision with a legal or significant effect on a person? {beat} A human decides. Claude assists, and explains.",["p020"])]),
 ("gate and queue","worked example","chapter",[
   ("Now, five H I T L patterns. {pause} First, the approval gate. {beat} The agent proposes, and a human approves before execution.",["p021"]),
   ("Let's look at it through an example: refunds above five hundred dollars.",["p021"]),
   ("Second, a review queue. Low-confidence outputs wait for a reviewer.",["p021"])]),
 ("shadow, audit, escalation","staged flow",None,[
   ("Third, shadow mode. {pause} The model's decisions are recorded, but humans still decide. You compare, to build trust and calibrate thresholds, before automating.",["p021"]),
   ("Fourth, a sampling audit. {beat} A fixed percentage of automated decisions is reviewed after the fact.",["p021"]),
   ("And fifth, escalation. The model hands over the conversation, with a summary and context, when rules trigger. Think legal threats, distress, or a V I P customer.",["p021"])]),
 ("making it work","staged flow",None,[
   ("So how do you make H I T L actually work? {pause} Give reviewers the evidence: sources, reasoning, and confidence. {beat} So they aren't rubber-stamping.",["p022"]),
   ("Measure reviewer agreement and time. Track automation-bias risk, which is humans over-trusting the model. And feed reviewer corrections back into your evals.",["p022"])]),
 ("confidence signals","staged flow",None,[
   ("And where does confidence come from? {pause} Classifier scores. Self-reported confidence, with calibration. Agreement across multiple samples. Retrieval scores. Or rule-based triggers.",["p023"]),
   ("But uncalibrated, self-reported confidence alone is weak evidence.",["p023"])]),
]
S["09"]=[
 ("bias and fairness","staged flow",None,[
   ("Now, ethical AI. {pause} Start with bias and fairness.",["p025"]),
   ("Build evaluation slices by relevant group, like language or region. Add demographic proxies, where lawful. Then compare quality and outcomes.",["p025"]),
   ("In decisions about people, like credit or hiring, keep humans accountable for the decision. {beat} That includes insurance and healthcare. And document the model's role.",["p025"]),
   ("And watch for biased retrieved content, and biased examples in prompts.",["p025"])]),
 ("transparency","staged flow",None,[
   ("Next, transparency. {pause} Tell users when they're interacting with AI.",["p026"]),
   ("Show sources and reasoning, where decisions matter.",["p026"]),
   ("Document intended use, limitations, and known failure modes. That's a model or system card for your application. {beat} And explain to affected people how to contest an automated outcome.",["p026"])]),
 ("accountability","staged flow",None,[
   ("And accountability. {pause} Name an owner for the system, and for each control.",["p027"]),
   ("Keep audit trails of decisions, prompts, and versions.",["p027"]),
   ("And set up a governance forum, or review board, for high-risk use cases.",["p027"])]),
]
S["10"]=[
 ("tiering and change","staged flow",None,[
   ("Now, the governance operating model. {pause} There are five parts.",["p029"]),
   ("First, use-case risk tiering. {beat} Classify each use case as low, medium, or high risk. Then apply controls proportionally.",["p029"]),
   ("Second, change management. {beat} Prompt, model, and tool changes pass the eval gate, and are recorded.",["p029"])]),
 ("red-teaming, incidents, policy","staged flow",None,[
   ("Third, red-teaming. {pause} Scheduled adversarial testing, especially before launch and after major changes.",["p029"]),
   ("Fourth, incident response. {beat} How harmful outputs are reported and triaged. Contained, with a kill switch. Then fixed, and turned into eval cases.",["p029"]),
   ("And fifth, policy alignment. Your applications must also comply with Anthropic's Usage Policy.",["p029"])]),
]
S["11"]=[
 ("five exam traps","decomposition",None,[
   ("Before you go, watch for five exam traps. {pause} First: add a line to the system prompt, as the answer to a security risk.",["p031"]),
   ("Second: screening only the user message, and ignoring retrieved and tool content. That's indirect injection.",["p031"]),
   ("Third: H I T L on everything, which destroys value. Or on nothing, which is unmanaged risk.",["p031"]),
   ("Fourth: fail-open handling of classifier timeouts, on high-impact paths.",["p031"]),
   ("And fifth: monitoring, which is detective, offered where prevention is possible.",["p031"])]),
 ("the self-check","staged flow",None,[
   ("Now, let's check yourself. {pause} Take your time with these. {beat} Question one: name the six layers of the safety stack, in order. {think}",["p033"]),
   ("Question two: an agent reads customer emails, and can forward messages. What's the biggest risk, and the strongest control? {think}",["p033"]),
   ("Question three: what three factors route decisions to a human reviewer? {think}",["p033"]),
   ("Question four: what is shadow mode used for? {think}",["p033"]),
   ("And question five: give two transparency measures for a customer-facing assistant. {think} Ready? {beat} Here's how you did.",["p033"])]),
 ("the answers","definition card",None,[
   ("So, one: input screening, model instructions, and tool-call authorization. {beat} Then output screening, human review, and monitoring and audit.",["p034"]),
   ("Two: indirect prompt injection, causing exfiltration. {beat} The strongest control is restricting forwarding, enforced in code. Allow-list internal recipients, or remove the capability. And treat email content as untrusted.",["p034"]),
   ("Three: confidence, reversibility, and cost or impact.",["p034"]),
   ("Four: comparing model decisions with human decisions, without acting on them. {beat} It builds evidence, and calibrates thresholds, before you automate.",["p034"]),
   ("Five: disclose AI use, and show sources or citations. {beat} Explain limitations, and offer a path to a human.",["p034"]),
   ("That's chapter seven. {beat} Layer your controls, make them fail closed, and keep a human where the risk justifies it. {pause} See you in the next one.",["p002","p015","p019"])]),
]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"writer_tail.py")).read())
