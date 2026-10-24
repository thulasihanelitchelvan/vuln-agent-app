# Sentinel research data

- `demo-evaluation.jsonl` is a tiny, hand-written smoke-test set. It is not a public benchmark and is not large enough to support research conclusions.
- `cwe-knowledge-base.json` is the project's curated starter knowledge corpus.
- `cve-knowledge-base.json` contains a few example CVE references. `scripts/import_nvd_cves.py` can merge downloaded NVD JSON 2.x data into this file.
- Do not commit raw third-party datasets or model checkpoints unless their licenses and repository size rules allow it. Keep downloaded data under `data/raw/` (ignored by Git) and normalized data under `data/processed/` (ignored by Git).

For each research run, record the source dataset/version/date, license, field-to-label mapping, deduplication policy, language coverage, split seed, and held-out CWE protocol. Keep vulnerable and safe examples in the test split, and do not use test labels to tune prompts.
