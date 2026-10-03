# Writes segments/NN/script.md for CCAR-P Chapter 2 v3 (spoken layer with pause markers; display layer without).
import json, math, os, re, shutil
V1=os.environ.get("CCARP_V1","")  # earlier build dir holding chapter.json, lexicon.json, titles.json and source/ccarp-ch2.md
O=os.environ["CCARP_DIR"]
os.makedirs(O+"source",exist_ok=True)
for f in ("chapter.json","lexicon.json","titles.json"): shutil.copy(V1+f,O+f)
shutil.copy(V1+"source/ccarp-ch2.md",O+"source/ccarp-ch2.md")
def strip(s):
    s=re.sub(r"\{(beat|pause|think)\}"," ",s); s=re.sub(r"\s+"," ",s); return re.sub(r"\s+([.,;:!?])",r"\1",s).strip()
GAP={"beat":0.55,"pause":1.0,"think":2.5}
S={}
S["01"]=[
 ("the title","definition card",None,[
   ("Let's talk about Claude models, and prompting.",None,["h001"])]),
 ("the problem","definition card",None,[
   ("Picture this. {beat} You've got a job for Claude. Which model do you pick?",None,["p002"]),
   ("It's a trade-off between capability, speed, and cost. {beat} A bigger model is more capable, but it's slower, and it costs more.",None,["p002","p005"]),
   ("And here's the surprise. {pause} Often the better lever isn't a different model at all. It's the effort level, inside the model you've already got.",None,["p002"]),
   ("Then, once that's settled, there's the second half of the job: asking it well. {beat} Clear, structured instructions, and the right examples.",None,["p002"])]),
 ("what you'll be able to do","decomposition",None,[
   ("So here's where we're headed. {beat} By the end, you'll be able to pick a model on trade-offs.",None,["p003"]),
   ("You'll design the prompts, the templates and the guardrails around it. {beat} And you'll know zero-shot, few-shot and chain-of-thought, and when each one fits.",None,["p003"])]),
]
S["02"]=[
 ("the tiers","definition card",None,[
   ("Let's start with the models themselves. {pause} Claude comes in several tiers.",None,["p005"]),
   ("Higher tiers are more capable. {beat} But they're slower, and they cost more.",None,["p005"]),
   ("Those are the trade-offs you'll keep weighing for the rest of this chapter. {pause} One caution before the numbers. The figures come from Anthropic's models overview, as of the date on the material, so treat them as of that date.",None,["p005"])]),
 ("the four models","comparison table",None,[
   ("So let's meet the four. {beat} First, Fable five point one. It's the premium one, for demanding reasoning and long-horizon agentic work. It costs ten dollars in and fifty dollars out, per million tokens.","So let's meet the four. First, Fable 5.1. It's the premium one, for demanding reasoning and long-horizon agentic work. It costs $10 in and $50 out, per million tokens.",["p006"]),
   ("Next, Opus five point five. This is the one the material recommends as your default. Four dollars in, twenty dollars out.","Next, Opus 5.5. This is the one the material recommends as your default. $4 in, $20 out.",["p006"]),
   ("Then Sonnet five. It balances speed and intelligence, at two dollars in and ten dollars out.","Then Sonnet 5. It balances speed and intelligence, at $2 in and $10 out.",["p006"]),
   ("And finally Haiku four point five. It's the fastest and the cheapest, at one dollar in and five dollars out. The trade-off is a smaller context window: two hundred thousand tokens.","And finally Haiku 4.5. It's the fastest and the cheapest, at $1 in and $5 out. The trade-off is a smaller context window: 200K tokens.",["p006"])]),
 ("retirement dates","staged flow",None,[
   ("Before you commit to one of them, here's a practical point. {beat} Every model page lists a retirement date.",None,["p007"]),
   ("So plan for it. {beat} Pin your versions in production, and schedule regression evals before you migrate.",None,["p007"])]),
 ("platforms","decomposition",None,[
   ("Next: where do you actually run these models? {beat} On the Claude API, on Amazon Bedrock, on Google Cloud Vertex AI, and on other platforms.",None,["p008"]),
   ("Which one you pick usually comes down to data residency, your existing cloud agreements, compliance boundaries, and procurement. {beat} We'll come back to compliance in Chapter eight.","Which one you pick usually comes down to data residency, your existing cloud agreements, compliance boundaries, and procurement. We'll come back to compliance in Chapter 8.",["p008"])]),
]
S["03"]=[
 ("three criteria and a fourth lever","definition card",None,[
   ("So how do you choose? {beat} Anthropic's guide starts with three criteria: capabilities, speed, and cost.",None,["p010"]),
   ("Then it adds a fourth lever. {beat} Effort. {pause} We'll get to that in a moment.",None,["p010"])]),
 ("capability-first","staged flow",None,[
   ("Let's start with the two ways to begin. {pause} The first is capability-first, and it's the current default.",None,["p011"]),
   ("Here's how it goes. {beat} You begin with Opus, you optimise your prompts, and then you evaluate.",None,["p011"]),
   ("Say the evals still fall short, even at the highest effort, on demanding reasoning or long-horizon agentic work. {beat} That's your cue to move up to Fable.",None,["p011"]),
   ("And later, once things are working, you can test whether cheaper tiers are good enough for some of your traffic.",None,["p011"])]),
 ("efficiency-first","staged flow",None,[
   ("Now, the other way round. {pause} Efficiency-first starts at the cheap end.",None,["p012"]),
   ("You begin with a fast, cheap model, and you test it thoroughly. {beat} Then you move up only where you find a specific gap.",None,["p012"]),
   ("It's the better fit for prototyping, for tight latency requirements, and for cost-sensitive, high-volume simple tasks.",None,["p012"])]),
 ("the effort parameter","plot / number line",None,[
   ("Now, the lever I promised: effort. {beat} What does it actually do?",None,["p013"]),
   ("Think of it as a dial inside one model. {beat} It trades intelligence for speed and cost.",None,["p013"]),
   ("Turn it up, and the model thinks more, so you get better answers on hard problems. But that costs more tokens, and more time. {beat} Turn it down, and you get speed and savings.",None,["p013"]),
   ("The defaults differ. {beat} On Fable five point one, you start at high. On Opus five point five, you start at medium.","The defaults differ. On Fable 5.1, you start at high. On Opus 5.5, you start at medium.",["p013"]),
   ("Either way, adjust it up or down based on your evals.",None,["p013"])]),
 ("a worked example","worked example","chapter",[
   ("Let's look at it through an example. {pause} Say you've built a document-analysis app, and it runs on Opus.",None,["p014"]),
   ("Here's what you find when you run your evals. {beat} It passes on ninety percent of documents. But it fails on complex multi-party contracts.","Here's what you find when you run your evals. It passes on 90% of documents. But it fails on complex multi-party contracts.",["p014"]),
   ("So what's the cheapest correct fix? {beat} Usually, you raise the effort, just for that kind of document.",None,["p014"]),
   ("Or you route only the complex contracts to higher effort, or up to Fable. {beat} Either way, you're fixing the part that's failing.",None,["p014"]),
   ("Now compare that with the tempting option: moving all your traffic to Fable. {beat} That multiplies your cost two and a half times. And for what? A problem that touches ten percent of requests.","Now compare that with the tempting option: moving all your traffic to Fable. That multiplies your cost 2.5×. And for what? A problem that touches 10% of requests.",["p014"]),
   ("That's the whole idea. {pause} Fix the part that's failing, not the whole system.",None,["p014"])]),
 ("other levers","decomposition",None,[
   ("Before we leave model choice, there are a few more levers worth knowing. {pause} First, routing by difficulty, from Chapter one. {beat} Easy traffic gets cheap answers, and hard traffic gets top quality.","Before we leave model choice, there are a few more levers worth knowing. First, routing by difficulty, from Chapter 1. Easy traffic gets cheap answers, and hard traffic gets top quality.",["p015","p016"]),
   ("Second: is anyone waiting on the answer? {beat} If not, batch it. Batch processing costs roughly half as much, which suits jobs like nightly classification, bulk extraction, and offline eval runs.",None,["p016"]),
   ("Third, fast mode. It's a research preview on some Opus models, and it's quicker, at premium pricing.",None,["p016"]),
   ("And last, mind the context window. {beat} Very long documents may need the one million token models, while Haiku four point five has two hundred thousand.","And last, mind the context window. Very long documents may need the 1M token models, while Haiku 4.5 has 200K.",["p016"])]),
]
S["04"]=[
 ("what thinking does","definition card",None,[
   ("Let's talk about thinking. {pause} What is it? {beat} It lets Claude reason step by step before it answers.",None,["p018"]),
   ("That helps you with math, analysis, multi-step logic, and complex coding.",None,["p018"])]),
 ("adaptive and extended","split panel",None,[
   ("Now, there are two kinds. {pause} The current top models use adaptive thinking. {beat} The model decides for itself how much to think, and you steer it with the effort setting.",None,["p018"]),
   ("Haiku four point five works differently. It uses extended thinking, and there you set an explicit budget.","Haiku 4.5 works differently. It uses extended thinking, and there you set an explicit budget.",["p018"])]),
 ("the trade-off","linked arrows",None,[
   ("So is more thinking always better? {beat} No. It's a trade-off. You get better accuracy on hard tasks, but you pay in latency and output tokens.",None,["p019"]),
   ("That's why, for simple, high-volume work like classification or extraction, you keep thinking minimal and use a smaller model.",None,["p019"]),
   ("And there's one catch. {beat} Some configurations constrain thinking. If you force tool use, or turn thinking off, some models behave differently. So test your exact setup.",None,["p019"])]),
]
S["05"]=[
 ("six parts","decomposition",None,[
   ("Now that you've picked a model, let's look at the prompt itself. {pause} A strong system prompt has six parts.",None,["p021","p022"]),
   ("It sets the role, the task, the rules, and the output contract. {beat} Role and context first, then the task. Then the rules, and the output you want back.",None,["p021","p022"]),
   ("Examples are optional. {beat} And the dynamic content, the stuff that changes on every request, goes last.",None,["p022"])]),
 ("role and context","worked example","chapter",[
   ("Let's zoom in on the first part, role and context. {beat} You say who Claude is, and who it's serving.",None,["p022"]),
   ("Here's the chapter's example. {beat} You are a support assistant for Acme's billing team, and your users are small-business owners.",None,["p022"])]),
 ("static first, dynamic last","staged flow",None,[
   ("Now, why does the dynamic part go last? {pause} Because you keep your static parts first, and your changing parts at the end.",None,["p022"]),
   ("Retrieved documents, user data, and the question all go at the end. {beat} And keeping the front identical is what makes prompt caching work. We'll get to that in Chapter three.","Retrieved documents, user data, and the question all go at the end. And keeping the front identical is what makes prompt caching work. We'll get to that in Chapter 3.",["p022"])]),
 ("clear and direct","definition card",None,[
   ("Next: how should you write it? {beat} Be clear and direct. State the goal, the audience, and what good looks like.",None,["p023"]),
   ("And explain why a rule exists. {beat} The model generalises better from reasons than from bare commands.",None,["p023"])]),
 ("XML tags","decomposition",None,[
   ("Next, a tip on structure. {beat} Use X M L tags to keep the parts apart. Instructions, policy, documents, and more: each gets its own tag.","Next, a tip on structure. Use XML tags to keep the parts apart. Instructions, policy, documents, and more: each gets its own tag.",["p024"]),
   ("Why bother? {beat} Tags stop the model confusing your instructions with your data. They make prompts easier to maintain. And they let you ask for tagged output that your code can parse.",None,["p024"])]),
 ("long documents","staged flow",None,[
   ("A quick note on long documents. {pause} Put the document near the top, and your question after it.",None,["p025"]),
   ("Then ask Claude to quote the relevant passages first. {beat} That gives you better grounding.",None,["p025"])]),
 ("templates","linked arrows",None,[
   ("Now, templates. {pause} A template is a fixed scaffold with variables, like the policy, the retrieved docs, and the user's question.",None,["p027"]),
   ("Why use one? {beat} First, it keeps your stable instructions apart from the per-request data. The stable ones get versioned, reviewed, and cached.",None,["p028"]),
   ("Second, it makes testing easy. The same template runs against your eval set whenever it changes.",None,["p028"]),
   ("Third, it lowers prompt-injection risk. {beat} Untrusted input always goes inside clearly labelled data tags, never glued into your instructions.",None,["p028"]),
   ("So treat templates as code. {beat} Version them, review them, and ship them with their eval results.",None,["p029"])]),
]
S["06"]=[
 ("not a security control","definition card",None,[
   ("Let's talk about guardrails. {pause} Prompt guardrails shape behaviour. {beat} But on their own, they're not security controls, so don't lean on them for that. We'll cover security properly in Chapter seven.","Let's talk about guardrails. Prompt guardrails shape behaviour. But on their own, they're not security controls, so don't lean on them for that. We'll cover security properly in Chapter 7.",["p031"])]),
 ("seven guardrails","decomposition",None,[
   ("So what's useful? {beat} First, give Claude permission to say I don't know. That cuts hallucination when information is missing.",None,["p032"]),
   ("Second, add a grounding rule: answer only from the documents you provide, and if the answer isn't there, say so.",None,["p032"]),
   ("Third, have it quote first, and then answer using only those quotes. {beat} Fourth, ask for citations, so you can check every claim.",None,["p032"]),
   ("Fifth, set scope limits, and give it a standard reply for off-topic requests.",None,["p032"]),
   ("Sixth, write escalation rules for what you want a human to handle: legal threats, self-harm, or refunds above a threshold. {beat} Picture the billing assistant from earlier. A refund above the threshold goes to a person.",None,["p032","p022"]),
   ("And last, consistency aids: a fixed output format, examples, and structured outputs.",None,["p032"])]),
]
S["07"]=[
 ("zero-shot","definition card",None,[
   ("Let's start simple. {beat} Zero-shot means instructions only, no examples.",None,["p034"]),
   ("You can use it for common, well-specified tasks on capable models. {beat} The weakness? Format and edge-case behaviour can vary.",None,["p034"])]),
 ("few-shot","definition card",None,[
   ("Next up, few-shot. {pause} Few-shot means you add examples of input and ideal output.",None,["p035"]),
   ("Anthropic recommends a small set of diverse, canonical examples, wrapped in example tags. {beat} Not every edge case.",None,["p035"]),
   ("Use it when you need consistent format, tone, or a particular judgement pattern. {beat} And keep the examples varied, so the model doesn't copy superficial features.",None,["p035"])]),
 ("chain-of-thought","staged flow",None,[
   ("Then there's chain-of-thought. {pause} It asks the model to reason before it answers, ideally in a separate section. Or you can use the model's built-in thinking.",None,["p036"]),
   ("It's good for multi-step reasoning, analysis, and math. {beat} The cost is more output tokens, and more latency.",None,["p036"]),
   ("And because the reasoning is separate, your code can show users only the answer.",None,["p036"])]),
 ("four more techniques","decomposition",None,[
   ("There are four more tools worth knowing. {pause} Prompt chaining lets you break a complex task into several simpler prompts, each easier to test.",None,["p037"]),
   ("Role prompting sets a role, like senior tax analyst, so you get sharper tone and focus.",None,["p038"]),
   ("Prefilling starts the assistant's reply for it, to force a format. Not every model supports it, so check the docs.",None,["p039"]),
   ("And structured outputs use a JSON schema, which beats asking for JSON in prose and hoping.",None,["p040"])]),
 ("choosing the technique","comparison table",None,[
   ("So which do you reach for? {beat} It depends what's going wrong.",None,["p041"]),
   ("Does your code have to parse the output? Use structured outputs, with a schema.",None,["p041"]),
   ("Is the tone or format drifting between runs? {beat} Use few-shot examples, plus a format spec.",None,["p041"]),
   ("Wrong answers on multi-step reasoning? Use thinking or chain-of-thought, and raise the effort.",None,["p041"]),
   ("Is one prompt doing too much? Chain it.",None,["p041"]),
   ("Hallucinated facts in document Q and A? {beat} Use a grounding rule, quote-then-answer, citations, and permission to say I don't know.","Hallucinated facts in document Q&A? Use a grounding rule, quote-then-answer, citations, and permission to say I don't know.",["p041"]),
   ("And if the model ignores a rule? Make it explicit, and explain why.",None,["p041"])]),
]
S["08"]=[
 ("four exam traps","decomposition",None,[
   ("Before you go, watch for four exam traps. {pause} First: switching to the largest model when the problem is really a prompt, retrieval, or caching problem.",None,["p043"]),
   ("Second: moving all your traffic up a tier, when only a subset is failing.",None,["p043"]),
   ("Third: treating a system prompt as a security boundary.",None,["p043"]),
   ("And fourth: using few-shot examples to hold big reference documents. {beat} Those belong in context, clearly tagged, ideally cached.",None,["p043"])]),
 ("the self-check","staged flow",None,[
   ("Now, let's check yourself. {pause} Take your time with these. {beat} Question one: name two ways to improve quality on hard cases, without moving all traffic to a bigger model. {think}",None,["p045"]),
   ("Question two: why put dynamic content at the end of the prompt? {think}",None,["p045"]),
   ("Question three: when is structured output preferable to few-shot formatting examples? {think}",None,["p045"]),
   ("Question four: give two prompt techniques that reduce hallucinations in document Q and A. {think}","Question four: give two prompt techniques that reduce hallucinations in document Q&A.",["p045"]),
   ("And question five: what's Anthropic's documented default starting model strategy? {think} Ready? {beat} Here's how you did.",None,["p045"])]),
 ("the answers","definition card",None,[
   ("So, one: raise effort, or route the hard cases up.",None,["p046"]),
   ("Two: a static prefix stays identical, so it's cacheable, and your instructions stay separate from data.",None,["p046"]),
   ("Three: when your code parses the output, because schema enforcement is more reliable.",None,["p046"]),
   ("Four: any two of: allow I don't know, quote first, require citations, or a grounding-only rule.",None,["p046"]),
   ("Five: start with Opus, the most capable generally available model, and tune with effort, moving down tiers where evals allow.",None,["p046"]),
   ("That's chapter two. {beat} Pick the model on trade-offs, tune the effort, and then ask it clearly. {pause} See you in the next one.",None,["p002"])]),
]
tw=0
for seg,scenes in S.items():
    out=[]
    for i,(title,visual,example,entries) in enumerate(scenes,1):
        words=sum(len(strip(e[0]).split()) for e in entries)
        marks=sum(GAP[m] for e in entries for m in re.findall(r"\{(beat|pause|think)\}",e[0]))
        dur=max(4,math.ceil(words/2.0+marks+1)); tw+=words
        out.append(f"## Scene {i} — {title}\nvisual: {visual} (tier 1)\n"+(f"example: {example}\n" if example else "")+f"duration: ~{dur}s\n")
        for sp,disp,src in entries:
            out.append(f'- spoken: "{sp}"\n  display: "{disp or strip(sp)}"\n  source: [{", ".join(src)}]\n')
    os.makedirs(O+f"segments/{seg}",exist_ok=True)
    open(O+f"segments/{seg}/script.md","w").write("\n".join(out))
print("total spoken words:",tw)
