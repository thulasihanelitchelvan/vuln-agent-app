#!/usr/bin/env python3
"""Import downloaded NVD CVE JSON 2.x files into Sentinel's local retrieval corpus.

Download NVD JSON files separately from the official NVD site/API, then run:
  python scripts/import_nvd_cves.py data/raw/nvdcve-2.0-2024.json --output data/cve-knowledge-base.json
"""
import argparse, json, sys
from pathlib import Path

def first_description(cve):
    values=cve.get("descriptions", [])
    for item in values:
        if item.get("lang") == "en": return item.get("value", "")
    return values[0].get("value", "") if values else ""

def main():
    ap=argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs",nargs="+",help="Downloaded NVD 2.x JSON files")
    ap.add_argument("--output",default="data/cve-knowledge-base.json")
    ap.add_argument("--max-records",type=int,default=20000)
    a=ap.parse_args(); records={}
    existing=Path(a.output)
    if existing.exists():
        try:
            for old in json.loads(existing.read_text(encoding="utf-8")):
                key=old.get("cveId") or old.get("id")
                if key: records[key]=old
        except (json.JSONDecodeError, AttributeError):
            print(f"Existing output {existing} is not a valid CVE array; starting a fresh import.",file=sys.stderr)
    for source in a.inputs:
        path=Path(source)
        if not path.exists(): print(f"Missing file: {path}",file=sys.stderr); continue
        root=json.loads(path.read_text(encoding="utf-8"))
        for wrapper in root.get("vulnerabilities",[]):
            cve=wrapper.get("cve",wrapper)
            cve_id=cve.get("id")
            desc=first_description(cve)
            if not cve_id or not desc: continue
            cwes=[]
            for weakness in cve.get("weaknesses",[]):
                for description in weakness.get("description",[]):
                    value=description.get("value","")
                    if value.startswith("CWE-") and value not in cwes: cwes.append(value)
            refs=[ref.get("url") for ref in cve.get("references",[]) if ref.get("url")]
            metrics=cve.get("metrics",{})
            cvss=None
            for metric_key in ("cvssMetricV40","cvssMetricV31","cvssMetricV30","cvssMetricV2"):
                if metrics.get(metric_key):
                    metric=metrics[metric_key][0].get("cvssData",{})
                    cvss={"version":metric.get("version"),"baseScore":metric.get("baseScore"),"baseSeverity":metric.get("baseSeverity")}
                    break
            records[cve_id]={"id":cve_id,"cveId":cve_id,"title":cve_id,"summary":desc,"cweId":cwes[0] if cwes else None,
                "keywords":cwes,"impact":"See the official NVD record for affected products and impact.",
                "mitigation":"Consult the affected vendor's official advisory and upgrade to a fixed release.",
                "source":"NVD","reference":f"https://nvd.nist.gov/vuln/detail/{cve_id}","weaknesses":cwes,"cvss":cvss,"references":refs[:5]}
            if len(records)>=a.max_records: break
        if len(records)>=a.max_records: break
    output=Path(a.output); output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(list(records.values()),indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"Wrote {len(records)} CVE records to {output}")
    if not records: sys.exit("No CVE records imported; confirm files use the NVD JSON 2.x format.")
if __name__=="__main__": main()
