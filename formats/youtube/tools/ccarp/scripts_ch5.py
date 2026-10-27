# Writes segments/NN/script.md for CCAR-P Chapter 5 (spoken layer with pause markers; display layer derived via lexicon).
# usage: CCARP_DIR=<dir>/ python3 scripts_ch5.py
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
   ("Let's talk about retrieval, and how to see what your system is doing.",["h001"])]),
 ("the problem","definition card",None,[
   ("Picture this. {beat} Your system gives a wrong answer in production. What do you blame?",["p002"]),
   ("Most of the time, you'll blame the model. {beat} But most of those incidents are really retrieval incidents.",["p002"]),
   ("So the exam expects two things from you. {pause} Design retrieval carefully. And instrument your system well enough to tell the difference.",["p002"])]),
 ("what you'll be able to do","decomposition",None,[
   ("So here's where we're headed. {beat} You'll design a R A G pipeline, with the right chunking and indexing.",["p003"]),
   ("You'll match retrieval strategies to the data shape and the query pattern. {beat} And you'll weigh accuracy against latency.",["p003"]),
   ("Finally, you'll analyze the observability challenges, and pick monitoring strategies that work at scale. {pause} But first, a question. Do you need R A G at all?",["p003"])]),
]
S["02"]=[
 ("what RAG is","definition card",None,[
   ("Let's start with the question most people skip. {pause} Do you need R A G at all?",["p005"]),
   ("R A G, retrieval-augmented generation, fetches relevant knowledge at query time. {beat} Then it puts that knowledge in the prompt.",["p005"])]),
 ("the simpler option","staged flow",None,[
   ("Before you build it, check the simpler option. {beat} Anthropic's Contextual Retrieval post makes a point. If your knowledge base is small enough, you can skip retrieval.",["p005"]),
   ("They cite under roughly two hundred thousand tokens. {beat} In that case, include the whole thing in the prompt, and use prompt caching to make it fast and affordable.",["p005"])]),
 ("when RAG is right","decomposition",None,[
   ("So when is R A G the right tool? {pause} Three situations.",["p005"]),
   ("The knowledge base is too large for the window. {beat} Or the content changes often. Or you need per-user access filtering.",["p005"])]),
]
S["03"]=[
 ("two halves","split panel",None,[
   ("Now, how does the pipeline actually work? {pause} Think of two halves.",["p007","p008"]),
   ("Ingestion happens offline. {beat} And the query side happens online.",["p007","p008"])]),
 ("extract and clean","staged flow",None,[
   ("Now, ingestion starts with extraction. {beat} You pull the text out of your sources, like P D F files, web pages, or tickets. And you preserve the structure: headings, tables, lists.",["p007"]),
   ("Then you clean it. {beat} Remove boilerplate, navigation, and duplicate content.",["p007"])]),
 ("chunk, enrich, index","staged flow",None,[
   ("Next, chunk the text into retrievable units. {beat} We'll look at how in the next section.",["p007"]),
   ("Then enrich each chunk with metadata: where it came from, its date and version, and its access-control labels. {beat} You can contextualise the chunks here, too.",["p007"]),
   ("And finally, index. {pause} You create embeddings, which are dense vectors, and a lexical index called B M twenty-five. Store both with their metadata.",["p007"])]),
 ("query and retrieve","staged flow",None,[
   ("Now, the query side. {pause} It starts with query processing. You can optionally rewrite, expand, or decompose the user's query.",["p008"]),
   ("Then retrieve. {beat} Run semantic and lexical search, filtered by metadata and by the user's permissions.",["p008"])]),
 ("fuse, rerank, generate","staged flow",None,[
   ("Next, fuse. {pause} Combine the results and remove duplicates, using rank fusion.",["p008"]),
   ("Then rerank. {beat} A reranking model scores the candidates for true relevance, and you keep the top few.",["p008"]),
   ("Then generate. Claude answers from the retrieved chunks, with grounding instructions and citations.",["p008"]),
   ("And optionally, verify. {beat} Check that the citations exist, and that they support the claims.",["p008"])]),
 ("maintenance","definition card",None,[
   ("And the pipeline isn't finished once it's built. {pause} Maintenance matters.",["p009"]),
   ("Re-index when documents change. Version your indexes. And monitor retrieval quality.",["p009"]),
   ("And when a source is deleted, delete its content too. {beat} That's important for G D P R erasure.",["p009"])]),
]
S["04"]=[
 ("six strategies","decomposition",None,[
   ("Now, chunking. {pause} How you split your documents decides what you can retrieve.",["p011"]),
   ("There are six common strategies, and each one has its own risk.",["p011"])]),
 ("fixed and structure-aware","comparison table",None,[
   ("First, fixed-size chunks. {beat} Every fixed number of tokens, with a small overlap. It's a quick start, and it works for uniform prose. But it splits mid-thought, and loses headings.",["p011"]),
   ("Second, structure-aware chunking. {beat} Split on headings, sections, clauses, or paragraphs. It's best for policies, contracts, manuals, and docs. The risk is uneven sizes.",["p011"])]),
 ("semantic and hierarchical","comparison table",None,[
   ("Third, semantic chunking. {pause} You split where the topic shifts. It suits long narrative text, but costs more compute to build.",["p011"]),
   ("Fourth, hierarchical, or parent-child. {beat} You retrieve small chunks, but return their larger parent section. So you get a precise match, with enough context. The risk is a more complex store.",["p011"])]),
 ("document-level and specialised","comparison table",None,[
   ("Now, fifth, document-level. {beat} The whole document is the unit. That's good for short documents, like FAQs and tickets. But it's wasteful for long ones.",["p011"]),
   ("And sixth, specialised chunking. {pause} Code is split by function or class. Tables go in as rows, or as whole tables. That needs custom parsers.",["p011"])]),
 ("rules of thumb","definition card",None,[
   ("So where do you start? {pause} Chunks of a few hundred tokens are a common starting point.",["p012"]),
   ("Keep headings and metadata with each chunk. {beat} And test chunk size against your eval set, rather than guessing.",["p012"])]),
]
S["05"]=[
 ("the problem","worked example","chapter",[
   ("Now, Anthropic's method, Contextual Retrieval. {pause} Let's start with the problem, through an example.",["p014"]),
   ("Imagine a chunk that says: the company's revenue grew by three percent over the previous quarter. {pause} Which company? {beat} Which quarter?",["p014"]),
   ("The chunk has lost that. {beat} And traditional R A G embeds that orphaned chunk, so retrieval fails.",["p014"])]),
 ("the fix","staged flow",None,[
   ("Now, the fix is to add context, before you index. {beat} You use Claude to generate a short, chunk-specific context, typically fifty to one hundred tokens.",["p015"]),
   ("It situates the chunk within the whole document. {beat} And you prepend it to the chunk.",["p015"])]),
 ("two sub-techniques","split panel",None,[
   ("So that gives you two sub-techniques. {pause} Contextual embeddings: you embed the contextualised chunk.",["p015"]),
   ("And contextual B M twenty-five: you build the lexical index on the contextualised chunk.",["p015"])]),
 ("the results","staged flow",None,[
   ("So does it work? {beat} Anthropic reports that contextual embeddings plus contextual B M twenty-five reduced failed retrievals by forty-nine percent.",["p016"]),
   ("Adding reranking brought the reduction to sixty-seven percent.",["p016"]),
   ("And it's cheap, because of prompt caching. {beat} The full document is cached, while each chunk's context is generated.",["p016"])]),
]
S["06"]=[
 ("embeddings","worked example","chapter",[
   ("Now, hybrid search and reranking. {pause} Start with embeddings. {beat} Semantic search captures meaning. Cancel my plan, for example, is close to terminate subscription.",["p018"]),
   ("But embeddings can miss exact tokens.",["p018"])]),
 ("BM25","staged flow",None,[
   ("That's where B M twenty-five comes in. {pause} Lexical search matches exact words and identifiers.",["p018"]),
   ("Error codes, like T S nine nine nine. Clause numbers. S K U codes. And names.",["p018"])]),
 ("hybrid","definition card",None,[
   ("So run both. {beat} Then merge the results with rank fusion. That's hybrid search.",["p018"]),
   ("It's the default recommendation for enterprise corpora that contain identifiers.",["p018"])]),
 ("reranking","staged flow",None,[
   ("Then there's reranking. {pause} You retrieve a wider candidate set cheaply, say the top one hundred fifty. {beat} Then a reranker model picks the best, say the top twenty.",["p018"]),
   ("It adds a small latency and cost. {beat} But it improves precision, so fewer, better chunks reach Claude.",["p018"])]),
]
S["07"]=[
 ("the matching question","definition card",None,[
   ("Now, the big matching question. {pause} Which retrieval strategy fits which data? {beat} It depends on the data shape, and the query pattern.",["p020"]),
   ("There are nine pairings. {beat} We'll go through them in groups.",["p020"])]),
 ("prose and identifiers","comparison table","chapter",[
   ("First, unstructured prose, like policies and articles, with conceptual questions. {beat} Use hybrid search, with reranking.",["p020"]),
   ("Second, documents with identifiers. {pause} Let's look at it through an example: what does clause fourteen point three B say?",["p020"]),
   ("Use B M twenty-five, or look it up directly by I D.",["p020"])]),
 ("tables and graphs","comparison table","chapter",[
   ("Third, structured tables and warehouse data. {pause} Think of aggregations and filters, like Q three revenue by region. Use text-to-S Q L, or a query A P I tool. {beat} Not vector search.",["p020"]),
   ("Fourth, entities and relationships. {beat} A question like: which suppliers share a parent company? Use a graph database, or structured traversal.",["p020"])]),
 ("code and live data","comparison table","chapter",[
   ("Now, fifth, code repositories. {pause} A question like: where is auth handled? Use agentic search, with grep, glob, and read. That's just-in-time retrieval.",["p020"]),
   ("Sixth, fast-changing data. {beat} Think inventory, prices, or ticket status. Use a live A P I or tool call, not an index.",["p020"])]),
 ("hops, time and access","comparison table",None,[
   ("Now, seventh, multi-hop questions. {pause} They need several facts combined. Use query decomposition, or iterative, agentic retrieval.",["p020"]),
   ("Eighth, time-sensitive documents, like the latest policy. {beat} Use metadata filters on date and version, and boost freshness.",["p020"]),
   ("And ninth, mixed-access content. {beat} Whatever the query, apply permission filters at retrieval time.",["p020"])]),
 ("the key idea","definition card",None,[
   ("Here's the key idea. {pause} Vector search over spreadsheets is a classic wrong answer. {beat} Numbers and aggregations need structured queries.",["p021"])]),
]
S["08"]=[
 ("candidates and chunks","comparison table",None,[
   ("Now, accuracy versus latency in retrieval. {pause} Every decision pulls two ways.",["p023"]),
   ("For candidates, a wider set with reranking is more accurate. A narrow top K, with no rerank, is faster and cheaper.",["p023"]),
   ("And for the chunks sent to Claude, enough to cover the answer is more accurate. Fewer chunks is cheaper.",["p023"])]),
 ("query and mode","comparison table",None,[
   ("Next, query processing. {beat} Rewriting or decomposing with an L L M call is more accurate. Using the raw query is faster.",["p023"]),
   ("And the retrieval mode? {beat} Agentic, multi-step retrieval is more accurate. Single-shot retrieval is faster.",["p023"])]),
 ("model and freshness","comparison table",None,[
   ("Then the model. {pause} A higher tier or effort for synthesis is more accurate. A smaller model is cheaper.",["p023"]),
   ("And index freshness. {beat} Real-time updates are more accurate. A scheduled batch re-index is cheaper.",["p023"])]),
 ("the SLA","worked example","chapter",[
   ("So how do you justify a choice? {pause} With the S L A. Let's look at it through an example.",["p024"]),
   ("A customer-facing chatbot with a two-second budget can't afford three L L M calls for query rewriting, plus agentic retrieval.",["p024"]),
   ("{beat} An overnight compliance review can.",["p024"])]),
]
S["09"]=[
 ("the question","worked example","chapter",[
   ("Now, diagnosing R A G failures. {pause} Let's look at it through an example. This is official Sample Question three.",["p026"]),
   ("A R A G system gives confident but wrong answers, right after a document refresh. {beat} The model and the latency are unchanged.",["p026"])]),
 ("the answer","staged flow","chapter",[
   ("So where do you look first? {think} The retrieval and indexing step.",["p026"]),
   ("Think of a broken re-index, stale chunks, or mismatched embedding models. {beat} The trigger, the document refresh, touched the index. Not the model.",["p026"])]),
 ("finding and using","comparison table",None,[
   ("Now, a field guide to symptoms. {pause} The right document exists, but it's never retrieved? {beat} Chunking may have split the answer. Or you're missing lexical search for identifiers. Or the embeddings mismatch.",["p027"]),
   ("Retrieved, but the answer ignores it? {beat} Too many noisy chunks. Weak grounding instructions. Or the key chunk is buried in the middle.",["p027"])]),
 ("stale, leaking, untested","comparison table",None,[
   ("Outdated answers? {pause} Suspect a stale index, or no version or date filter.",["p027"]),
   ("Answers that leak restricted information? {beat} There's no permission filter at retrieval.",["p027"]),
   ("Good on the test set, but poor in production? {beat} Your eval set doesn't reflect real queries.",["p027"])]),
 ("measure separately","definition card",None,[
   ("Finally, how do you tell finding from using? {pause} Measure retrieval separately from generation.",["p028"]),
   ("Recall at K, and precision at K, on labelled queries. {beat} They tell you whether the problem is finding the information, or using it.",["p028"])]),
]
S["10"]=[
 ("why","definition card",None,[
   ("Now, observability at scale. {pause} Why isn't normal monitoring enough? {beat} Because L L M systems are non-deterministic, and multi-step.",["p030"]),
   ("Traditional uptime monitoring doesn't tell you what the model saw, or what it did. {beat} And that's what you need to see.",["p030"])]),
 ("log the basics","staged flow",None,[
   ("So what do you log for every request? {pause} Start with the basics. A request I D, the user or tenant, and a timestamp.",["p031"]),
   ("Then the prompt template and its version. {beat} The model and its version, and the parameters, like effort and max tokens.",["p031"])]),
 ("log what happened","staged flow",None,[
   ("Then log what the system did. {beat} The retrieved chunk identifiers, and their scores. Each tool call, with its name and inputs. Then its outputs, latency, and errors.",["p031"]),
   ("Token usage, including the cache creation and cache read fields. {beat} And a latency breakdown: retrieval, time to first token, and total.",["p031"])]),
 ("log the outcome","definition card",None,[
   ("And finally, the outcome. {pause} The output, the safety-screen results, user feedback, and an escalation flag.",["p031"])]),
 ("tracing","staged flow",None,[
   ("How do you debug a multi-step run? {beat} With tracing.",["p032"]),
   ("Represent each model call and tool call as a span in a trace, open telemetry style. {pause} Then a multi-agent run can be replayed, and you can find the failing step.",["p032"])]),
 ("metrics and sampling","staged flow",None,[
   ("But what if you can't read every conversation? {pause} You need monitoring strategies.",["p033"]),
   ("First, aggregate metrics and alerts. {beat} Think of latency percentiles, error rates, and cost per request.",["p033"]),
   ("And add cache hit rate, refusal rate, escalation rate, and tool error rate.",["p033"]),
   ("Second, sampling. {beat} Route a random sample, plus all flagged cases, to automated graders and human review.",["p033"])]),
 ("evaluation and drift","staged flow",None,[
   ("Third, online evaluation. {pause} Use L L M as judge on sampled production traffic, and track quality scores over time.",["p033"]),
   ("Fourth, drift detection. {beat} Watch for shifts in input topics, output length, and refusal patterns, after model or data changes.",["p033"]),
   ("And fifth, clustering and analysis tools, to find emerging failure categories across many conversations.",["p033"])]),
 ("the challenges","decomposition",None,[
   ("Now, the challenges the exam may name. {pause} Volume: millions of interactions. {beat} Non-determinism: the same input, different output.",["p034"]),
   ("Privacy: logs contain P I I and P H I. So you redact, restrict access, and set retention.",["p034"]),
   ("Then there's the cost of storing full transcripts. {beat} And multi-agent traces that span many calls.",["p034"])]),
]
S["11"]=[
 ("four exam traps","decomposition",None,[
   ("Before you go, watch for four exam traps. {pause} First: blaming or upgrading the model, when a trigger points to retrieval.",["p036"]),
   ("Second: vector search for exact identifiers, or tabular aggregates.",["p036"]),
   ("Third: increasing top K, as the fix for poor precision.",["p036"]),
   ("And fourth: logging full transcripts, including P H I, with no redaction or retention policy.",["p036"])]),
 ("the self-check","staged flow",None,[
   ("Now, let's check yourself. {pause} Take your time with these. {beat} Question one: what two indexes does Contextual Retrieval build, and what's prepended to each chunk? {think}",["p038"]),
   ("Question two: a question about error E forty-four seventy-one fails, but conceptual questions work. What's the fix? {think}",["p038"]),
   ("Question three: which metric tells you whether R A G failed at finding the information, or at using it? {think}",["p038"]),
   ("Question four: name four fields you must log to debug an agent run. {think}",["p038"]),
   ("And question five: when would you skip R A G entirely? {think} Ready? {beat} Here's how you did.",["p038"])]),
 ("the answers","definition card",None,[
   ("So, one: contextual embeddings, and contextual B M twenty-five. {beat} And what's prepended is a short context, generated by an L L M, that situates the chunk in its document.",["p039"]),
   ("Two: add B M twenty-five, or hybrid retrieval, for exact match.",["p039"]),
   ("Three: retrieval recall at K, and precision at K, on labelled queries, measured separately from answer quality.",["p039"]),
   ("Four: any four of these. {beat} The prompt version, the model version, and the retrieved chunk identifiers. Tool calls with their inputs and outputs. Token usage, the latency breakdown, or the output.",["p039"]),
   ("Five: when the whole knowledge base fits comfortably in context, roughly under two hundred thousand tokens, per Anthropic. {beat} Include it, and cache it.",["p039"]),
   ("That's chapter five. {beat} Check whether you need R A G at all. Match retrieval to the data. And log enough to see what your system did. {pause} See you in the next one.",["p005","p020","p030"])]),
]
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),"writer_tail.py")).read())
