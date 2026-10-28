# chalk

Turn a source document (markdown, docx, pdf, epub, scanned pages) into grounded teaching outputs:

- **a YouTube video**: one chaptered 1080p video, captions, chapter timestamps, description,
  thumbnail and a follow-along notebook ([formats/youtube](formats/youtube/README.md));
- **an interactive lesson**: short animated segments wrapped in a page with checkpoints
  ([formats/lesson](formats/lesson/README.md)).

Every narrated line and on-screen claim cites a block of the source, and every derived number comes
from running the source's code.

```bash
npm install
npx chalk doctor
npx chalk --help
```

| Part | What it holds |
|---|---|
| [core/](core/README.md) | ingest, the grounding and spoken-style gates, narration, caption alignment, Manim, the shared references |
| [frames/](frames/README.md) | deterministic frames from a Python spec per segment, plus the step-4 build |
| [evals/](evals/run.mjs) | the eval: shared criteria plus a pack per format |
| [formats/](formats/) | one skill per output format |

Licence: Apache-2.0.
