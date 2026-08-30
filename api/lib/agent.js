import { callClaude, extractJson, numberLines } from "./claude.js";

const MAX_CODE_CHARS = 40000; // guard against huge pastes blowing the token budget

function assertCode(code) {
  if (typeof code !== "string" || !code.trim()) {
    const err = new Error("`code` is required and must be a non-empty string.");
    err.status = 400;
    throw err;
  }
  if (code.length > MAX_CODE_CHARS) {
    const err = new Error(
      `Code is too long (${code.length} chars). This prototype supports up to ${MAX_CODE_CHARS} characters.`
    );
    err.status = 400;
    throw err;
  }
}

/**
 * Stage 1 — Reconnaissance agent.
 * Maps the submitted code's language and structure so later stages have context.
 */
export async function runRecon(code) {
  assertCode(code);
  const numbered = numberLines(code);

  const system =
    "You are a code reconnaissance agent inside a security analysis pipeline. " +
    "Given source code with line numbers prefixed, identify the programming language and list the top-level " +
    "functions/methods/routes with their approximate line ranges. Respond with ONLY minified JSON, no prose, no markdown fences. " +
    'Schema: {"language":"string","summary":"one sentence describing what the code does","functions":[{"name":"string","startLine":number,"endLine":number}]}. ' +
    "Limit to at most 8 functions.";

  const raw = await callClaude(system, numbered, 800);
  return extractJson(raw);
}

/**
 * Stage 2 — Vulnerability scan agent.
 * Uses the recon map + code to find candidate bugs/vulnerabilities and classify each into a CWE.
 */
export async function runScan(code, recon) {
  assertCode(code);
  const numbered = numberLines(code);

  const system =
    "You are a vulnerability scanning agent inside a security analysis pipeline. You receive line-numbered source " +
    "code and a structural map from a reconnaissance agent. Analyze the code for bugs and security vulnerabilities " +
    "(e.g. injection flaws, command injection, hardcoded secrets, improper authentication, insecure deserialization, " +
    "path traversal, XSS, broken access control, weak crypto, null/undefined handling bugs, resource leaks, etc). " +
    "For each issue found, classify it into the most appropriate CWE ID. Respond with ONLY minified JSON, no prose, no markdown fences. " +
    'Schema: {"findings":[{"id":"string short slug","title":"short issue title","cweId":"CWE-XXX","cweName":"official CWE name",' +
    '"severity":"critical|high|medium|low","functionName":"string or null","startLine":number,"endLine":number,' +
    '"explanation":"2-3 sentence explanation of the issue and why it is a risk","recommendation":"1-2 sentence fix suggestion"}]}. ' +
    "Report at most 8 of the most important findings, ordered by severity descending. If the code has no real issues, return an empty findings array — do not invent problems.";

  const userPrompt = `Reconnaissance map:\n${JSON.stringify(recon || {})}\n\nLine-numbered source code:\n${numbered}`;
  const raw = await callClaude(system, userPrompt, 1400);
  const data = extractJson(raw);
  return Array.isArray(data.findings) ? data.findings : [];
}

/**
 * Stage 3 — Verification & localization agent.
 * Final quality gate: drops false positives, dedupes, and tightens CWE + line accuracy.
 */
export async function runVerify(code, findings) {
  assertCode(code);
  const numbered = numberLines(code);

  const system =
    "You are a verification agent inside a security analysis pipeline, the final quality gate. You receive candidate " +
    "vulnerability findings from a scanning agent along with the original line-numbered source code. Your job: " +
    "(1) discard any candidate that is not a genuine, code-grounded issue (no speculation), (2) merge near-duplicate " +
    "findings, (3) double check and correct the CWE classification and the exact startLine/endLine so they precisely " +
    "point at the offending code, (4) tighten the explanation to be accurate and concise. Respond with ONLY minified JSON, no prose, no markdown fences. " +
    'Schema identical to input: {"findings":[{"id":"string","title":"string","cweId":"CWE-XXX","cweName":"string",' +
    '"severity":"critical|high|medium|low","functionName":"string or null","startLine":number,"endLine":number,' +
    '"explanation":"string","recommendation":"string"}]}.';

  const userPrompt = `Candidate findings:\n${JSON.stringify(findings || [])}\n\nLine-numbered source code:\n${numbered}`;
  const raw = await callClaude(system, userPrompt, 1400);
  const data = extractJson(raw);
  const list = Array.isArray(data.findings) ? data.findings : [];
  return list.map((f, i) => ({ ...f, id: f.id || `finding-${i}` }));
}

/**
 * Runs all three stages back to back — used by the single-request /api/analyze endpoint.
 */
export async function runFullPipeline(code) {
  const recon = await runRecon(code);
  const candidates = await runScan(code, recon);
  const findings = await runVerify(code, candidates);
  return { recon, findings };
}
