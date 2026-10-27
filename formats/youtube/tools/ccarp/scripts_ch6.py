# Writes segments/NN/script.md for CCAR-P Chapter 6 (spoken layer with pause markers; display layer derived via lexicon).
# usage: CCARP_DIR=<dir>/ python3 scripts_ch6.py
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
   ("Let's talk about evaluating Claude systems.",["h001"])]),
 ("the problem","definition card",None,[
   ("Picture this. {beat} You tweak a prompt, and one bad case gets fixed. Did you improve the system? {pause} Or did you just break ten others?",["p005"]),
   ("Without evals, you can't tell.",["p005"]),
   ("Here's the idea this whole chapter rests on. {beat} Evaluations are the acceptance criteria for a Claude system. They're the gate before any model, prompt, or architecture change.",["p002"]),
   ("And on the exam, measure first against a defined eval set beats change it and see, almost every time.",["p002"])]),
 ("what you'll be able to do","decomposition",None,[
   ("So here's where we're headed. {beat} You'll define evaluation metrics, like accuracy, latency, and cost. {beat} And safety, and security.",["p003"]),
   ("You'll design evaluation datasets, using mixed methodologies. {beat} And you'll run A B tests, and improve iteratively.",["p003"]),
   ("You'll diagnose system issues, like prompt failures, hallucinations, and model mismatch.",["p003"]),
   ("Then you'll optimise tokens, latency, and cost, and monitor it all in production. {pause} But first, why do L L M systems need evals at all?",["p003"])]),
]
S["02"]=[
 ("probabilistic","definition card",None,[
   ("Let's start with why. {pause} L L M outputs are probabilistic, and open-ended.",["p005"]),
   ("So a prompt tweak that fixes one case can break ten others. {beat} And a model upgrade can change behaviour silently.",["p005"])]),
 ("three things go wrong","decomposition",None,[
   ("Now, without an eval suite, three things go wrong. {beat} You can't tell improvement from regression.",["p005"]),
   ("You can't defend your decisions to stakeholders. {beat} And you can't safely adopt new models.",["p005"])]),
 ("eval-driven development","definition card",None,[
   ("So what's the answer? {pause} Eval-driven development.",["p005"]),
   ("You write the evals before, or alongside, the system. {beat} They're your success criteria, written as tests. It's like test-driven development.",["p005"])]),
]
S["03"]=[
 ("good criteria","comparison table","chapter",[
   ("Now, how do you define success? {pause} Good success criteria are specific, measurable, achievable, and relevant.",["p007"]),
   ("Let's look at it through an example. {beat} Compare weak criteria with strong ones.",["p007","p008"])]),
 ("accuracy and speed","comparison table","chapter",[
   ("First, weak: accurate answers. {beat} Strong: at least ninety-two percent of answers rated correct and grounded, by rubric, on the six hundred question golden set.",["p008"]),
   ("Weak: fast. {beat} Strong: P ninety-five end-to-end latency under two point five seconds, at fifty requests a second.",["p008"])]),
 ("cost and safety","comparison table","chapter",[
   ("Next, weak: cheap. {beat} Strong: average cost at or below one and a half cents per ticket, at the current mix.",["p008"]),
   ("Weak: safe. {pause} Strong: zero P I I leaks, and under zero point five percent policy-violating outputs, on the three hundred case adversarial set.",["p008"]),
   ("And over-refusal under two percent, on legitimate requests.",["p008"])]),
 ("several at once","definition card",None,[
   ("Now, notice something. {pause} Most real systems need criteria across several dimensions at once. {beat} Quality and latency. Cost and safety. Together.",["p009"]),
   ("And you agree them with stakeholders during discovery. {beat} That's Chapter nine.",["p009"])]),
]
S["04"]=[
 ("ten dimensions","decomposition",None,[
   ("Now, which metrics belong to which dimension? {pause} There are ten dimensions, and each one has its own metrics.",["p011"])]),
 ("accuracy, grounding, retrieval","comparison table",None,[
   ("First, task accuracy. {beat} It uses things like exact match, F one, and rubric score.",["p011"]),
   ("Grounding asks whether claims are supported by the context. {beat} Think faithfulness, citation accuracy, and hallucination rate.",["p011"]),
   ("And for retrieval, you use recall at K and precision at K. Plus M R R, and failed-retrieval rate.",["p011"])]),
 ("consistency, capability, latency","comparison table",None,[
   ("Next, consistency. {pause} It's about variance across repeated runs. The metric is pass to the K, where all K trials succeed.",["p011"]),
   ("Capability uses pass at K, where at least one of K trials succeeds.",["p011"]),
   ("And latency covers time to first token, and the number of agent steps. Total time uses P fifty, P ninety-five, and P ninety-nine.",["p011"])]),
 ("cost, safety, security, business","comparison table",None,[
   ("Then cost. {pause} Input and output tokens per task, cache hit rate, and dollars per task.",["p011"]),
   ("Safety: the harmful-output rate, the refusal rate on harmful prompts, and over-refusal on benign ones.",["p011"]),
   ("Security: prompt-injection success rate, data-exfiltration rate, and unauthorised tool-call attempts.",["p011"]),
   ("And business metrics: resolution rate, deflection, and C S A T. Plus handle time, and escalation rate.",["p011"])]),
 ("pass at K and pass to the K","split panel",None,[
   ("Let's zoom in on two of those. {pause} Pass at K, versus pass to the K. This comes from Anthropic's Demystifying evals for AI agents.",["p012"]),
   ("Pass at K asks: can the agent solve the task within K attempts? {beat} That's capability. Pass to the K asks: does it succeed every time? That's reliability.",["p012"]),
   ("So which matters for a customer-facing agent? {beat} Reliability. Customer-facing agents need a high pass to the K.",["p012"])]),
]
S["05"]=[
 ("six sources","decomposition",None,[
   ("Now, building eval datasets. {pause} Where do test cases come from? {beat} There are six sources.",["p014"])]),
 ("real, failures, edge","staged flow",None,[
   ("First, real production or historical data, anonymised. {beat} It's the most representative.",["p014"]),
   ("Second, known failures. {beat} Anthropic's guidance is to start with a few dozen real failures, rather than waiting for a perfect suite.",["p014"]),
   ("Third, edge cases. Empty inputs, very long inputs, ambiguous requests, and multiple languages.",["p014"])]),
 ("adversarial, negative, synthetic","staged flow",None,[
   ("Now, fourth, adversarial cases. {pause} Prompt injections, jailbreak attempts, and requests for restricted data.",["p014"]),
   ("Fifth, negative cases. {beat} Things the system should not do. Keep balanced should and should-not sets.",["p014"]),
   ("And sixth, synthetic cases. Claude generates them to expand coverage, and humans review them.",["p014"])]),
 ("quality rules","staged flow",None,[
   ("Now, quality. {pause} Tasks should be unambiguous. Two experts should agree on the verdict.",["p015"]),
   ("Review your labels. {beat} Keep a held-out set, so you don't overfit prompts to the test set.",["p015"]),
   ("And refresh the set as production traffic shifts.",["p015"])]),
 ("two suites","split panel",None,[
   ("Now, you also need two suites, with different purposes. {pause} Capability evals are hard tasks the system can't yet do reliably.",["p016"]),
   ("You use them to drive improvement, and pass rates start low.",["p016"]),
   ("Regression evals are tasks the system already handles. {beat} They must stay near one hundred percent, and you run them on every change.",["p016"])]),
]
S["06"]=[
 ("mixed methodology","decomposition",None,[
   ("Now, grading. {pause} The official phrase is mixed methodology. {beat} There are three kinds of grader.",["p018","p019"]),
   ("Combine code-based checks where possible, L L M judges for nuance, and humans to calibrate the judges and review high-risk samples.",["p019"])]),
 ("code-based","comparison table",None,[
   ("First, code-based graders. {beat} Exact match, regex, and schema validation. Unit tests, and state checks. They're fast, cheap, and deterministic.",["p018"]),
   ("But they're brittle on open-ended text. {beat} So use them for extraction, classification, and code. And for tool-call and final-state checks.",["p018"])]),
 ("model-based","comparison table",None,[
   ("Second, model-based graders, also called L L M as judge. {pause} Claude grades the output against a rubric. It scales, and it handles nuance.",["p018"]),
   ("The weakness? {beat} It's non-deterministic and can be biased, so it must be calibrated. Use it for tone, helpfulness, groundedness, and completeness.",["p018"])]),
 ("human","comparison table",None,[
   ("Third, humans. {beat} Experts review. It's the gold standard, and it handles subjectivity.",["p018"]),
   ("But it's slow and expensive, and inconsistent without a rubric. {beat} So use it for calibration, high-risk domains, and spot checks.",["p018"])]),
 ("a good judge","staged flow",None,[
   ("So how do you get a good L L M judge? {pause} Give it a clear rubric, with separate dimensions.",["p020"]),
   ("Ask for reasoning before the score. {beat} And allow an unknown, or insufficient evidence, verdict.",["p020"]),
   ("Use a different prompt than the system under test, and ideally a stronger model.",["p020"]),
   ("And calibrate it. {beat} Check agreement with human labels on a sample, before you trust it.",["p020"])]),
 ("agents","staged flow",None,[
   ("Now, agents need special care. {pause} Grade the outcome. {beat} That means the final state of the environment. Was the ticket actually updated? Do the tests pass?",["p021"]),
   ("Don't insist on one exact path, because valid solutions vary.",["p021"]),
   ("Run multiple trials per task, because agent behaviour is non-deterministic. {beat} And read transcripts regularly, to confirm your graders measure what you think.",["p021"])]),
]
S["07"]=[
 ("four stages","decomposition",None,[
   ("Now, A B testing and iterative improvement. {pause} What's a safe path from change to production? {beat} There are four stages.",["p023"])]),
 ("offline and shadow","staged flow",None,[
   ("First, an offline eval. {beat} Run the new version against the current one, on the full regression and capability suites.",["p023"]),
   ("Second, shadow mode. {beat} The new version runs on live traffic, but its outputs aren't shown. You compare against production.",["p023"])]),
 ("canary and rollout","staged flow",None,[
   ("Third, a canary, or A B test. {pause} A small percentage of real users. Compare business and quality metrics, with statistical care.",["p023"]),
   ("And fourth, gradual rollout, with automatic rollback triggers.",["p023"])]),
 ("discipline","staged flow",None,[
   ("And some discipline. {pause} Change one variable at a time: the prompt, or the model, or the retrieval config.",["p024"]),
   ("Version everything, so results are attributable. {beat} Make sure your sample sizes are large enough.",["p024"]),
   ("And watch guardrail metrics, like safety and cost, as well as the target metric.",["p024"])]),
]
S["08"]=[
 ("five categories","decomposition",None,[
   ("Now, diagnosing system issues. {pause} The official objective names three categories. Prompt failure, hallucination, and model mismatch.",["p026"]),
   ("In practice, add two more: retrieval and tooling.",["p026"])]),
 ("prompt failure","comparison table",None,[
   ("First, a prompt failure. {beat} What does it look like? It ignores a rule, gives the wrong format, or has inconsistent tone. {beat} Confirm by reviewing transcripts. If failures cluster on one instruction, that's your answer.",["p027"]),
   ("The fix: clarify or move the instruction, explain why, add examples, or use structured output.",["p027"])]),
 ("hallucination","comparison table",None,[
   ("Now, hallucination. {pause} Fluent, confident, unsupported claims. Fake citations, too. {beat} Check the claims against the retrieved context.",["p027"]),
   ("The fix: a grounding rule, quote-then-answer, and citations with verification. Plus permission to say I don't know, and better retrieval.",["p027"])]),
 ("model mismatch","comparison table",None,[
   ("Then model mismatch. {pause} How do you spot it? {beat} It looks like consistent failure on hard reasoning. {beat} Or overkill cost on easy tasks.",["p027"]),
   ("Confirm by comparing tiers and effort on the same eval slice. {beat} Then raise effort, route hard cases up, or move easy traffic down.",["p027"])]),
 ("retrieval and tools","comparison table",None,[
   ("Finally, retrieval failure means wrong or stale answers, because the right document isn't in context. {beat} Confirm with recall at K, and by inspecting chunk identifiers.",["p027"]),
   ("And tool failure means the wrong tool, bad parameters, or loops. {beat} Confirm in the tool-call logs. The fix: better descriptions, fewer tools, helpful validation errors, and step limits.",["p027"])]),
 ("find what changed","definition card",None,[
   ("Here's the diagnosis principle. {pause} Find what changed.",["p028"]),
   ("A document refresh points to retrieval. {beat} A model upgrade points to prompt-model fit. A new tool points to tool selection. And a traffic shift points to eval coverage.",["p028"])]),
]
S["09"]=[
 ("cheapest first","definition card",None,[
   ("Now, optimising cost, latency, and tokens. {pause} The rule is: work from cheapest-to-implement to most disruptive. {beat} And verify each step against your evals.",["p030"])]),
 ("caching, context, effort","staged flow",None,[
   ("Where do you start? {beat} First, prompt caching for static prefixes. {beat} That's a large saving in cost and time to first token.",["p030"]),
   ("Second, trim context. Fewer, better retrieved chunks, concise tool outputs, and no redundant instructions.",["p030"]),
   ("Third, tune effort and thinking to what the task needs.",["p030"])]),
 ("size, route, batch","staged flow",None,[
   ("Now, fourth, right-size max tokens, and ask for concise outputs where that's appropriate.",["p030"]),
   ("Fifth, route by difficulty to smaller models. {beat} And sixth, use the Batch A P I for asynchronous workloads.",["p030"])]),
 ("parallel, stream, re-architect","staged flow",None,[
   ("Now, seventh, parallelise independent steps, to cut wall-clock time.",["p030"]),
   ("Eighth, stream responses, to improve perceived latency. {pause} And last, if you're still over budget, re-architect. Fewer agent steps, or a workflow instead of an agent.",["p030"])]),
 ("a worked example","worked example","chapter",[
   ("Let's look at it through an example. {pause} A summarisation service costs nine cents per document, and takes eleven seconds.",["p031"]),
   ("Analysis shows three things. {beat} A nine K static instruction block. Thirty retrieved chunks, of which only five are useful. And maximum effort.",["p031"]),
   ("So the fix: cache the instruction block, rerank down to six chunks, and use default effort.",["p031"]),
   ("That brings it to about three cents, and five seconds. {beat} And the eval score is unchanged. No model change was needed.",["p031"])]),
]
S["10"]=[
 ("the loop","definition card",None,[
   ("Now, evaluation doesn't stop at launch. {pause} Production monitoring closes the loop. And the detail is in Chapter five.",["p033"])]),
 ("dashboards","decomposition",None,[
   ("First, dashboards. {beat} Quality, from sampled judge scores. Safety flags, latency percentiles, and cost per task.",["p033"]),
   ("And cache hit rate, escalation rate, and refusal rate.",["p033"])]),
 ("alerts and feedback","staged flow",None,[
   ("Second, alerts, on drift or threshold breaches.",["p033"]),
   ("And third, a feedback-to-eval pipeline. {pause} Every production failure becomes a new eval case. {beat} Whether users, reviewers, or monitors found it.",["p033"]),
   ("So the regression suite grows with reality.",["p033"])]),
]
S["11"]=[
 ("five exam traps","decomposition",None,[
   ("Before you go, watch for five exam traps. {pause} First: adopting a new model because it's newer, without running the regression suite.",["p035"]),
   ("Second: an L L M judge that was never calibrated against humans, in a high-stakes domain.",["p035"]),
   ("Third: optimising only accuracy, while the question sets latency or cost targets.",["p035"]),
   ("Fourth: testing only happy paths, with no adversarial or should-not cases.",["p035"]),
   ("And fifth: changing several variables at once, and attributing the result to one.",["p035"])]),
 ("the self-check","staged flow",None,[
   ("Now, let's check yourself. {pause} Take your time with these. {beat} Question one: what's the difference between capability and regression evals? {think}",["p037"]),
   ("Question two: when would pass to the K matter more than pass at K? {think}",["p037"]),
   ("Question three: name the three grader types, and one weakness of each. {think}",["p037"]),
   ("Question four: what four stages make a safe rollout path? {think}",["p037"]),
   ("And question five: after a model upgrade, escalations rise fifteen percent, but cost and latency are flat. What's your first step? {think} Ready? {beat} Here's how you did.",["p037"])]),
 ("the answers","definition card",None,[
   ("So, one: capability evals target things not yet solved, to drive improvement. {beat} Regression evals protect what works, and run on every change.",["p038"]),
   ("Two: customer-facing or high-stakes agents, that must succeed consistently.",["p038"]),
   ("Three: code-based is brittle on open text. Model-based is non-deterministic and biased, and needs calibration. And human is slow and expensive.",["p038"]),
   ("Four: offline eval, then shadow mode, then canary or A B, then gradual rollout with rollback.",["p038"]),
   ("Five: run the regression suite, old versus new, on the escalation-relevant cases. {beat} And inspect the prompt-model behaviour differences.",["p038"]),
   ("That's chapter six. {beat} Measure first, against a defined eval set. Grade with a mix of methods. And change one thing at a time. {pause} See you in the next one.",["p002","p019","p024"])]),
]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"writer_tail.py")).read())
