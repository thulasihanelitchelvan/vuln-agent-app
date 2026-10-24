#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function arg(name, fallback = undefined) {
  const item = process.argv.find((value) => value.startsWith(`${name}=`));
  return item ? item.slice(name.length + 1) : fallback;
}
function flag(name) { return process.argv.includes(name); }
function readJsonl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line, i) => {
    try { return JSON.parse(line); } catch (e) { throw new Error(`Invalid JSONL at ${file}:${i + 1}: ${e.message}`); }
  });
}
function f1(p, r) { return p + r === 0 ? 0 : 2 * p * r / (p + r); }
export function scores(rows, getFindings) {
  let tp = 0, fp = 0, tn = 0, fn = 0, cweN = 0, cweCorrect = 0, localizationN = 0, localizationCorrect = 0, unknownN = 0, unknownDetected = 0;
  const byLanguage = {};
  const perSample = [];
  for (const row of rows) {
    const findings = getFindings(row) || [];
    const actual = row.vulnerable === true || row.label === "vulnerable" || row.label === 1 || row.label === "1";
    const predicted = findings.length > 0;
    if (actual && predicted) tp++;
    else if (!actual && predicted) fp++;
    else if (!actual && !predicted) tn++;
    else fn++;
    const lang = row.language || "unknown";
    byLanguage[lang] ||= { samples: 0, tp: 0, fp: 0, tn: 0, fn: 0 };
    byLanguage[lang].samples++;
    if (actual && predicted) byLanguage[lang].tp++;
    else if (!actual && predicted) byLanguage[lang].fp++;
    else if (!actual && !predicted) byLanguage[lang].tn++;
    else byLanguage[lang].fn++;

    const expectedCwe = String(row.cweId || "").toUpperCase().replace(/\s/g, "");
    if (actual && predicted && expectedCwe) {
      cweN++;
      if (findings.some((f) => String(f.cweId || "").toUpperCase().replace(/\s/g, "") === expectedCwe)) cweCorrect++;
    }
    const expectedLines = Array.isArray(row.vulnerableLines) ? row.vulnerableLines.map(Number) : [];
    if (actual && expectedLines.length) {
      // Count missed vulnerabilities as localization misses, not as excluded examples.
      localizationN++;
      if (predicted && findings.some((finding) => expectedLines.some((line) => line >= Number(finding.startLine) && line <= Number(finding.endLine)))) localizationCorrect++;
    }
    if (actual && row.unknownCwe === true) {
      unknownN++;
      if (predicted) unknownDetected++;
    }
    perSample.push({ sampleId: row.sampleId || row.id, language: lang, actualVulnerable: actual, predictedVulnerable: predicted,
      correctCwe: expectedCwe ? findings.some((f) => String(f.cweId || "").toUpperCase().replace(/\s/g, "") === expectedCwe) : null,
      localizationHit: expectedLines.length ? findings.some((finding) => expectedLines.some((line) => line >= Number(finding.startLine) && line <= Number(finding.endLine))) : null,
      findings });
  }
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const falsePositiveRate = fp + tn ? fp / (fp + tn) : 0;
  for (const entry of Object.values(byLanguage)) {
    const p = entry.tp + entry.fp ? entry.tp / (entry.tp + entry.fp) : 0;
    const r = entry.tp + entry.fn ? entry.tp / (entry.tp + entry.fn) : 0;
    entry.precision = round(p); entry.recall = round(r); entry.f1 = round(f1(p, r));
  }
  return {
    sampleCount: rows.length, confusionMatrix: { tp, fp, tn, fn },
    precision: round(precision), recall: round(recall), f1: round(f1(precision, recall)),
    falsePositiveRate: round(falsePositiveRate),
    cweClassificationAccuracy: cweN ? round(cweCorrect / cweN) : null,
    cweEvaluatedTruePositives: cweN,
    localizationHitRate: localizationN ? round(localizationCorrect / localizationN) : null,
    localizationEvaluatedSamples: localizationN,
    unknownVulnerabilityDetectionRate: unknownN ? round(unknownDetected / unknownN) : null,
    unknownVulnerabilitySamples: unknownN,
    byLanguage, perSample,
  };
}
function round(value) { return Number(value.toFixed(4)); }

async function main() {
  const datasetPath = arg("--dataset", "data/demo-evaluation.jsonl");
  const baseUrl = arg("--api", process.env.EVALUATION_API_URL || "http://localhost:8787").replace(/\/$/, "");
  const limit = Number(arg("--limit", "0"));
  const pauseMs = Math.max(0, Number(arg("--pause-ms", "0")) || 0);
  const outputPath = arg("--output", `reports/evaluation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const baselinePath = arg("--baseline-file");
  const useRag = !flag("--no-rag");
  const useVerification = !flag("--no-verification");
  const all = readJsonl(datasetPath);
  const dataset = limit > 0 ? all.slice(0, limit) : all;
  if (!dataset.length) throw new Error(`No samples found in ${datasetPath}`);

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  if (!healthResponse.ok) throw new Error(`API health endpoint returned HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  if (!health.hasApiKey) throw new Error("Gemini API key is not configured in the server process (.env / GEMINI_API_KEY). No model evaluation was run.");

  const evaluated = [];
  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];
    process.stdout.write(`[${i + 1}/${dataset.length}] ${row.sampleId || row.id || "sample"} ... `);
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: row.code, options: { useRag, useVerification } }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Sample ${row.sampleId || i + 1} failed: ${result.error || response.status}`);
    evaluated.push({ ...row, findings: result.findings || [], analysisMetadata: result.metadata, ragContext: result.ragContext });
    console.log(`${result.findings?.length || 0} verified finding(s)`);
    if (pauseMs > 0 && i + 1 < dataset.length) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    evaluator: "Sentinel local API evaluation harness",
    model: health.model,
    configuration: { useRag, useVerification, dataset: path.resolve(datasetPath), api: baseUrl },
    system: scores(evaluated, (row) => row.findings),
    samples: evaluated,
  };

  if (baselinePath) {
    const baselineRows = readJsonl(baselinePath);
    const byId = new Map(baselineRows.map((row) => [row.sampleId || row.id, row]));
    const missingBaseline = dataset.filter((row) => !byId.has(row.sampleId || row.id));
    if (missingBaseline.length) throw new Error(`Baseline file is missing ${missingBaseline.length} dataset samples; refusing to report a misleading comparison.`);
    const parseFailures = baselineRows.filter((row) => row.parseSucceeded === false);
    if (parseFailures.length) throw new Error(`Baseline has ${parseFailures.length} failed JSON generations. Fix/inspect those before scoring so parse failures are not counted as safe predictions.`);
    const baselineAligned = dataset.map((row) => {
      const prediction = byId.get(row.sampleId || row.id);
      let findings = Array.isArray(prediction.findings) ? prediction.findings : [];
      if (!findings.length && prediction.vulnerable === true) findings = [{ cweId: prediction.cweId, startLine: prediction.startLine, endLine: prediction.endLine }];
      return { ...row, baselineFindings: findings, findings };
    });
    report.baseline = { file: path.resolve(baselinePath), ...scores(baselineAligned, (row) => row.findings) };
    report.comparison = { systemF1MinusBaselineF1: round(report.system.f1 - report.baseline.f1), systemPrecisionMinusBaseline: round(report.system.precision - report.baseline.precision), systemRecallMinusBaseline: round(report.system.recall - report.baseline.recall) };
  }

  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nReport saved to ${path.resolve(outputPath)}`);
  console.log(JSON.stringify({ system: { samples: report.system.sampleCount, precision: report.system.precision, recall: report.system.recall, f1: report.system.f1, falsePositiveRate: report.system.falsePositiveRate, localizationHitRate: report.system.localizationHitRate }, comparison: report.comparison || "No baseline file supplied" }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(`Evaluation failed: ${error.message}`); process.exitCode = 1; });
}
