# Sentinel — Gemini-Powered Agentic Vulnerability Detection

Sentinel is a research prototype for agentic source-code vulnerability detection, CWE classification, line-level localization, and verification. The application uses **Google Gemini only** as its LLM provider.

> **Research disclaimer:** This is a capstone prototype, not a replacement for a professional security audit. LLM-based findings may be wrong. Never execute untrusted code, and validate every result manually.

## Research-plan coverage

This repository provides an implementation path for the August and September activities in the Capstone Project-I research plan:

| Plan activity | Code or evidence in this repository | Status/qualification |
|---|---|---|
| Architecture and initial working prototype | `docs/ARCHITECTURE.md`, `api/lib/agent.js`, Express API and React UI | Implemented in the code |
| LLM API access | `api/lib/gemini.js` | Gemini only; requires your own API key |
| Initial multi-language sample | `data/demo-evaluation.jsonl` | Demonstration only, not a scientific dataset |
| Dataset assembly/normalization | `scripts/prepare_dataset.py` | Ready for downloaded source datasets; source datasets must be supplied |
| Multi-agent pipeline | Reconnaissance → Detection/Classification → Verification/Localization | Implemented |
| CWE/CVE retrieval-augmented analysis | `api/lib/rag.js`, `data/cwe-knowledge-base.json`, `data/cve-knowledge-base.json` | Local keyword retriever; seed reference corpus included and NVD importer provided |
| Verification / false-positive control | `runVerify()` in `api/lib/agent.js` | Implemented; effectiveness must be measured |
| Metrics / evaluation harness | `scripts/evaluate.js` | Implemented; run against labelled samples |
| StarCoder-1B + LoRA baseline runner | `scripts/run_starcoder_baseline.py` | Requires the actual trained LoRA adapter and compute; no baseline results are fabricated |
| Ablations | `/api/analyze` accepts `options.useRag` and `options.useVerification` | Implemented; evaluate with and without each component |

**Important:** A script is not the same as a completed experiment. To claim the dataset assembly and baseline comparison are complete, use real source datasets and the project's actual StarCoder-1B + LoRA adapter, and keep the generated reports.

## Architecture

```text
Submitted source code
        │
        ▼
Reconnaissance Agent ── language, functions, code structure
        │
        ├───────────────► CWE/CVE Retriever
        │                  local security-reference corpus
        ▼
Detection & Classification Agent ── candidate findings, CWE, severity, evidence
        │
        ▼
Verification & Localization Agent ── reject unsupported findings, deduplicate,
        │                              refine CWE and line ranges
        ▼
Findings + references + metadata
```

### Agent responsibilities

1. **Reconnaissance** — maps language and relevant functions/regions.
2. **Detection and Classification** — identifies candidates using source code plus retrieved security knowledge.
3. **Verification and Localization** — independently challenges each candidate, checks evidence, removes duplicates, and refines line ranges.
4. **RAG retriever** — ranks a local knowledge corpus by keyword overlap. It needs no paid embedding service, but is less semantically capable than a vector/embedding retriever. It loads curated CWE records and imported CVE records.

## Requirements

- Node.js 20 or newer
- npm
- A Google Gemini API key for AI analysis
- Python 3.10+ for the dataset and NVD import scripts
- Optional: Python environment and sufficient GPU/CPU/RAM for the StarCoder baseline

## Local setup (Windows PowerShell or terminal)

1. Extract this repository and enter the project folder.
2. Install dependencies:

   ```bash
   npm run install:all
   ```

3. Create `.env` from `.env.example` and fill in your Gemini key. In Windows PowerShell, use:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

   Keep these settings in `.env` (replace the example key with your real key):

   ```env
   GEMINI_API_KEY=your_real_key
   GEMINI_MODEL=gemini-3.5-flash-lite
   RAG_TOP_K=5
   ```

   Do not commit `.env`. The key is read only by the server.

4. Start the backend in one terminal:

   ```bash
   npm run dev:server
   ```

5. Start the frontend in a second terminal:

   ```bash
   npm run dev:client
   ```

6. Open `http://localhost:5173`. The backend runs at `http://localhost:8787`.

Check the API before scanning:

```bash
curl http://localhost:8787/api/health
```

Expected health fields include `ok`, `provider: "Google Gemini"`, `model`, and `hasApiKey`. A configured key does not guarantee remaining quota or model availability. Run the local unit checks with `npm test`; these validate the retrieval and metric helpers without consuming Gemini quota.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Server, provider and key-presence check |
| `POST` | `/api/recon` | Reconnaissance stage; body: `{ "code": "..." }` |
| `POST` | `/api/scan` | Detection + RAG; body: `{ "code": "...", "recon": {} }` |
| `POST` | `/api/verify` | Verification; body: `{ "code": "...", "findings": [], "ragContext": {} }` |
| `POST` | `/api/analyze` | Full pipeline in one request |
| `POST` | `/api/knowledge/search` | Search local CWE/CVE corpus; body: `{ "query": "SQL injection", "topK": 5 }` |

Full-pipeline options support ablation experiments:

```json
{
  "code": "def example(): pass",
  "options": { "useRag": true, "useVerification": true }
}
```

Set either option to `false` to run the corresponding ablation. The UI uses all stages enabled.

## August: data preparation

The starter examples are in `data/demo-evaluation.jsonl`. These are small hand-written smoke-test examples only. **Do not present their metrics as research findings.**

1. Download the dataset files approved for your project from the original dataset maintainers. Follow their licenses and usage terms. Examples named in the research plan include SecVulEval, Big-Vul, CVEfixes and Devign.
2. Place your raw files in `data/raw/` (this folder is intentionally not populated with large third-party datasets).
3. Normalize CSV/JSON/JSONL source records:

   ```bash
   python scripts/prepare_dataset.py data/raw/your-dataset.csv --output data/processed/combined.jsonl
   ```

4. If field names are not detected correctly, state them explicitly:

   ```bash
python scripts/prepare_dataset.py data/raw/your-dataset.csv --code-field func --label-field vul --positive-value 1 --language-field language --cwe-field cwe_id --output data/processed/combined.jsonl
```

   Choose `--positive-value` according to the original dataset's label definition. Some datasets encode the classes differently; check each dataset's documentation. Inspect a few rows after normalization. The script deduplicates exact/whitespace-normalized code and reports skipped rows. If your test split already marks held-out CWE samples, use `--unknown-cwe-field <field-name>` to preserve that flag.

5. Keep a held-out test set separate from any fine-tuning/training data. For unknown-vulnerability experiments, explicitly hold out selected CWE families from development and document the choice. A model's hidden pretraining data cannot generally be guaranteed free of a CWE family.

## September: CWE/CVE retrieval

- The starter CWE knowledge corpus is `data/cwe-knowledge-base.json`.
- `data/cve-knowledge-base.json` includes a few reference records; extend it with records relevant to the test languages and vulnerability classes.
- To import downloaded NVD JSON 2.x files:

  ```bash
  python scripts/import_nvd_cves.py data/raw/nvdcve-2.0-2024.json --output data/cve-knowledge-base.json
  ```

- RAG uses local keyword-based ranking to keep the project free of embedding-provider costs. Document the corpus version/date, retrieval method, and top-K in the report. Keyword matching is a baseline retrieval approach, not a claim of state-of-the-art semantic retrieval.

## Evaluation and ablations

Start the backend with `.env` configured, then from the project root run:

```bash
node scripts/evaluate.js --dataset=data/demo-evaluation.jsonl --limit=2
```

For a real experiment, use your held-out labelled dataset:

```bash
node scripts/evaluate.js --dataset=data/processed/test.jsonl --output=reports/agentic-test.json
```

Each sample consumes several model calls, so start small to avoid exhausting free-tier quotas. The report includes confusion counts, precision, recall, F1, false-positive rate, language breakdown, CWE classification accuracy where labels exist, localization hit rate where line labels exist, and unknown-vulnerability detection rate where held-out samples are marked.

Run ablations with:

```bash
node scripts/evaluate.js --dataset=data/processed/test.jsonl --output=reports/no-rag.json --no-rag
node scripts/evaluate.js --dataset=data/processed/test.jsonl --output=reports/no-verification.json --no-verification
node scripts/evaluate.js --dataset=data/processed/test.jsonl --output=reports/no-rag-no-verification.json --no-rag --no-verification
```

To run the full four-configuration matrix automatically (RAG on/off × verification on/off), start the API and run:

```bash
npm run ablate -- --dataset=data/processed/test.jsonl --output-dir=reports/ablations --pause-ms=1000
```

Start with a small `--limit=2` for the first smoke test. Each configuration re-runs the samples and consumes Gemini API quota.

For clean comparisons, use the same examples, API/model version, prompt version, and metric definitions. Record the model, corpus version and experiment options. Free-tier rate limits and nondeterministic model outputs may affect runs; preserve raw reports.

## StarCoder-1B + LoRA baseline

The baseline runner requires the **actual LoRA adapter/checkpoint** used by your project. It does not fabricate a checkpoint or train one automatically.

```bash
pip install -r requirements-baseline.txt
python scripts/run_starcoder_baseline.py \
  --dataset data/processed/test.jsonl \
  --adapter path/to/your/starcoder-lora-adapter \
  --output reports/starcoder-predictions.jsonl
```

Then score the baseline outputs on the same dataset:

```bash
node scripts/evaluate.js --dataset=data/processed/test.jsonl --baseline-file=reports/starcoder-predictions.jsonl --output=reports/agentic-vs-starcoder.json
```

Inspect `parseSucceeded` and raw baseline output before trusting the comparison. If you do not have the adapter/model configuration, tell your supervisor; your research plan names an existing baseline, and its exact reproduction is a project dependency.

## Final safeguards and known limitations

- This is source-code analysis; it does not compile or execute the submitted program.
- LLM verification and text evidence checks cannot mathematically prove exploitability.
- The starter sample set is too small for statistically meaningful conclusions.
- The default local retrieval method is keyword-based and depends on corpus coverage.
- Real research-quality evaluation requires labelled held-out data, repeated runs where appropriate, and a reproducible baseline.
- Use the same data splits and evaluation definitions for every system under comparison.
- Do not commit API keys, third-party datasets whose licenses disallow redistribution, or private vulnerability samples.

## Files added for the August/September milestone

- `api/lib/gemini.js` — Gemini-only provider wrapper and JSON parsing
- `api/lib/rag.js` — local retrieval-augmented generation
- `api/lib/agent.js` — recon, detection/classification, verification/localization, and ablation switches
- `data/cwe-knowledge-base.json`, `data/cve-knowledge-base.json` — reference corpus
- `scripts/prepare_dataset.py` — dataset normalization and duplicate handling
- `scripts/import_nvd_cves.py` — NVD JSON 2.x importer
- `scripts/evaluate.js` — reproducible metrics and ablation harness
- `scripts/run_starcoder_baseline.py` — optional actual StarCoder + LoRA inference runner
- `docs/ARCHITECTURE.md` — architecture, metric definitions, and milestone checklist
