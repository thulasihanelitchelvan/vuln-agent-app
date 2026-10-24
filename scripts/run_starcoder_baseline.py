#!/usr/bin/env python3
"""Run the existing StarCoder-1B + LoRA baseline on the same JSONL benchmark.

This requires a locally available/trained LoRA adapter. It does not train a baseline.
Example:
  pip install -r requirements-baseline.txt
  python scripts/run_starcoder_baseline.py --dataset data/processed/test.jsonl \
    --adapter path/to/your/starcoder-lora-adapter --output reports/starcoder-predictions.jsonl
"""
import argparse, json, re, sys
from pathlib import Path

def extract_json(text):
    text = text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end < start: return None
    try: return json.loads(text[start:end+1])
    except json.JSONDecodeError: return None

def main():
    parser=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dataset",required=True)
    parser.add_argument("--adapter",required=True,help="Path to the trained LoRA adapter")
    parser.add_argument("--base-model",default="bigcode/starcoderbase-1b")
    parser.add_argument("--output",default="reports/starcoder-predictions.jsonl")
    parser.add_argument("--max-new-tokens",type=int,default=512)
    parser.add_argument("--max-input-tokens",type=int,default=4096,help="Truncate source prompts to this many tokens (default: 4096)")
    parser.add_argument("--limit",type=int,default=0)
    args=parser.parse_args()
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from peft import PeftModel
    except ImportError as e:
        sys.exit(f"Missing dependency: {e}. Install requirements-baseline.txt in a separate Python environment.")
    adapter=Path(args.adapter)
    if not adapter.exists(): sys.exit(f"LoRA adapter path does not exist: {adapter}")
    records=[json.loads(line) for line in Path(args.dataset).read_text(encoding="utf-8").splitlines() if line.strip()]
    if args.limit: records=records[:args.limit]
    tokenizer=AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
    if tokenizer.pad_token is None: tokenizer.pad_token=tokenizer.eos_token
    model=AutoModelForCausalLM.from_pretrained(args.base_model, torch_dtype="auto", device_map="auto", trust_remote_code=True)
    model=PeftModel.from_pretrained(model,str(adapter))
    model.eval()
    output=Path(args.output); output.parent.mkdir(parents=True,exist_ok=True)
    with output.open("w",encoding="utf-8") as out:
        for i,row in enumerate(records,1):
            prompt=("Task: identify only source-code vulnerabilities supported by the code. Return one JSON object and no markdown. "
                    "Schema: {\"findings\":[{\"title\":string,\"cweId\":string,\"startLine\":integer,\"endLine\":integer,\"severity\":\"critical|high|medium|low\",\"explanation\":string}]}\n"
                    "Line numbers start at 1. If no issue is present, return {\"findings\":[]}.\nSOURCE CODE:\n" +
                    "\n".join(f"{n}: {line}" for n,line in enumerate(row["code"].splitlines(),1)) + "\nJSON:")
            inputs=tokenizer(prompt,return_tensors="pt",truncation=True,max_length=args.max_input_tokens)
            inputs={k:v.to(model.device) for k,v in inputs.items()}
            with torch.no_grad(): generated=model.generate(**inputs,max_new_tokens=args.max_new_tokens,do_sample=False,pad_token_id=tokenizer.eos_token_id)
            text=tokenizer.decode(generated[0][inputs["input_ids"].shape[1]:],skip_special_tokens=True)
            parsed=extract_json(text)
            findings=parsed.get("findings",[]) if isinstance(parsed,dict) and isinstance(parsed.get("findings",[]),list) else []
            result={"sampleId":row.get("sampleId") or row.get("id"),"findings":findings,"rawOutput":text,"parseSucceeded":parsed is not None}
            out.write(json.dumps(result,ensure_ascii=False)+"\n")
            print(f"[{i}/{len(records)}] {result['sampleId']}: {len(findings)} finding(s)" if parsed is not None else f"[{i}/{len(records)}] {result['sampleId']}: JSON parse failed")
    print(f"Saved predictions to {output}. Inspect parseSucceeded before interpreting metrics.")

if __name__=="__main__": main()
