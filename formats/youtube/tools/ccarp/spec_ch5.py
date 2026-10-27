# Per-scene visual spec for CCAR-P Chapter 5. Copy is short on-screen text, never a narrated sentence;
# each cue is a word from that scene's own captions (display layer): a string, or [string, nth occurrence].
R=lambda items,cues,**kw: dict(k="rows",items=items,cues=cues,**kw)
C=lambda items,cues,**kw: dict(k="chips",items=items,cues=cues,**kw)
F=lambda items,cues,**kw: dict(k="flow",items=[dict(t=t) for t in items],cues=cues,**kw)
N=lambda *ts: [dict(n=f"{i+1:02d}",t=t) for i,t in enumerate(ts)]
def COLS(a,b,cues,hot=None,y=380): return dict(k="cols",items=[dict(l=a[0],t=a[1],s=a[2]),dict(l=b[0],t=b[1],s=b[2])],cues=cues,y=y,**({"hot":hot} if hot else {}))
def TBL(head,w,rows,cues,y=330,hot=None): return dict(k="table",head=head,w=w,y=y,rows=rows,cues=cues,**({"hot":hot} if hot else {}))
CH=lambda rows,cues: TBL(["strategy","best for","risk"],[520,600,588],rows,cues)
MATCH=lambda rows,cues: TBL(["data shape","query pattern","best strategy"],[520,560,628],rows,cues)
TRADE=lambda rows,cues: TBL(["decision","more accurate","faster or cheaper"],[460,624,624],rows,cues)
SYM=lambda rows,cues: TBL(["symptom","likely cause"],[820,888],rows,cues)
SPEC={
"01":[
 dict(slug="title",label="CCAR-P · Chapter 5",head=["retrieval","& observability"],big=True,titlecues=["retrieval,","see"],body=[]),
 dict(slug="problem",label="the problem",head=["the wrong answer"],body=[
   R(N("a wrong answer in production","you blame the model","really a retrieval incident","design retrieval carefully","instrument it to tell the difference"),["wrong","blame","retrieval","Design","instrument"],hot=[2])]),
 dict(slug="outcomes",label="by the end",head=["you can"],body=[
   R(N("design a RAG pipeline: chunking, indexing","match retrieval to data shape and query","weigh accuracy against latency","analyze observability, pick monitoring"),["design","match","weigh","analyze"])]),
],
"02":[
 dict(slug="what",label="5.1 · do you need RAG at all?",head=["do you need rag?"],body=[
   R(N("retrieval-augmented generation","fetches relevant knowledge at query time","puts it in the prompt"),["retrieval-augmented","fetches","puts"],y=360)]),
 dict(slug="simpler",label="5.1 · the simpler option",head=["the simpler option"],body=[
   F(["a small knowledge base: under roughly 200K tokens","include it whole in the prompt","prompt caching keeps it fast and affordable"],["small","include","caching"],y=380,hot=[1])]),
 dict(slug="when",label="5.1 · when RAG is right",head=["when rag is right"],body=[
   R(N("the knowledge base is too large for the window","the content changes often","you need per-user access filtering"),["large","changes","per-user"],y=360)]),
],
"03":[
 dict(slug="halves",label="5.2 · the pipeline",head=["two halves"],body=[
   COLS(("offline","ingestion","extract, clean, chunk, enrich, index"),("online","query","process, retrieve, fuse, rerank, generate, verify"),["Ingestion","query"])]),
 dict(slug="extract-clean",label="5.2 · ingestion",head=["extract and clean"],body=[
   F(["extract text from PDFs, web pages, tickets, wikis","clean: remove boilerplate, navigation, duplicates"],["extraction.","clean"],y=340),
   C(["headings","tables","lists"],["headings,","tables,","lists."],y=700,label="keep the structure")]),
 dict(slug="chunk-enrich-index",label="5.2 · ingestion",head=["chunk, enrich, index"],body=[
   F(["chunk into retrievable units","enrich with metadata: source, date, version, access labels","index: embeddings and BM25, stored with metadata"],["chunk","enrich","index."],y=380)]),
 dict(slug="query-retrieve",label="5.2 · the query side",head=["query and retrieve"],body=[
   F(["process: rewrite, expand or decompose the query","retrieve: semantic and lexical, filtered by metadata and permissions"],["processing.","retrieve."],y=380)]),
 dict(slug="fuse-rerank",label="5.2 · the query side",head=["fuse, rerank, generate"],body=[
   F(["fuse: combine and deduplicate, with rank fusion","rerank: score for true relevance, keep the top few","generate: answer with grounding and citations","verify: do the citations exist and support the claims?"],["fuse.","rerank.","generate.","verify."],y=380)]),
 dict(slug="maintenance",label="5.2 · maintenance",head=["maintenance"],body=[
   R(N("re-index when documents change","version your indexes","monitor retrieval quality","delete with the source: GDPR erasure"),["Re-index","Version","monitor","delete"],y=340,hot=[3])]),
],
"04":[
 dict(slug="six",label="5.3 · chunking strategies",head=["six strategies"],body=[
   R(N("fixed-size, with overlap","structure-aware","semantic","hierarchical (parent-child)","document-level","specialised"),["chunking.","split","decides","retrieve.","six","risk."],cols=2,y=330)]),
 dict(slug="fixed-structure",label="5.3 · chunking strategies",head=["fixed and structure-aware"],body=[
   CH([["fixed-size","uniform prose, quick start","splits mid-thought; loses headings"],["structure-aware","policies, contracts, manuals, docs","uneven sizes"]],["fixed-size","structure-aware"])]),
 dict(slug="semantic-hierarchical",label="5.3 · chunking strategies",head=["semantic and hierarchical"],body=[
   CH([["semantic","long narrative text","more compute to build"],["hierarchical","precise match, enough context","a more complex store"]],["semantic","hierarchical,"])]),
 dict(slug="document-specialised",label="5.3 · chunking strategies",head=["document and specialised"],body=[
   CH([["document-level","short documents: FAQs, tickets","wasteful when long"],["specialised","code by function or class; tables as rows","needs custom parsers"]],["document-level","specialised"])]),
 dict(slug="rules",label="5.3 · rules of thumb",head=["where to start"],body=[
   R(N("chunks of a few hundred tokens","keep headings and metadata with each chunk","test chunk size against your eval set"),["hundred","headings","test"],y=360,hot=[2])]),
],
"05":[
 dict(slug="problem",label="5.4 · contextual retrieval",head=["the orphaned chunk"],body=[
   dict(k="quote",t="the company's revenue grew by 3% over the previous quarter",cue="company's",y=340),
   R(N("which company?","which quarter?"),["Which",["Which",1]],y=620,hot=[0,1])]),
 dict(slug="fix",label="5.4 · contextual retrieval",head=["add context first"],body=[
   F(["Claude writes a short, chunk-specific context: about 50–100 tokens","it situates the chunk within the whole document","prepend it to the chunk, then index"],["generate","situates","prepend"],y=380,hot=[2])]),
 dict(slug="two",label="5.4 · contextual retrieval",head=["two sub-techniques"],body=[
   COLS(("contextual embeddings","embed the contextualised chunk",""),("contextual bm25","lexical index on the contextualised chunk",""),["embeddings:","BM25:"])]),
 dict(slug="results",label="5.4 · the results",head=["the results"],body=[
   dict(k="stat",t="49%",s="fewer failed retrievals: contextual embeddings + contextual BM25",cue="49%",y=320),
   dict(k="stat",t="67%",s="with reranking added",cue="67%",y=540,hot=True),
   C(["prompt caching keeps it cheap"],["cheap,"],y=790,label="and")]),
],
"06":[
 dict(slug="embeddings",label="5.5 · hybrid search and reranking",head=["embeddings"],body=[
   COLS(("what they capture","meaning","“cancel my plan” ≈ “terminate subscription”"),("what they can miss","exact tokens",""),["captures","miss"],hot=[1])]),
 dict(slug="bm25",label="5.5 · hybrid search and reranking",head=["bm25"],body=[
   C(["TS-999","clause numbers","SKU codes","names"],["TS-999.","Clause","SKU","names."],y=380,mono=True,label="exact words and identifiers"),
   R([dict(n="→",t="lexical search matches exact words")],["Lexical"],y=640)]),
 dict(slug="hybrid",label="5.5 · hybrid search",head=["hybrid search"],body=[
   F(["run embeddings and BM25","merge with rank fusion","the default for corpora with identifiers"],["both.","merge","default"],y=380,hot=[2])]),
 dict(slug="reranking",label="5.5 · reranking",head=["reranking"],body=[
   F(["retrieve a wider candidate set: top 150","a reranker picks the best: top 20","a small latency and cost, better precision"],["wider","reranker","adds"],y=380,hot=[1])]),
],
"07":[
 dict(slug="matching",label="5.6 · matching retrieval to the data",head=["which fits which"],body=[
   C(["the data shape","the query pattern"],["shape,","pattern."],y=360,label="it depends on",fs=54),
   dict(k="stat",t="9",s="pairings, taken in groups",cue="nine",y=620)]),
 dict(slug="prose-ids",label="5.6 · matching retrieval to the data",head=["prose and identifiers"],body=[
   MATCH([["unstructured prose","conceptual questions","hybrid + rerank"],["documents with identifiers","“what does clause 14.3(b) say?”","BM25, or direct lookup by ID"]],["prose,","identifiers."])]),
 dict(slug="tables-graphs",label="5.6 · matching retrieval to the data",head=["tables and graphs"],body=[
   MATCH([["structured tables, warehouse data","“Q3 revenue by region”","text-to-SQL or a query API tool, not vector search"],["entities and relationships","“which suppliers share a parent company?”","graph database, structured traversal"]],["structured","entities"])]),
 dict(slug="code-live",label="5.6 · matching retrieval to the data",head=["code and live data"],body=[
   MATCH([["code repositories","“where is auth handled?”","agentic search: grep, glob, read"],["fast-changing data","current state","a live API or tool call, not an index"]],["code","fast-changing"])]),
 dict(slug="hops-time-access",label="5.6 · matching retrieval to the data",head=["hops, time and access"],body=[
   MATCH([["multi-hop questions","several facts combined","query decomposition, agentic retrieval"],["time-sensitive documents","“latest policy”","date and version filters, freshness boost"],["mixed-access content","any query, per user","permission filters at retrieval"]],["multi-hop","time-sensitive","mixed-access"])]),
 dict(slug="key-idea",label="5.6 · the key idea",head=["a classic wrong answer"],body=[
   dict(k="quote",t="vector search over spreadsheets",cue="Vector",y=360),
   R([dict(n="→",t="numbers and aggregations need structured queries")],["Numbers"],y=640,hot=[0])]),
],
"08":[
 dict(slug="cand-chunks",label="5.7 · accuracy vs latency",head=["candidates and chunks"],body=[
   TRADE([["candidates","wider set + rerank","narrow top-k, no rerank"],["chunks to Claude","enough to cover the answer","fewer chunks"]],["candidates,","chunks"])]),
 dict(slug="query-mode",label="5.7 · accuracy vs latency",head=["query and mode"],body=[
   TRADE([["query processing","rewrite or decompose with an LLM call","use the raw query"],["retrieval mode","agentic, multi-step","single-shot"]],["query","retrieval"])]),
 dict(slug="model-fresh",label="5.7 · accuracy vs latency",head=["model and freshness"],body=[
   TRADE([["model","higher tier or effort for synthesis","smaller model"],["index freshness","real-time updates","scheduled batch re-index"]],["model.","freshness."])]),
 dict(slug="budget",label="5.7 · an example",head=["the budget decides"],body=[
   COLS(("customer-facing chatbot","2-second budget","can't afford three LLM calls plus agentic retrieval"),("overnight compliance review","can afford it","three LLM calls plus agentic retrieval"),["chatbot","overnight"],hot=[0])]),
],
"09":[
 dict(slug="question",label="5.8 · diagnosing RAG failures",head=["sample question 3"],body=[
   R(N("confident but wrong answers","right after a document refresh","model and latency unchanged"),["confident","refresh.","unchanged."],y=360)]),
 dict(slug="answer",label="5.8 · diagnosing RAG failures",head=["check the index"],body=[
   R(N("a broken re-index","stale chunks","mismatched embedding models","the trigger touched the index, not the model"),["broken","stale","mismatched","trigger,"],y=340,hot=[3])]),
 dict(slug="finding-using",label="5.8 · symptoms",head=["finding and using"],body=[
   SYM([["right document exists, never retrieved","chunking split the answer; no lexical search for identifiers; embeddings mismatch"],["retrieved, but the answer ignores it","too many noisy chunks; weak grounding; key chunk buried in the middle"]],["exists,","ignores"])]),
 dict(slug="stale-leak",label="5.8 · symptoms",head=["stale, leaking, untested"],body=[
   SYM([["outdated answers","stale index; no version or date filter"],["answers leak restricted information","no permission filter at retrieval"],["good on the test set, poor in production","the eval set doesn't reflect real queries"]],["Outdated","leak","test"])]),
 dict(slug="measure",label="5.8 · measure separately",head=["finding or using?"],body=[
   C(["recall@k","precision@k"],["Recall","precision"],y=380,mono=True,label="measure retrieval separately from generation"),
   R([dict(n="→",t="is the problem finding the information, or using it?")],["whether"],y=640,hot=[0])]),
],
"10":[
 dict(slug="why",label="5.9 · observability at scale",head=["why monitoring isn't enough"],body=[
   C(["non-deterministic","multi-step"],["non-deterministic,","multi-step."],y=380,label="LLM systems are"),
   R([dict(n="→",t="you need to see what the model saw and did")],["need"],y=640,hot=[0])]),
 dict(slug="basics",label="5.9 · what to log",head=["log the basics"],body=[
   R([dict(n="01",t="who and when",s="request ID, user or tenant, timestamp"),dict(n="02",t="what ran",s="prompt template and version; model and version; effort, max_tokens")],["basics.","template"],y=360)]),
 dict(slug="happened",label="5.9 · what to log",head=["log what happened"],body=[
   R(N("retrieved chunk IDs and their scores","each tool call: inputs, outputs, latency, errors","token usage and a latency breakdown"),["retrieved","tool","Token"],y=360)]),
 dict(slug="outcome",label="5.9 · what to log",head=["log the outcome"],body=[
   C(["output","safety-screen results","user feedback","escalation flag"],["output,","safety-screen","feedback,","escalation"],y=420,fs=54)]),
 dict(slug="tracing",label="5.9 · tracing",head=["tracing"],body=[
   F(["each model call and tool call is a span","spans make up a trace","replay the run, find the failing step"],["span","trace,","replayed,"],y=380,hot=[2])]),
 dict(slug="metrics-sampling",label="5.9 · monitoring strategies",head=["metrics and sampling"],body=[
   R(N("aggregate metrics and alerts","latency percentiles, errors, cost, cache hits","sampling: random sample plus flagged cases"),["First,","Think","Second,"],y=360)]),
 dict(slug="eval-drift",label="5.9 · monitoring strategies",head=["evaluation and drift"],body=[
   R(N("online evaluation: LLM judge on samples","drift detection: topics, length, refusals","clustering to find new failure categories"),["Third,","Fourth,","fifth,"],y=360)]),
 dict(slug="challenges",label="5.9 · the challenges",head=["what the exam may name"],body=[
   R(N("volume: millions of interactions","non-determinism: same input, different output","privacy: logs hold PII and PHI","cost of storing full transcripts","multi-agent traces spanning many calls"),["Volume:","Non-determinism:","Privacy:","cost","multi-agent"],y=330,hot=[2])]),
],
"11":[
 dict(slug="traps",label="5.10 · exam traps",head=["four exam traps"],body=[
   R(N("blame the model when retrieval is the cause","vector search for identifiers or aggregates","raising top-k to fix poor precision","full PHI transcripts, no redaction or retention"),["First:","Second:","Third:","fourth:"],y=340)]),
 dict(slug="self-check",label="self-check",head=["self-check"],body=[
   R(N("two indexes, and what's prepended?","error E-4471 fails, concepts work: the fix?","which metric: finding or using?","four fields to log for an agent run","when would you skip RAG?"),[["Question",0],["Question",1],["Question",2],["Question",3],["Question",4]],y=330)]),
 dict(slug="answers",label="self-check · answers",head=["answers"],body=[
   R(N("contextual embeddings + contextual BM25","add BM25 or hybrid retrieval","recall@k and precision@k on labelled queries","prompt, model, chunk IDs, tool calls, tokens","the knowledge base fits in context: ~200K"),["one:","Two:","Three:","Four:","Five:"],y=330,hot=[0])]),
],
}
TRACK=["Need","Pipeline","Chunks","Context","Hybrid","Shapes","Trade-offs","Debug","Observe","Traps"]
TRACKMAP={"02":0,"03":1,"04":2,"05":3,"06":4,"07":5,"08":6,"09":7,"10":8,"11":9}
