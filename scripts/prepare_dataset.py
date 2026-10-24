#!/usr/bin/env python3
"""Normalize CSV/JSON/JSONL vulnerability datasets into Sentinel's JSONL schema.

Example:
  python scripts/prepare_dataset.py data/raw/*.csv --output data/processed/combined.jsonl

For external datasets with a non-standard column mapping, pass fields explicitly:
  --code-field func --label-field vul --positive-value 1 --cwe-field cwe_id
"""
import argparse, csv, hashlib, json, re, sys
from pathlib import Path

CODE_FIELDS = ["code", "source_code", "source", "func", "function", "snippet", "code_snippet", "vulnerable_code", "text"]
LABEL_FIELDS = ["vulnerable", "is_vulnerable", "label", "target", "vul", "classification", "ground_truth"]
LANG_FIELDS = ["language", "lang", "programming_language"]
CWE_FIELDS = ["cwe", "cwe_id", "cweid", "weakness", "cwe_ids"]
LINE_FIELDS = ["vulnerable_lines", "vul_lines", "line_numbers", "line_number"]
UNKNOWN_CWE_FIELDS = ["unknown_cwe", "unknowncwe", "held_out_cwe", "is_unknown_cwe"]
CVE_FIELDS = ["cve", "cve_id", "cveid"]


def norm_key(key): return re.sub(r"[^a-z0-9]", "", str(key).lower())

def choose(row, explicit, candidates):
    if explicit:
        return row.get(explicit)
    lookup = {norm_key(k): v for k, v in row.items()}
    for candidate in candidates:
        value = lookup.get(norm_key(candidate))
        if value not in (None, ""):
            return value
    return None


def read_records(path):
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open("r", newline="", encoding="utf-8-sig", errors="replace") as f:
            yield from csv.DictReader(f)
    elif suffix in (".jsonl", ".ndjson"):
        with path.open("r", encoding="utf-8", errors="replace") as f:
            for line_no, line in enumerate(f, 1):
                if line.strip():
                    try: yield json.loads(line)
                    except json.JSONDecodeError as e: print(f"Skipping invalid JSONL {path}:{line_no}: {e}", file=sys.stderr)
    elif suffix == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, list): yield from data
        elif isinstance(data, dict):
            rows = data.get("data") or data.get("records") or data.get("items")
            if isinstance(rows, list): yield from rows
            else: yield data
    else:
        print(f"Skipping unsupported format: {path}", file=sys.stderr)


def parse_bool(value, positive_value):
    if isinstance(value, bool): return value
    if value is None: return None
    text = str(value).strip().lower()
    positive = {str(positive_value).strip().lower(), "true", "yes", "vulnerable", "vuln", "positive"}
    negative = {"false", "no", "safe", "clean", "non-vulnerable", "nonvulnerable", "negative"}
    if text in positive: return True
    if text in negative: return False
    if text in {"0", "1"}:
        return text == str(positive_value).strip().lower()
    return None


def normalize_cwe(value):
    if value in (None, ""): return None
    text = ",".join(str(item) for item in value) if isinstance(value, list) else str(value)
    text = text.strip()
    match = re.search(r"CWE[-_ ]?(\d+)", text, re.I)
    if match:
        return f"CWE-{match.group(1)}"
    # Some datasets store CWE values as bare integers, such as 89.
    if re.fullmatch(r"\d+", text):
        return f"CWE-{text}"
    return text or None


def parse_flag(value):
    if isinstance(value, bool): return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "heldout", "unknown"}


def parse_lines(value):
    if value in (None, ""): return []
    if isinstance(value, list): raw = value
    else: raw = re.split(r"[,;\s]+", str(value).strip().strip("[]"))
    out=[]
    for item in raw:
        try:
            n=int(item)
            if n > 0 and n not in out: out.append(n)
        except (ValueError, TypeError): pass
    return sorted(out)


def main():
    parser=argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("inputs", nargs="+", help="Input CSV/JSON/JSONL files (downloaded by you from approved dataset sources)")
    parser.add_argument("--output", default="data/processed/combined.jsonl")
    parser.add_argument("--code-field", help="Exact source-code column name")
    parser.add_argument("--label-field", help="Exact label column name")
    parser.add_argument("--positive-value", default="1", help="Value in label-field that means vulnerable (default: 1)")
    parser.add_argument("--language-field", help="Exact programming-language column name")
    parser.add_argument("--cwe-field", help="Exact CWE column name")
    parser.add_argument("--cve-field", help="Exact CVE column name")
    parser.add_argument("--lines-field", help="Exact vulnerable-lines column name")
    parser.add_argument("--unknown-cwe-field", help="Optional field marking samples from a deliberately held-out CWE family")
    args=parser.parse_args()
    output=Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    seen=set(); count=0; skipped=0; vulnerable=0; safe=0
    with output.open("w", encoding="utf-8") as out:
        for input_name in args.inputs:
            path=Path(input_name)
            if not path.is_file(): print(f"Input not found, skipping: {path}", file=sys.stderr); continue
            for index,row in enumerate(read_records(path), 1):
                if not isinstance(row, dict): skipped += 1; continue
                code=choose(row,args.code_field,CODE_FIELDS)
                label_raw=choose(row,args.label_field,LABEL_FIELDS)
                if not isinstance(code,str) or not code.strip() or label_raw is None:
                    skipped += 1; continue
                label=parse_bool(label_raw,args.positive_value)
                if label is None:
                    skipped += 1; continue
                language=choose(row,args.language_field,LANG_FIELDS) or "unknown"
                cwe=normalize_cwe(choose(row,args.cwe_field,CWE_FIELDS))
                cve=choose(row,args.cve_field,CVE_FIELDS)
                lines=parse_lines(choose(row,args.lines_field,LINE_FIELDS))
                unknown_cwe=parse_flag(choose(row,args.unknown_cwe_field,UNKNOWN_CWE_FIELDS))
                fingerprint=hashlib.sha256(re.sub(r"\s+"," ",code).strip().encode()).hexdigest()
                if fingerprint in seen: continue
                seen.add(fingerprint)
                rec={"sampleId":f"{path.stem}-{index}","sourceDataset":path.stem,"language":str(language).strip(),"code":code,"vulnerable":label,
                     "cweId":cwe,"cveId":str(cve).strip() if cve else None,"vulnerableLines":lines,"unknownCwe":unknown_cwe}
                out.write(json.dumps(rec,ensure_ascii=False)+"\n")
                count += 1
                if label: vulnerable += 1
                else: safe += 1
    print(json.dumps({"output":str(output),"samples":count,"vulnerable":vulnerable,"safe":safe,"skipped_or_unlabelled":skipped,"unique_code_hashes":len(seen)},indent=2))
    if not count: sys.exit("No labelled code records were normalized. Check field mappings and label values.")

if __name__=="__main__": main()
