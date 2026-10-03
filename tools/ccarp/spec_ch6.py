# Per-scene visual spec for CCAR-P Chapter 6. Copy is short on-screen text, never a narrated sentence;
# each cue is a word from that scene's own captions (display layer): a string, or [string, nth occurrence].
R=lambda items,cues,**kw: dict(k="rows",items=items,cues=cues,**kw)
C=lambda items,cues,**kw: dict(k="chips",items=items,cues=cues,**kw)
F=lambda items,cues,**kw: dict(k="flow",items=[dict(t=t) for t in items],cues=cues,**kw)
N=lambda *ts: [dict(n=f"{i+1:02d}",t=t) for i,t in enumerate(ts)]
def COLS(a,b,cues,hot=None,y=380): return dict(k="cols",items=[dict(l=a[0],t=a[1],s=a[2]),dict(l=b[0],t=b[1],s=b[2])],cues=cues,y=y,**({"hot":hot} if hot else {}))
def TBL(head,w,rows,cues,y=330,hot=None): return dict(k="table",head=head,w=w,y=y,rows=rows,cues=cues,**({"hot":hot} if hot else {}))
DIM=lambda rows,cues: TBL(["dimension","metrics"],[420,1288],rows,cues)
SPEC={
"01":[
 dict(slug="title",label="CCAR-P · Chapter 6",head=["evaluating","claude systems"],big=True,titlecues=["evaluating","systems."],body=[]),
 dict(slug="problem",label="the problem",head=["measure first"],body=[
   R(N("a prompt tweak fixes one case","did it break ten others?","evals: the acceptance criteria","the gate before any change","measure first beats change-and-see"),["tweak","break","acceptance","gate","measure"],hot=[4])]),
 dict(slug="outcomes",label="by the end",head=["you can"],body=[
   R(N("define metrics: accuracy, latency, cost, safety","design datasets with mixed methodologies","run A/B tests, diagnose issues","optimise, and monitor in production"),["define","design","diagnose","optimise"])]),
],
"02":[
 dict(slug="probabilistic",label="6.1 · why LLM systems need evals",head=["why evals"],body=[
   COLS(("the output","probabilistic and open-ended","a prompt tweak can break ten others"),("an upgrade","can change behaviour silently",""),["probabilistic,","upgrade"],hot=[1])]),
 dict(slug="three",label="6.1 · why LLM systems need evals",head=["three things go wrong"],body=[
   R(N("can't tell improvement from regression","can't defend decisions to stakeholders","can't safely adopt new models"),["improvement","defend","adopt"],y=360)]),
 dict(slug="edd",label="6.1 · eval-driven development",head=["eval-driven development"],body=[
   F(["write the evals before or alongside the system","success criteria, written as tests","like test-driven development"],["write","criteria,","like"],y=380,hot=[2])]),
],
"03":[
 dict(slug="good",label="6.2 · defining success criteria",head=["good success criteria"],body=[
   C(["specific","measurable","achievable","relevant"],["specific,","measurable,","achievable,","relevant."],y=420,fs=54)]),
 dict(slug="accuracy-speed",label="6.2 · an example",head=["accuracy and speed"],body=[
   TBL(["weak","strong"],[420,1288],[["accurate answers","≥92% rated correct and grounded, by rubric, on the 600-question golden set"],["fast","p95 end-to-end latency < 2.5 s at 50 requests/s"]],["accurate","fast"])]),
 dict(slug="cost-safety",label="6.2 · an example",head=["cost and safety"],body=[
   TBL(["weak","strong"],[420,1288],[["cheap","average cost ≤ $0.015 per ticket, at the current mix"],["safe","0 PII leaks; < 0.5% policy violations on the 300-case adversarial set; over-refusal < 2%"]],["cheap.","safe."])]),
 dict(slug="several",label="6.2 · defining success criteria",head=["several at once"],body=[
   C(["quality","latency","cost","safety"],["Quality","latency.","Cost","safety."],y=440,label="agreed with stakeholders in discovery",fs=54)]),
],
"04":[
 dict(slug="ten",label="6.3 · metrics by dimension",head=["ten dimensions"],body=[
   C(["task accuracy","grounding","retrieval","consistency","capability","latency","cost","safety","security","business"],["Now,","metrics","belong","dimension?","There","ten","dimensions,","each","own","metrics."],y=420,fs=46)]),
 dict(slug="acc-ground-retr",label="6.3 · metrics by dimension",head=["accuracy to retrieval"],body=[
   DIM([["task accuracy","exact match, F1, rubric score"],["grounding","faithfulness, citation accuracy, hallucination rate"],["retrieval","recall@k, precision@k, MRR, failed retrievals"]],["accuracy.","Grounding","retrieval,"])]),
 dict(slug="cons-cap-lat",label="6.3 · metrics by dimension",head=["consistency to latency"],body=[
   DIM([["consistency","variance across runs; pass^k: all k trials succeed"],["capability","pass@k: at least one of k trials succeeds"],["latency","time to first token, p50/p95/p99, agent steps"]],["consistency.","Capability","latency"])]),
 dict(slug="cost-safety-biz",label="6.3 · metrics by dimension",head=["cost to business"],body=[
   DIM([["cost","tokens per task, cache hit rate, $ per task"],["safety","harmful-output rate, refusals, over-refusal"],["security","injection success, exfiltration, unauthorised tool calls"],["business","resolution, deflection, CSAT, handle time, escalation"]],["cost.","Safety:","Security:","business"])]),
 dict(slug="pass-k",label="6.3 · pass@k vs pass^k",head=["pass@k vs pass^k"],body=[
   COLS(("pass@k","can it solve the task in k attempts?","capability"),("pass^k","does it succeed every time?","reliability: customer-facing agents need a high pass^k"),["asks:","reliability."],hot=[1])]),
],
"05":[
 dict(slug="six",label="6.4 · building eval datasets",head=["six sources"],body=[
   R(N("real production data (anonymised)","known failures","edge cases","adversarial cases","negative cases","synthetic cases"),["building","datasets.","Where","test","come","six"],cols=2,y=330)]),
 dict(slug="real-fail-edge",label="6.4 · building eval datasets",head=["real, failures, edge"],body=[
   R([dict(n="01",t="real production data, anonymised",s="the most representative"),dict(n="02",t="known failures",s="start with a few dozen real failures"),dict(n="03",t="edge cases",s="empty or very long inputs, ambiguity, many languages")],["real","failures.","edge"],y=330)]),
 dict(slug="adv-neg-syn",label="6.4 · building eval datasets",head=["the other three"],body=[
   R([dict(n="04",t="adversarial cases",s="prompt injections, jailbreaks, restricted-data requests"),dict(n="05",t="negative cases",s="what it should not do: balance should and should-not"),dict(n="06",t="synthetic cases",s="generated by Claude, reviewed by humans")],["adversarial","negative","synthetic"],y=330)]),
 dict(slug="quality",label="6.4 · quality rules",head=["quality rules"],body=[
   R(N("unambiguous: two experts would agree","review the labels","hold out a set against overfitting","refresh as traffic shifts"),["unambiguous.","Review","held-out","refresh"],y=340)]),
 dict(slug="suites",label="6.4 · two suites",head=["two suites"],body=[
   COLS(("capability","hard tasks it can't yet do","drives improvement; pass rates start low"),("regression","tasks it already handles","stay near 100%; run on every change"),["Capability","Regression"],hot=[1])]),
],
"06":[
 dict(slug="mixed",label="6.5 · grading methods",head=["mixed methodology"],body=[
   F(["code-based checks where possible","LLM judges for nuance","humans to calibrate and review high-risk samples"],["code-based","LLM","humans"],y=380)]),
 dict(slug="code",label="6.5 · code-based graders",head=["code-based graders"],body=[
   COLS(("strengths","fast, cheap, deterministic","exact match, regex, schema validation, unit tests, state checks"),("weakness","brittle on open-ended text","use for extraction, classification, code, tool-call and final-state checks"),["fast,","brittle"],hot=[1])]),
 dict(slug="model",label="6.5 · model-based graders",head=["model-based graders"],body=[
   COLS(("strengths","scales, handles nuance","Claude grades against a rubric"),("weaknesses","non-deterministic, can be biased","calibrate it; use for tone, helpfulness, groundedness, completeness"),["scales,","weakness?"],hot=[1])]),
 dict(slug="human",label="6.5 · human graders",head=["human graders"],body=[
   COLS(("strengths","gold standard, handles subjectivity",""),("weaknesses","slow, expensive, inconsistent without a rubric","use for calibration, high-risk domains, spot checks"),["gold","slow"],hot=[1])]),
 dict(slug="judge",label="6.5 · a good LLM judge",head=["a good judge"],body=[
   R(N("a clear rubric, separate dimensions","reasoning before the score","'insufficient evidence' allowed","a different prompt, ideally a stronger model","calibrated on human labels"),["rubric,","reasoning","unknown,","different","calibrate"],y=330,hot=[4])]),
 dict(slug="agents",label="6.5 · grading agents",head=["grading agents"],body=[
   R(N("grade the outcome: the final state","one exact path? no: valid solutions vary","run multiple trials per task","read transcripts regularly"),["outcome.","insist","trials","transcripts"],y=340)]),
],
"07":[
 dict(slug="four",label="6.6 · A/B testing and iterative improvement",head=["a safe path"],body=[
   F(["offline eval","shadow mode","canary / A/B test","gradual rollout, with rollback"],["A/B","iterative","path","four"],y=400)]),
 dict(slug="offline-shadow",label="6.6 · safe path",head=["offline and shadow"],body=[
   COLS(("stage 1","offline eval","new vs current, on the full regression and capability suites"),("stage 2","shadow mode","runs on live traffic, outputs not shown; compare with production"),["offline","Shadow"])]),
 dict(slug="canary",label="6.6 · safe path",head=["canary and rollout"],body=[
   COLS(("stage 3","canary or A/B test","a small share of real users; business and quality metrics, with statistical care"),("stage 4","gradual rollout","with automatic rollback triggers"),["canary,","fourth,"])]),
 dict(slug="discipline",label="6.6 · discipline",head=["discipline"],body=[
   R(N("change one variable at a time","version everything; enough sample size","watch guardrail metrics: safety, cost"),["Change","Version","guardrail"],y=360,hot=[0])]),
],
"08":[
 dict(slug="categories",label="6.7 · diagnosing system issues",head=["five categories"],body=[
   C(["prompt failure","hallucination","model mismatch","retrieval","tooling"],["Prompt","hallucination,","mismatch.","retrieval","tooling."],y=420,fs=50,label="the objective names three; add two")]),
 dict(slug="prompt-failure",label="6.7 · prompt failure",head=["prompt failure"],body=[
   F(["ignores a rule, wrong format, inconsistent tone","confirm: failures cluster on one instruction","fix: clarify, explain why, add examples, structured output"],["ignores","Confirm","fix:"],y=380,hot=[2])]),
 dict(slug="hallucination",label="6.7 · hallucination",head=["hallucination"],body=[
   F(["fluent, confident, unsupported claims","check the claims against retrieved context","grounding rule, quote-then-answer, citations, better retrieval"],["Fluent,","Check","fix:"],y=380,hot=[2])]),
 dict(slug="model-mismatch",label="6.7 · model mismatch",head=["model mismatch"],body=[
   F(["fails on hard reasoning, or overkill cost on easy tasks","compare tiers and effort on the same eval slice","raise effort, route hard cases up, move easy traffic down"],["consistent","comparing","raise"],y=380,hot=[2])]),
 dict(slug="retrieval-tools",label="6.7 · retrieval and tool failures",head=["retrieval and tools"],body=[
   COLS(("retrieval failure","wrong or stale answers","confirm: recall@k, chunk IDs"),("tool failure","wrong tool, bad parameters, loops","confirm: tool-call logs; better descriptions, fewer tools, step limits"),["Retrieval","tool"])]),
 dict(slug="principle",label="6.7 · the diagnosis principle",head=["find what changed"],body=[
   TBL(["what changed","points to"],[820,888],[["a document refresh","retrieval"],["a model upgrade","prompt-model fit"],["a new tool","tool selection"],["a traffic shift","eval coverage"]],["document","upgrade","tool","traffic"])]),
],
"09":[
 dict(slug="cheapest",label="6.8 · optimising cost, latency and tokens",head=["cheapest first"],body=[
   F(["optimise cost, latency, tokens","cheapest-to-implement first, most disruptive last","verify each step against your evals"],["optimising","most","verify"],y=380,hot=[2])]),
 dict(slug="first-three",label="6.8 · levers 1–3",head=["caching, context, effort"],body=[
   R(N("prompt caching for static prefixes","trim context: fewer, better chunks","tune effort and thinking to the task"),["caching","Second,","Third,"],y=360)]),
 dict(slug="next-three",label="6.8 · levers 4–6",head=["size, route, batch"],body=[
   R(N("right-size max_tokens; concise outputs","route by difficulty to smaller models","Batch API for asynchronous workloads"),["right-size","Fifth,","sixth,"],y=360)]),
 dict(slug="last-three",label="6.8 · levers 7–9",head=["the last three"],body=[
   R(N("parallelise independent steps","stream responses","still over budget? re-architect"),["parallelise","stream","last,"],y=360,hot=[2])]),
 dict(slug="example",label="6.8 · a worked example",head=["a worked example"],body=[
   dict(k="stat",t="$0.09",s="per document, 11 s: a 9K static block, 30 chunks (5 useful), max effort",cue="$0.09",y=320),
   dict(k="stat",t="$0.03",s="about 5 s: cached block, 6 reranked chunks, default effort",cue="$0.03",y=540,hot=True),
   R([dict(n="→",t="eval score unchanged; no model change")],["unchanged."],y=780,hot=[0])]),
],
"10":[
 dict(slug="loop",label="6.9 · monitoring in production",head=["the loop closes"],body=[
   R(N("evaluation doesn't stop at launch","production monitoring closes the loop","the detail is in Chapter 5"),["stop","closes","Chapter"],y=360)]),
 dict(slug="dashboards",label="6.9 · dashboards",head=["dashboards"],body=[
   C(["quality (judge scores)","safety flags","latency percentiles","cost per task","cache hit rate","escalation rate","refusal rate"],["Quality,","Safety","latency","cost","cache","escalation","refusal"],y=400,fs=44)]),
 dict(slug="alerts-feedback",label="6.9 · alerts and feedback",head=["alerts and feedback"],body=[
   F(["alerts on drift or threshold breaches","every production failure becomes an eval case","the regression suite grows with reality"],["alerts,","feedback-to-eval","reality."],y=380,hot=[1])]),
],
"11":[
 dict(slug="traps",label="6.10 · exam traps",head=["five exam traps"],body=[
   R(N("a newer model, no regression run","an uncalibrated LLM judge, high stakes","optimising accuracy only, ignoring latency or cost","happy paths only: no adversarial cases","several variables changed at once"),["First:","Second:","Third:","Fourth:","fifth:"],y=330)]),
 dict(slug="self-check",label="self-check",head=["self-check"],body=[
   R(N("capability vs regression evals?","when does pass^k beat pass@k?","three grader types, one weakness each","four stages of a safe rollout","escalations +15%, cost flat: first step?"),[["Question",0],["Question",1],["Question",2],["Question",3],["Question",4]],y=330)]),
 dict(slug="answers",label="self-check · answers",head=["answers"],body=[
   R(N("capability drives progress, regression guards it","customer-facing or high-stakes agents","code: brittle · model: biased · human: slow","offline → shadow → canary → gradual rollout","regression suite, old vs new, on those cases"),["one:","Two:","Three:","Four:","Five:"],y=330,hot=[0])]),
],
}
TRACK=["Why evals","Criteria","Metrics","Datasets","Grading","A/B tests","Diagnosis","Cost","Monitoring","Traps"]
TRACKMAP={"02":0,"03":1,"04":2,"05":3,"06":4,"07":5,"08":6,"09":7,"10":8,"11":9}
