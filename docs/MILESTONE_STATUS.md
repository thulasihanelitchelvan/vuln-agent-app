# August–September milestone status for the mid-semester review

This file separates **code implemented in this repository** from work that requires external project artefacts or experimental runs. Do not report a metric or milestone as complete until the corresponding evidence exists.

## August 2026 — architecture, API access, and initial prototype

| Planned item | Repository evidence | Status |
|---|---|---|
| Architecture document | `docs/ARCHITECTURE.md` | Implemented |
| Secure LLM API access | `api/lib/gemini.js`, `.env.example` | Implemented; provide a private `GEMINI_API_KEY` locally |
| Initial working prototype | `client/`, `server/`, `api/lib/agent.js` | Implemented in code; perform a local run check |
| Initial multi-language examples | `data/demo-evaluation.jsonl` | Included for smoke tests only |
| Dataset assembly / merge | `scripts/prepare_dataset.py` | Import and normalization tooling included; the named third-party datasets are not bundled |
| Final team task allocation | Supervisor / team records | External action; confirm with supervisor |

## September 2026 — multi-agent pipeline and research evaluation

| Planned item | Repository evidence | Status |
|---|---|---|
| Reconnaissance stage | `runRecon()` in `api/lib/agent.js` | Implemented |
| Detection and CWE classification | `runScan()` in `api/lib/agent.js` | Implemented |
| Line/function localization and verification | `runVerify()` in `api/lib/agent.js` | Implemented; false-positive impact still needs empirical measurement |
| CWE/CVE-grounded retrieval | `api/lib/rag.js`, `data/*-knowledge-base.json` | Implemented as local keyword retrieval with starter corpus |
| Dataset ingestion across languages | `scripts/prepare_dataset.py` | Implemented; run it on licensed project datasets and inspect label mappings |
| Precision / recall / F1 / false-positive rate | `scripts/evaluate.js` | Metrics implemented; no scientific result until a labelled held-out set is evaluated |
| Unknown-CWE detection and localization evaluation | `scripts/evaluate.js` | Metrics implemented; require a documented held-out-CWE protocol and ground-truth line labels |
| RAG × verification ablations | `scripts/run_ablation_matrix.js` and `npm run ablate` | Runner implemented; actual runs and reports are pending |
| StarCoder-1B + LoRA baseline | `scripts/run_starcoder_baseline.py` | Inference runner implemented; requires the exact available base model, trained adapter, and compute |
| Baseline comparison table | `scripts/evaluate.js --baseline-file=...` | Generated after valid baseline predictions are available |

## Recommended demonstration sequence

1. Show `/api/health` with `provider: Google Gemini` and `hasApiKey: true`.
2. Submit the included code sample and explain Recon → RAG retrieval → Detection/Classification → Verification/Localization.
3. Open the retrieved CWE/CVE references and explain that keyword retrieval is a lightweight RAG baseline, not a vector-embedding system.
4. Run `npm test` and show the tests for retrieval and metric calculations.
5. Run the evaluator on a small smoke-test subset, explicitly labelling it as a technical check rather than a research benchmark.
6. For research results, run the same labelled held-out dataset through all four RAG/verification configurations and the actual StarCoder LoRA baseline.

## Claims to avoid

- Do not claim the system outperforms StarCoder until the baseline checkpoint has actually been run on the same held-out samples.
- Do not report the demo dataset metrics as general performance results.
- Do not describe keyword retrieval as embedding-based semantic retrieval.
- Do not claim false positives are reduced until verified and unverified configurations have been compared on labelled samples.
- Do not call CWE samples “unknown” unless the held-out protocol is defined and documented; an LLM's pretraining data is not fully knowable.
