import test from "node:test";
import assert from "node:assert/strict";
import { scores } from "../scripts/evaluate.js";

test("computes classification metrics and counts a missed finding as a localization miss", () => {
  const rows = [
    { sampleId: "vuln-hit", language: "Python", vulnerable: true, cweId: "CWE-89", vulnerableLines: [2], findings: [{ cweId: "CWE-89", startLine: 2, endLine: 3 }] },
    { sampleId: "vuln-missed", language: "Python", vulnerable: true, cweId: "CWE-78", vulnerableLines: [4], findings: [] },
    { sampleId: "safe-hit", language: "JavaScript", vulnerable: false, vulnerableLines: [], findings: [] },
    { sampleId: "false-positive", language: "JavaScript", vulnerable: false, vulnerableLines: [], findings: [{ cweId: "CWE-79", startLine: 1, endLine: 1 }] },
  ];
  const result = scores(rows, (row) => row.findings);
  assert.deepEqual(result.confusionMatrix, { tp: 1, fp: 1, tn: 1, fn: 1 });
  assert.equal(result.precision, 0.5);
  assert.equal(result.recall, 0.5);
  assert.equal(result.f1, 0.5);
  assert.equal(result.falsePositiveRate, 0.5);
  assert.equal(result.cweClassificationAccuracy, 1);
  assert.equal(result.localizationHitRate, 0.5);
  assert.equal(result.localizationEvaluatedSamples, 2);
});

test("reports unknown-vulnerability recall and language-level metrics", () => {
  const rows = [
    { sampleId: "heldout-hit", language: "Rust", vulnerable: true, unknownCwe: true, findings: [{ cweId: "CWE-787", startLine: 3, endLine: 3 }] },
    { sampleId: "heldout-miss", language: "Rust", vulnerable: true, unknownCwe: true, findings: [] },
    { sampleId: "safe", language: "Rust", vulnerable: false, findings: [] },
  ];
  const result = scores(rows, (row) => row.findings);
  assert.equal(result.unknownVulnerabilityDetectionRate, 0.5);
  assert.equal(result.unknownVulnerabilitySamples, 2);
  assert.equal(result.byLanguage.Rust.samples, 3);
  assert.equal(result.byLanguage.Rust.recall, 0.5);
});
