# Sentinel — Architecture and August/September Milestone Notes

## High-level architecture

1. **React + Vite client**: collects source code and displays analysis progress/findings.
2. **Express API**: validates requests and orchestrates the agents.
3. **Gemini provider adapter** (`api/lib/gemini.js`): centralizes model, JSON-only output, errors, and API-key handling.
4. **Reconnaissance agent**: identifies language and important regions.
5. **Local retrieval module** (`api/lib/rag.js`): retrieves CWE/CVE records from JSON corpora using token overlap and exact-ID boosts.
6. **Detection/classification agent**: receives code, recon map, and retrieved security-reference excerpts.
7. **Verification/localization agent**: receives untrusted candidate findings and source code, rejects unsupported claims, deduplicates findings, and narrows line ranges.
8. **Evaluation harness** (`scripts/evaluate.js`): runs a labelled JSONL dataset and computes metrics.
9. **Baseline adapter** (`scripts/run_starcoder_baseline.py`): runs an existing StarCoder-1B + LoRA adapter on the same data and exports predictions.

## Data contracts

### Evaluation sample (JSONL)

```json
{
  "sampleId": "sample-001",
  "language": "Python",
  "code": "source text here",
  "vulnerable": true,
  "cweId": "CWE-89",
  "cveId": null,
  "vulnerableLines": [3, 4],
  "unknownCwe": false
}
```

One JSON object per line. Use booleans for `vulnerable`. `vulnerableLines` are 1-indexed. Set `unknownCwe` only when the vulnerability family was deliberately excluded from the relevant development/training/reference setup, and explain the protocol.

### Finding

A finding includes `id`, `title`, `cweId`, `cweName`, `severity`, `functionName`, `startLine`, `endLine`, `explanation`, `recommendation`, and `evidence`. These are generated suggestions, not proof of exploitability.

## Metric definitions in the evaluator

- Vulnerability classification: a sample is predicted vulnerable if at least one finding remains after the selected pipeline stages.
- Precision = TP / (TP + FP); recall = TP / (TP + FN); F1 = harmonic mean of precision and recall.
- False-positive rate = FP / (FP + TN).
- CWE classification accuracy is evaluated on vulnerable samples that were detected and have a reference CWE, measuring whether any finding's CWE ID exactly matches the reference.
- Localization hit rate is evaluated when a sample has reference vulnerable line numbers; a hit means at least one predicted range covers at least one reference vulnerable line. This is a permissive line-overlap metric, not exact span match. For a publication-quality paper, also report exact line match or IoU/span metrics.
- Unknown-vulnerability detection rate is recall over samples marked `unknownCwe`. The marking must reflect a documented held-out-CWE protocol.

## Research and implementation checklist

### August

- [x] Gemini API wrapper
- [x] Initial pipeline and API endpoints
- [x] Working frontend/backend structure
- [x] Multi-language demo samples
- [x] Dataset normalization tool
- [ ] Download/source and combine the research datasets named in the plan
- [ ] Inspect label meanings, class balance, language coverage, duplicates, licenses, and data splits
- [ ] Finalize individual team member task allocation with the supervisor

### September

- [x] Multi-stage pipeline: recon → detection/classification → verification/localization
- [x] Local CWE/CVE RAG integration point and JSON corpora
- [x] Verification stage
- [x] RAG/verification ablation switches
- [x] Evaluation harness and report generation
- [x] StarCoder + LoRA runner interface
- [ ] Populate and version the CVE corpus for the target research scope
- [ ] Run full evaluation on the actual held-out dataset
- [ ] Run the actual StarCoder-1B + LoRA baseline with the project's checkpoint/configuration
- [ ] Record comparative metrics and assess false-positive impact from verification

The checked items above describe code included in the repository. Dataset sourcing, model execution, and performance results are data/resource-dependent and are not marked complete until reports exist.
