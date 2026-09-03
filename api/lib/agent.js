import { callClaude, extractJson, numberLines } from "./claude.js";

const MAX_CODE_CHARS = 40000; // guard against huge pastes blowing the token budget

function assertCode(code) {
  if (typeof code !== "string" || !code.trim()) {
    const err = new Error(
      "`code` is required and must be a non-empty string."
    );
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
 *
 * Maps the submitted code's language and structure so later stages
 * have context.
 */
export async function runRecon(code) {
  assertCode(code);

  const numbered = numberLines(code);

  const system =
    "You are a code reconnaissance agent inside a security analysis pipeline. " +
    "Given source code with line numbers prefixed, identify the programming language and list the top-level " +
    "functions/methods/routes with their approximate line ranges. " +
    "Return only the requested JSON structure. " +
    "Limit to at most 8 functions.";

  const responseSchema = {
    type: "object",
    properties: {
      language: {
        type: "string",
      },
      summary: {
        type: "string",
      },
      functions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
            },
            startLine: {
              type: "integer",
            },
            endLine: {
              type: "integer",
            },
          },
          required: [
            "name",
            "startLine",
            "endLine",
          ],
        },
      },
    },
    required: [
      "language",
      "summary",
      "functions",
    ],
  };

  const raw = await callClaude(
    system,
    numbered,
    1000,
    responseSchema
  );

  return extractJson(raw);
}

/**
 * Stage 2 — Vulnerability scan agent.
 *
 * Uses the recon map + code to find candidate bugs/vulnerabilities
 * and classify each into a CWE.
 */
export async function runScan(code, recon) {
  assertCode(code);

  const numbered = numberLines(code);

  const system =
    "You are a vulnerability scanning agent inside a security analysis pipeline. " +
    "You receive line-numbered source code and a structural map from a reconnaissance agent. " +
    "Analyze the code for genuine bugs and security vulnerabilities, including injection flaws, command injection, " +
    "hardcoded secrets, improper authentication, insecure deserialization, path traversal, XSS, broken access control, " +
    "weak cryptography, null/undefined handling bugs, resource leaks, and other relevant security issues. " +
    "For every genuine issue, classify it using the most appropriate CWE ID. " +
    "Do not invent vulnerabilities. Only report issues that are directly supported by the source code. " +
    "Report at most 5 important findings, ordered from highest to lowest severity. " +
    "Keep each explanation to 1-2 concise sentences and each recommendation to 1 concise sentence.";

  const responseSchema = {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            title: {
              type: "string",
            },
            cweId: {
              type: "string",
            },
            cweName: {
              type: "string",
            },
            severity: {
              type: "string",
              enum: [
                "critical",
                "high",
                "medium",
                "low",
              ],
            },
            functionName: {
              type: "string",
              nullable: true,
            },
            startLine: {
              type: "integer",
            },
            endLine: {
              type: "integer",
            },
            explanation: {
              type: "string",
            },
            recommendation: {
              type: "string",
            },
          },
          required: [
            "id",
            "title",
            "cweId",
            "cweName",
            "severity",
            "functionName",
            "startLine",
            "endLine",
            "explanation",
            "recommendation",
          ],
        },
      },
    },
    required: [
      "findings",
    ],
  };

  const userPrompt =
    `Reconnaissance map:\n${JSON.stringify(recon || {})}` +
    `\n\nLine-numbered source code:\n${numbered}`;

  const raw = await callClaude(
    system,
    userPrompt,
    4000,
    responseSchema
  );

  const data = extractJson(raw);

  return Array.isArray(data.findings)
    ? data.findings.slice(0, 5)
    : [];
}

/**
 * Stage 3 — Verification & localization agent.
 *
 * Final quality gate: drops false positives, dedupes, and tightens
 * CWE + line accuracy.
 */
export async function runVerify(code, findings) {
  assertCode(code);

  const numbered = numberLines(code);

  const system =
    "You are a verification agent inside a security analysis pipeline and the final quality gate. " +
    "You receive candidate vulnerability findings from a scanning agent along with the original line-numbered source code. " +
    "Discard any candidate that is not a genuine code-grounded issue. Do not speculate. " +
    "Merge near-duplicate findings. Double-check and correct the CWE classification and exact startLine/endLine. " +
    "Tighten explanations so they are accurate and concise. " +
    "Only return findings that are supported by the source code.";

  const responseSchema = {
    type: "object",
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
            },
            title: {
              type: "string",
            },
            cweId: {
              type: "string",
            },
            cweName: {
              type: "string",
            },
            severity: {
              type: "string",
              enum: [
                "critical",
                "high",
                "medium",
                "low",
              ],
            },
            functionName: {
              type: "string",
              nullable: true,
            },
            startLine: {
              type: "integer",
            },
            endLine: {
              type: "integer",
            },
            explanation: {
              type: "string",
            },
            recommendation: {
              type: "string",
            },
          },
          required: [
            "id",
            "title",
            "cweId",
            "cweName",
            "severity",
            "functionName",
            "startLine",
            "endLine",
            "explanation",
            "recommendation",
          ],
        },
      },
    },
    required: [
      "findings",
    ],
  };

  const userPrompt =
    `Candidate findings:\n${JSON.stringify(findings || [])}` +
    `\n\nLine-numbered source code:\n${numbered}`;

  const raw = await callClaude(
    system,
    userPrompt,
    4000,
    responseSchema
  );

  const data = extractJson(raw);

  const list = Array.isArray(data.findings)
    ? data.findings
    : [];

  return list.map((finding, index) => ({
    ...finding,
    id: finding.id || `finding-${index}`,
  }));
}

/**
 * Runs all three stages back to back.
 *
 * Used by the single-request /api/analyze endpoint.
 */
export async function runFullPipeline(code) {
  const recon = await runRecon(code);

  const candidates = await runScan(
    code,
    recon
  );

  const findings = await runVerify(
    code,
    candidates
  );

  return {
    recon,
    findings,
  };
}