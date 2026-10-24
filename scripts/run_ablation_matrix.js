#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function arg(name, fallback) {
  const item = process.argv.find((value) => value.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : fallback;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const evaluator = path.join(here, "evaluate.js");
const dataset = arg("--dataset", "data/demo-evaluation.jsonl");
const api = arg("--api", process.env.EVALUATION_API_URL || "http://localhost:8787");
const outputDir = arg("--output-dir", "reports/ablations");
const limit = Number(arg("--limit", "0"));
const pauseMs = Number(arg("--pause-ms", "1000"));

const configurations = [
  { name: "rag-on-verification-on", useRag: true, useVerification: true },
  { name: "rag-off-verification-on", useRag: false, useVerification: true },
  { name: "rag-on-verification-off", useRag: true, useVerification: false },
  { name: "rag-off-verification-off", useRag: false, useVerification: false },
];

if (!fs.existsSync(dataset)) {
  console.error(`Dataset not found: ${dataset}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
console.log(`Running 2x2 ablation matrix on ${dataset}`);
console.log("Use a small --limit first to check API quota; the full matrix makes multiple Gemini calls per sample.\n");

for (const config of configurations) {
  const output = path.join(outputDir, `${config.name}.json`);
  const args = [evaluator, `--dataset=${dataset}`, `--api=${api}`, `--output=${output}`];
  if (limit > 0) args.push(`--limit=${limit}`);
  if (pauseMs > 0) args.push(`--pause-ms=${pauseMs}`);
  if (!config.useRag) args.push("--no-rag");
  if (!config.useVerification) args.push("--no-verification");

  console.log(`\n=== ${config.name} ===`);
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.error) {
    console.error(`Could not run evaluator: ${result.error.message}`);
    process.exit(result.status || 1);
  }
  if (result.status !== 0) {
    console.error(`Ablation failed at ${config.name}; remaining configurations were not run.`);
    process.exit(result.status || 1);
  }
}

console.log(`\nAblation matrix complete. Reports saved under ${path.resolve(outputDir)}.`);
console.log("Compare F1, precision, recall, false-positive rate, CWE accuracy and localization hit rate across all four reports.");
