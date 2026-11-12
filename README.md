# Diagram Lab (prototype)

Demo of **code-based** exam diagram generation with Claude, for E-Math, Physics, Chemistry and Biology.
See `../plan.md` for the reasoning behind the approach.

```bash
npm install
npm run dev          # http://localhost:3000
```

## What's in it

22 preset questions: 13 at O Level across E-Math, Physics, Chemistry and Biology, and 9 at A Level across Physics, Chemistry and Biology. Each one has three Claude-written outputs:

| Approach | File | How it renders |
|---|---|---|
| **C: Scene spec** | `fixtures/<id>/scene.json` | Our renderer (`lib/scene/`). Exact geometry, automatic label placement, Zod-validated. |
| **B: TikZ** | `fixtures/<id>/tikz.tex` | node-tikzjax (TeX compiled to WebAssembly) on the server (`lib/tikz/compile.ts`). |
| **B: Raw SVG** | `fixtures/<id>/svg.svg` | Sanitised with DOMPurify (`lib/svg/sanitize.ts`). |

`fixtures/<id>/meta.json` holds the question, a reference figure (where we have one) and the **review log**: what was wrong after each render-and-check round, and how it was fixed.

Outputs were written by Claude (Opus 5.5) in Claude Code. There are **no live API calls yet**.

On every preset page you can edit the source and press **Re-render** (it calls `POST /api/render`).

## Re-render all fixtures to PNG (the visual review loop)

```bash
npx tsx scripts/render.ts /tmp/diagram-out            # all presets
npx tsx scripts/render.ts /tmp/diagram-out phys-wave  # one preset
```

## Model test

Every model draws every question with every method through one loop (`lib/pipeline/run.ts`): up to three tries, each checked by our code (`lib/pipeline/check.ts`) and by the model looking at its own picture with a fixed checklist (`lib/prompts.ts`). Results are stored per model in `results/<model>/<question>-<method>.json`, with every attempt.

- Gemini: `npx tsx scripts/run-model.ts gemini-3.5-flash-lite [questionId ...]` (needs `GEMINI_API_KEY` in `.env.local`). Finished runs are skipped, so it can be restarted.
- Claude without an API key: Claude Code helper agents play the model using `scripts/agent-task.ts` (prompt, check, verdict, finish), with the same prompts and checks.
- Live, with your own key: the Try a model page (`/try`, route `app/api/generate`).

Rounds: `results/` holds the current round, where each model gets the question plus a figure description (`figure` in `meta.json`). `results-archive/question-only/` holds the first round, with the question only.

Free tier note: Gemini 3.5 Flash allows 20 requests a day, and each try uses two.

## Cost and time estimates

`npx tsx scripts/stats.ts` measures every fixture and writes `lib/stats.json`. The How it works page turns that into cost and time per diagram using the assumptions in `lib/estimates.ts`. Rerun it after changing fixtures.

## Known limits

- TikZ `pattern=` fills are broken in node-tikzjax. The house preamble provides `\hatchregion`, `\dotregion` and `\surface` instead.
- Loading pgfplots together with circuitikz runs TeX out of memory, so pgfplots is only loaded when the code draws a graph, and compiles stop after 20 s.
- node-tikzjax is not safe to run concurrently, so compiles are serialised (about 0.4 to 1.4 s each, then cached).
- The scene schema has no triangle-solving helpers (SSS/ASA) yet. For bearings and trigonometry the model still does the maths.
- Label placement is heuristic. It occasionally makes odd but legible choices (e.g. the barometer "glass tube" label).

## Next step

Add a live `DiagramProvider` that calls the Claude API: generate, then render, then run the static checks (schema, compile errors, label collisions), then a vision check of the PNG, then retry.
