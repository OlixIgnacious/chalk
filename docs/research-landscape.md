# chalk: prior art and paper feasibility

Notes from a first-pass search (2026-10-01). Not exhaustive: the search tool is US-only and low-profile or very recent repos may be missing. Claims about other projects come from their READMEs and abstracts unless marked as read in code.

## 1. Who else is doing this

### Closest match

**[Ludium Video](https://github.com/Augustinus12835/ludium_video)** (3 stars, MIT)
- Input: lecture, PDF or Markdown book chapter, YouTube URL, PPTX.
- Pipeline: Source → Transcribe → Clean → Segment → per video: Script → Review → TTS → Visuals → Compile → Subtitles. Judgment steps run as Claude Code subagents; deterministic steps in `scripts/pipeline.py`.
- STEM: Manim with SymPy-checked calculations. Humanities: illustrated documentary episodes.
- Has a review step. No sign of block-level source grounding, an interactive lesson page, or learner checkpoints. Only the README was read.

### Adjacent open source (Manim-first, topic or paper in, video out)
- [paper-to-manim-video](https://github.com/prafulsapkota/paper-to-manim-video)
- [paper-explainer-video](https://github.com/AbigaleD/paper-explainer-video) (Claude skills, edge-tts, BGM, Live2D host)
- [MathExplainer](https://github.com/AkiyamaMio9281/MathExplainer) (prompt → validated scene IR → Manim, with repair)
- [manimate_uni](https://github.com/VirajAnand-02/manimate_uni)
- [manim-video-gen](https://github.com/KrishKrosh/manim-video-gen)

### Papers
- [Code2Video](https://arxiv.org/abs/2510.01174): Planner, Coder and Critic agents write Manim. See section 2.
- [TheoremExplainAgent](https://arxiv.org/pdf/2502.19400): theorem explanation videos up to 10 minutes, with a benchmark.
- [LLM2Manim](https://arxiv.org/html/2604.05266): pedagogy-aware STEM animation generation.
- [SGA](https://arxiv.org/html/2607.18116): geometric verification for educational video synthesis.
- [Paper2Video](https://arxiv.org/abs/2510.05096) and [PresentAgent](https://arxiv.org/abs/2507.04036): narrated slide-style videos from papers or long documents, not conceptual animation.

### Commercial
[Scholarly](https://scholarly.so/tools/pdf-to-video), [Leadde](https://leadde.ai/tools/textbook-to-video), [X-Pilot](https://www.x-pilot.ai/products/pdf-to-video), [Brainy Docs](https://brainydocuments.com/). PDF to narrated video with quizzes, mostly slides plus AI voice or avatar. No source traceability seen.

### Where chalk differs
1. Grounding is enforced: every narration line and on-screen text maps to `chapter.json` block ids; unreadable equations are never rendered.
2. Tier 1 is HTML/SVG; Manim only where an equation must visibly become another. Most others are Manim-everywhere.
3. Output is a lesson, not just a video: an MP4 per segment plus `lesson.html` with checkpoints, and a human gate before rendering.
4. The audio is the clock: VO word timings drive scene timing.

## 2. Code2Video deep dive

Repo: [showlab/Code2Video](https://github.com/showlab/Code2Video). Authors: Yanzhe Chen, Kevin Qinghong Lin, Mike Zheng Shou (NUS ShowLab). NeurIPS 2025 DL4C workshop; the repo states ICML 2026 acceptance (not cross-checked). MIT, about 2.1k stars. Cloned locally and the code skimmed.

**Input:** a short topic string, for example "Linear transformations and matrices". No chapter ingestion and no grounding to a text.

### Architecture
| Agent | Job | Technique |
|---|---|---|
| Planner | Topic → outline → storyboard; fetches icons and reference images (IconFinder) | Assets are meant to reduce hallucinated visuals |
| Coder | Storyboard → Manim code, sections synthesised in parallel | ScopeRefine: debug at line, block, then global scope |
| Critic | VLM inspects rendered frames and fixes layout | Visual anchor prompts: 6×6 grid of named anchor points, so the VLM says "move to anchor X" instead of giving pixel coordinates |

Recommended models: Claude-4-Opus (Planner, Coder), Gemini-2.5-pro (Critic). Manim CE 0.19. Run with `run_agent_single.sh --knowledge_point "..."`; evaluate with `eval_TQ.py` and `eval_AES.py`.

### Benchmark and metrics
- **MMMC:** 456 3Blue1Brown tutorial units, 13 disciplines (117 topics in the repo eval set). Full videos average about 17 min, segments about 3.35 min.
- **AES:** VLM judge, five dimensions scored 0 to 100 (layout, attractiveness, logic flow, visual consistency, accuracy and depth).
- **TeachQuiz:** a VLM "unlearns" a concept, watches the video, takes a quiz. Metric = score with video minus score after unlearning.
- **Efficiency:** time and tokens.

### Reported results (authors' numbers, unverified)
- Code2Video with Opus 4.1: 79.0 AES, 86.0 TeachQuiz. Direct code generation: 32.7–37.8 AES, 36.5–40.0 TeachQuiz.
- Pixel diffusion (OpenSora-v2, Veo3): 3.7–9.0 AES, 0–2.5 TeachQuiz.
- Ablations: no Planner costs about 41 points on both metrics; no parallelism takes 15.4 to 86.6 min; ScopeRefine uses 30.8K tokens vs 52.6K for full-code debugging.
- Human study: 80.3 AES, 64.0 TeachQuiz, r=0.971 between aesthetics and learning. Only 8 participants per condition (6 middle school, 2 undergraduate).
- Still trails professional videos on attractiveness and visual consistency.

### What the code actually does (read directly)
- **"Unlearning" is only a prompt.** `eval_TQ.py` prefixes the question with an instruction to pretend not to know the concept. Nothing is removed from the model. "Unlearning success" is the heuristic `post_unlearn_score <= pre_score`.
- **Quizzes are pre-written:** `json_files/questions_by_topic_10.json`, 10 multiple-choice questions per topic, not derived from any source text.
- **ScopeRefine is mostly regex.** `scope_refine.py` classifies Python errors (NameError, AttributeError and so on), cuts out the enclosing function or animation block, asks the LLM to fix it, and falls back to a full rewrite.
- **The Critic reads generated code.** `agent.py: get_mllm_feedback` extracts grid positions from the Manim code and sends them with the rendered video to the VLM.

### Comparison with chalk
| | Code2Video | chalk |
|---|---|---|
| Input | Topic string | Book chapter with block ids |
| Grounding | Asset retrieval only; LLM writes content | Every line maps to `chapter.json` blocks |
| Renderer | Manim for everything | Tier 1 HTML/SVG, Manim only when needed |
| Audio | Not a focus | VO is the clock |
| Review | Automated VLM critic | Human gate before rendering |
| Output | MP4 | MP4 per segment plus interactive page |
| Layout QA | 6×6 anchor grid | `hyperframes check` and snapshots |

### Worth borrowing
1. **TeachQuiz as a regression metric.** Generate quiz questions from `chapter.json` source blocks, have a VLM answer before and after the segment, track the delta. Caveat: a VLM learning from video is only a proxy for a human.
2. **Named-anchor layout feedback**, if an automated layout critic is ever added.
3. **ScopeRefine's repair-at-narrowest-scope idea**, if Tier 2 Manim errors become frequent.
4. **The Planner ablation** supports spending effort on pedagogy and storyboard before rendering.

### What it does not solve
Faithfulness to a given text, equation fidelity from source material, narration/word-timing alignment, learner-facing interactivity.

## 3. Could chalk be an arXiv paper?

**Verdict: yes as a short or workshop-scale paper, if an evaluation is built. As a system-description paper alone, probably not.** arXiv has no gatekeeping; the question is whether it is a contribution that gets cited rather than reading as a README.

### Why it is weak as-is
- Chaining Hyperframes, TTS and Whisper with prompts is engineering; the repo is markdown instructions plus glue scripts.
- There is no evaluation yet. Code2Video's case rests on a benchmark and numbers.
- The headline contributions in CLAUDE.md are design invariants, which are practical but not experimentally supported.

### Real research angles
1. **Faithfulness to a source in educational video generation.** The papers found above evaluate aesthetics and quiz scores with an LLM writing the content; none measured grounding to a given text. A claim-level attribution metric for lesson videos looked like an unfilled gap in this search.
2. **Equation fidelity.** Measure how often extraction mis-transcribes formulas and what fraction the refuse-to-render gate catches.
3. **Audio-as-clock.** The splice-silence defect with before/after audible-discontinuity measurements. Probably a section, not a paper.
4. **Tier routing.** HTML/SVG vs all-Manim on cost, editability and learning outcome.

### What a credible version needs
- A benchmark of chapters, preferably public-domain like `fixtures/`, with annotated source-claim links.
- Baselines: Code2Video, Ludium, and direct LLM-to-Manim on the same chapters.
- Metrics: unsupported-claim rate, equation error rate, and a TeachQuiz-style delta with quizzes derived from the source text. A real learner study if possible.
- Honest limits, including the VLM-as-learner proxy.

### Venue fit
Workshop (AIED, an education-LLM workshop, NeurIPS or ICLR workshops) or demo track is realistic. Main conference needs the benchmark and the learner study. Main risk: without the faithfulness comparison it reads as another Manim agent.

### Suggested framing
Grounded lesson generation, with the benchmark and metric as the contribution and the video tool as the vehicle.

## Next steps
- [ ] Sketch the evaluation design (benchmark, metrics, baselines).
- [ ] Draft a paper outline.
- [ ] Read Ludium's code to verify how it handles grounding and checkpoints.
