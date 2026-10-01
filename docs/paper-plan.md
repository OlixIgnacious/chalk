# Paper plan: grounded lesson generation

Companion to [research-landscape.md](research-landscape.md). Working title and thesis are drafts.

**Working title:** *Every Claim Has a Source: Evaluating Faithfulness in LLM-Generated Educational Videos*

**Thesis:** Existing educational-video agents (Code2Video, TheoremExplainAgent and others) are evaluated on aesthetics and on quiz gain, while the LLM writes the content unconstrained. Faithfulness to a given source text is unmeasured. We contribute (1) a claim-level faithfulness benchmark and metrics for chapter-to-lesson generation, and (2) chalk, a grounded pipeline, as a system that scores well on them.

**Contribution order matters.** The benchmark and metrics are the paper; chalk is the vehicle. If the metrics don't separate chalk from baselines, there is still a paper about the measurement; if they do, there is a system result too.

## 1. Research questions

- **RQ1.** How often do existing topic-to-video agents emit claims unsupported by, or contradicting, a given source chapter?
- **RQ2.** Does enforcing block-level grounding (and refusing low-confidence equations) reduce unsupported claims and equation errors, and at what cost to teaching effectiveness?
- **RQ3.** Does a source-derived TeachQuiz-style delta agree with faithfulness, or can a video be faithful and teach nothing (or the reverse)?
- **RQ4 (optional ablation).** HTML/SVG-first vs Manim-everywhere: effect on cost, repair rate and edit-ability.

## 2. Benchmark

### Source chapters
- Public-domain only, per the project rule. Seed with the existing fixtures: `gutenberg-chapter.md` (~5.7k words), `gutenberg-math-chapter.md` (~2k words, LaTeX-exact notation from *Calculus Made Easy*).
- Target 20–30 chapters across: math with heavy notation, prose-heavy science, narrative non-fiction, and at least a few PDF-extracted chapters (messy notation) alongside the clean-LaTeX ones. The PDF versions test equation fidelity; the LaTeX versions give ground truth.
- Needs ground-truth block structure: reuse `chapter.json` ids (`p041`, equations with `latex` and `confidence`).

### Annotation
- **Claim units:** split each system's narration and on-screen text into atomic claims.
- **Labels per claim:** `supported` (entailed by cited or any source block), `scaffolding` (illustrative, not presented as sourced), `unsupported` (new fact, number, date, example, entity, citation), `contradicted`, `distorted` (e.g. hedge upgraded to flat assertion; fidelity.md already names this).
- **Equations:** compare rendered equation to ground-truth LaTeX; label `exact`, `equivalent`, `wrong`.
- **Process:** LLM judge for first pass; human adjudication on a stratified sample (at least 15–20% plus all disagreements). Report judge-human agreement (Cohen's kappa). Without this, the metric is not credible.

## 3. Metrics

| Metric | Definition | Notes |
|---|---|---|
| **Unsupported-claim rate (UCR)** | unsupported + contradicted claims / all non-scaffolding claims | Headline faithfulness number |
| **Distortion rate** | distorted claims / supported-topic claims | Catches hedge-stripping |
| **Attribution precision** | claims whose cited ids actually entail them / claims with citations | Only defined for systems that cite; chalk's `source:` field makes this checkable, baselines get 0 or N/A |
| **Equation error rate (EER)** | wrong equations / rendered equations | Plus *refusal rate*: equations the system declined to render when uncertain, reported separately so refusing isn't free |
| **Coverage** | source objectives (or key claims) covered / total | Guards against a system that is faithful because it says little |
| **Source-derived TeachQuiz Δ** | quiz built from source blocks; score(video + unlearn prompt) minus score(unlearn prompt) | See caveat below |
| **Cost** | tokens, wall-clock, render failures per segment | Mirrors Code2Video's efficiency axis |

**TeachQuiz caveat to state in the paper.** Code2Video's "unlearning" is a prompt telling the model to pretend ignorance (confirmed in `eval_TQ.py`), with a heuristic success check. For a defensible version: use source-derived questions, add a no-video control, and verify unlearning by checking the pre/post-prompt score drop is real rather than assuming it. Treat the VLM as a proxy learner and say so. A human study (even small, but larger than 8 per cell) is the strongest addition.

## 4. Systems compared

1. **Code2Video** (topic string input; give it the chapter title/topic, plus a variant where the chapter text is pasted into its prompt, to be fair to it).
2. **Ludium Video** (accepts a chapter directly).
3. **Direct LLM to Manim** with chapter text in the prompt (no agents, no grounding rules).
4. **chalk** full.
5. **chalk ablations:** no `source:` enforcement; no equation-confidence gate; Manim for every scene (RQ4); no human gate (the review step is manual, so decide up front whether to report this or fix the review process to a scripted reviewer for the benchmark).

Fairness notes to settle before running: same LLM family and budget where possible; same TTS or no-audio comparison (many baselines are silent or differently voiced, so faithfulness should be scored on the script/on-screen text, not the audio); fixed seeds or N runs per chapter with variance reported.

## 5. Experiments and what each shows

- **E1: Main comparison** (all systems × all chapters): UCR, distortion, EER, coverage, Δ, cost. Answers RQ1–RQ2.
- **E2: Equation stress test** (PDF-extracted vs clean-LaTeX chapters): EER and refusal rate with and without the confidence gate. This is the "worst failure" experiment and likely the strongest single result.
- **E3: Metric validity:** correlation between UCR and Δ; show whether faithful and effective diverge (RQ3). Also judge-human agreement.
- **E4: Ablations:** which chalk rule buys the faithfulness (grounding enforcement vs equation gate vs tier routing).
- **E5 (optional): audio-as-clock.** Count audible discontinuities per minute (silence-gap and truncated-word detection from the waveform) for frame-duration-equals-narration vs padded frames. Small, concrete, probably an appendix or a short section.
- **E6 (optional, needs participants):** learner study on a subset.

## 6. Paper outline (workshop length, ~6–8 pages)

1. **Introduction.** The gap: educational-video agents optimise aesthetics and quiz gain; nobody measures whether the lesson says what the book says. Contributions list.
2. **Related work.** Code2Video, TheoremExplainAgent, LLM2Manim, SGA, Paper2Video and PresentAgent, Ludium and commercial tools. Also grounded generation and attribution metrics from the NLP literature (to be searched properly; this has not been surveyed yet).
3. **Grounded lesson generation (chalk).** Pipeline, grounding invariant, equation gate, audio-as-clock, tier routing. Short, because it is the vehicle.
4. **Benchmark and metrics.** Chapters, annotation protocol, metric definitions, judge validation.
5. **Experiments.** E1–E5.
6. **Discussion and limitations.** VLM-as-learner proxy, LLM-judge bias, public-domain chapters skew old, human-gated pipeline vs fully automatic baselines, small scale.
7. **Conclusion.**

## 7. Risks

- **Fairness of baselines.** Code2Video is not designed to take a chapter. Reviewers will check that you gave it a fair chance. Run both the topic-only and chapter-pasted variants.
- **Human gate.** chalk stops for the user at step 3. A comparison with fully automatic baselines needs either a scripted reviewer or an explicit "with human review" label.
- **LLM-judge circularity.** Judge and generator from the same model family can inflate scores. Use a different family for judging and report agreement with humans.
- **Old public-domain text.** Limits modern notation and topics; say so.
- **Novelty claim.** A literature pass is done in [literature-pass.md](literature-pass.md): claim-level faithfulness already exists for slides and text, and a 2026 paper evaluates paper-to-video talks. Do not claim faithfulness is "unmeasured"; claim the extension to animated chapter lessons, on-screen elements and equations. Re-read the closest papers in full first.
- **Engineering as contribution.** If the metrics don't discriminate, the paper collapses to a system description. Run a pilot (below) before committing.

## 8. Pilot before committing (about 1–2 days of work)

1. Run chalk on both fixtures and a Code2Video baseline (chapter-pasted variant) on the same two chapters.
2. Extract claims from each output; label ~100 claims by hand.
3. Compute UCR and EER. If chalk is clearly better and the labels are tractable, proceed. If the gap is small or labelling is a mess, reconsider.

## 9. Open decisions for you

- Target venue and deadline (drives scale: workshop vs main track).
- Whether to include a learner study.
- Whether chalk gets a scripted reviewer for the benchmark.
- Who annotates (you alone, plus an LLM judge, or recruit one more annotator for agreement).
- Authorship and whether to publish the benchmark and code (the repo is Apache-style vendored in places; check `CREDITS.md` for licensing before release).
