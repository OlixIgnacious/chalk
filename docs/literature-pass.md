# Literature pass: faithfulness and attribution

Date: 2026-10-01. Companion to [paper-plan.md](paper-plan.md). Purpose: test the claim that "nobody measures faithfulness to a source in educational video generation" and find methods to reuse.

Method: six web searches plus three abstract fetches. Search is US-only and abstract-level. **Nothing here was read in full**, and several details below come from search snippets. Verify against the papers before citing.

## Verdict on the novelty claim

**The claim as stated is too strong and should not be made.** Claim-level faithfulness evaluation already exists for slides and for LLM text generally, and a 2026 paper evaluates paper-to-video talks against their source. What I did *not* find is claim-level faithfulness evaluation for **animated, narrated lesson videos generated from a book chapter** (Code2Video, TheoremExplainAgent and Ludium-style systems), with attribution of on-screen elements and equation fidelity. That narrower gap may still be real, but it is a gap in application, not in method. The paper's framing should be "extending claim-level attribution evaluation to animated educational video, plus equations," not "faithfulness is unmeasured."

## What exists

### Attribution and citation evaluation (text)
- **ALCE** ([Gao et al., EMNLP 2023](https://aclanthology.org/2023.emnlp-main.398.pdf)): benchmark for LLM generation with citations. Defines **citation recall and citation precision**, using an NLI model to check whether cited sources entail each statement. Reports that on ELI5 even the best model has 49% of generations lacking complete citation support. Directly relevant: chalk's `source:` ids are the same kind of object, so my "attribution precision" metric should be defined in ALCE's terms and cite it.
- **AIS, Attributable to Identified Sources** (Rashkin et al.): the human-annotation framework that ALCE-style automatic metrics approximate. Cite as the annotation standard.
- Related: AttributionBench, AutoAIS, [CaLM](https://arxiv.org/pdf/2406.05365), [REC](https://arxiv.org/pdf/2411.02448). Not read.

### Atomic-claim factuality
- **FActScore**, **SAFE**, **[VeriScore](https://arxiv.org/html/2406.19276)**: decompose into atomic claims, verify each. Note the cited limitation: FActScore and SAFE treat every sentence as verifiable and so over-penalise; **VeriScore extracts only verifiable claims**. That maps to chalk's scaffolding vs sourced-claim distinction and is a better precedent than inventing the split. These check against Wikipedia or web search, whereas chalk checks against a *given document*, which is a closed-book-source setting like RAG faithfulness.
- Cost note from the search results: decompose-then-verify can take around 100 seconds per response; [VeriFastScore](https://arxiv.org/pdf/2505.16973) and [FaStfact](https://arxiv.org/html/2510.12839) speed it up. Relevant to benchmark budget.

### Faithfulness to a provided document (RAG and summarisation)
- **AggreFact / LLM-AggreFact, RAGTruth, TofuEval, FaithBench** and **[FaithJudge](https://arxiv.org/pdf/2505.04847)** (EMNLP 2025 industry): benchmarks and judges for hallucination against a source. The papers consistently report that current automatic detectors, including LLM-based ones, have limitations; FaithJudge improves agreement by prompting the judge with other human-annotated hallucination examples for the same source. A useful technique for my judge design. Also see [Do Benchmarks Underestimate LLM Performance? (LLM-first, human-adjudicated)](https://arxiv.org/pdf/2605.08462), which matches the LLM-first plus human-adjudication protocol in paper-plan.md and is worth reading for how they justify it.
- Label scheme precedent: FaithJudge uses Benign / Unwanted / Questionable. My five labels (supported, scaffolding, unsupported, contradicted, distorted) are finer; the "distorted" label (hedge upgraded to assertion) overlaps with what one slide-evaluation snippet describes as checking that an explanation "does not contradict, exaggerate, or oversimplify the original claim".

### Slides and presentations from documents
- **PPTAgent** ([EMNLP 2025](https://aclanthology.org/2025.emnlp-main.728.pdf)), SlideGen, DocPres, D2S: slide-generation systems. Search snippets describe evaluation frameworks that extract atomic claims from each slide and trace them to the source, with labels such as supported / weakly supported / unsupported / not verifiable / contradicted and importance-weighted aggregation. **I could not tell which paper those snippets came from**, so do not attribute them yet. If that scheme exists, my label set should be aligned with it.
- **[PresentBench](https://arxiv.org/abs/2603.07244)**: rubric-based slide benchmark with 238 instances and about 54 binary checklist items each. The abstract does not describe claim-level faithfulness (confirmed on fetch).
- **[UniPPTBench](https://arxiv.org/pdf/2605.17356)**, X+Slides: more slide benchmarks, not read.

### Video: closest competitors to the paper
- **[A Good Talk Does not Look Like a Summary, It Teaches You!](https://arxiv.org/abs/2606.28531)** (2026): EffectivePresentationScorer for paper-to-video talks. Measures *explanatory quality*, not just content presence; finds generated videos mention the right topics and follow the paper's structure but fail to explain prerequisites or why the method works. **This is the nearest prior work**: same family (video generated from a source document), evaluated against the source, and it sits next to the TeachQuiz-style axis. Needs a full read. My contribution must be differentiated from it: theirs is explanatory effectiveness for slide-style paper talks; mine would be claim-level faithfulness, attribution and equation fidelity for animated chapter lessons.
- **[EduVideoBench](https://arxiv.org/abs/2605.26918)**: Knowledge-Skills-Attitude benchmark for **pixel video generation models** (five frontier video models). Abstract does not evaluate faithfulness to a source text. Notable finding: "a single misaligned element such as pacing, legibility, or notation can invalidate an otherwise correct video", which supports caring about notation and timing. Different generator class from chalk, so cite as context rather than competitor.
- **ARGUS** ([ICCV 2025](https://openaccess.thecvf.com/content/ICCV2025/papers/Rawal_ARGUS_Hallucination_and_Omission_Evaluation_in_Video-LLMs_ICCV_2025_paper.pdf)), VidHalluc, VBench-2.0: hallucination evaluation for video *understanding* and generation realism. Not about source-grounded teaching content. ARGUS pairs hallucination with **omission**, which supports keeping a Coverage metric.
- **[ALGOGEN](https://arxiv.org/html/2605.12159v1)**: tool-generated verifiable traces for algorithm visualisation. It argues Code2Video-style end-to-end generation induces LLM hallucinations in algorithm flow. Relevant for chalk's Tier 2 (Manim) correctness story and for citing a known failure mode of Code2Video. Not read.
- **[SGA](https://arxiv.org/html/2607.18116)**: geometric verification for educational video synthesis; already in the landscape doc.

### Equation fidelity
- **[Benchmarking Document Parsers on Mathematical Formula Extraction from PDFs](https://arxiv.org/pdf/2512.09874)**: synthetic PDFs with exact LaTeX ground truth, LLM-as-judge for semantic formula equivalence. Reported (search snippet): **LLM judge correlates with human at r=0.78 (250 formula pairs, 750 ratings, 30 raters), versus r=0.34 for character-level matching (CDM) and about 0 for text similarity.** This is the method to borrow for my "exact / equivalent / wrong" equation labels and for the claim that string comparison is not enough. It also gives a clean construction for the equation experiment (E2): render known LaTeX to PDF, extract, compare. Snippet also reports GPT-4o, Mathpix and UniMERNet near 85–87% formula accuracy, which implies a nonzero error rate that a confidence gate should catch. Verify these numbers in the paper.
- OmniDocBench ([CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/papers/Ouyang_OmniDocBench_Benchmarking_Diverse_PDF_Document_Parsing_with_Comprehensive_Annotations_CVPR_2025_paper.pdf)): document parsing benchmark. Not read.

## Implications for paper-plan.md

1. **Reframe the contribution.** Not "faithfulness is unmeasured", but: existing claim-level and attribution metrics (ALCE, VeriScore, FaithJudge-style judging) have not been applied to animated chapter-to-lesson systems, and these systems additionally have non-text carriers of claims (diagrams, on-screen text, equations) and a timing constraint. Say so.
2. **Define metrics in the established vocabulary.** Attribution precision/recall as in ALCE; claim extraction restricted to verifiable claims as in VeriScore, with scaffolding treated like non-verifiable content; judge validated with a FaithJudge-style or LLM-first human-adjudicated protocol.
3. **Equation experiment has a ready template.** Reuse the synthetic-PDF-with-known-LaTeX design and the LLM-judge-for-equivalence method. The novelty is the *refuse-to-render gate* and its refusal-rate/error-rate trade-off, not equation OCR accuracy.
4. **Add a strong baseline or comparison point:** the paper-to-video evaluator (EffectivePresentationScorer) if code is available, and note TeachQuiz-style and explanatory-quality metrics as the "effectiveness" axis that faithfulness complements.
5. **Read in full before drafting related work:** the paper-to-video talks paper (2606.28531), ALCE, VeriScore, FaithJudge, the formula-parser benchmark (2512.09874), and ALGOGEN.
6. **Pin down the slide-faithfulness scheme.** Identify which paper uses the supported / weakly supported / unsupported / not verifiable / contradicted labels so the label set can cite or align with it.

## Still not searched
- Educational-psychology literature on *why* grounding matters to learners (misconceptions from inaccurate videos).
- Non-English and non-US sources.
- Attribution in multimodal output (figure-grounded claims).
- Whether Ludium or any other open-source chapter-to-video tool has published an evaluation.
- Whether the paper-to-video talks paper releases code or a benchmark.

## Risk update
The novelty risk in paper-plan.md is now concrete: the 2026 paper-to-video talks work is close enough that a reviewer will ask how this differs. The pilot should include scoring that paper's output type if feasible, and the introduction must state the difference (animated chapter lessons, claim-level attribution including equations, versus explanatory quality for slide-style talks).
