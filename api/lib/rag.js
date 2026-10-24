import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(HERE, "../../data");
const CWE_FILE = path.join(DATA_DIR, "cwe-knowledge-base.json");
const CVE_FILE = path.join(DATA_DIR, "cve-knowledge-base.json");

function readJson(filePath, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    if (error.code !== "ENOENT") console.warn(`Could not load ${path.basename(filePath)}: ${error.message}`);
    return fallback;
  }
}

function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z0-9_+#.-]{2,}/g) || [];
}

function documentText(doc) {
  return [doc.id, doc.title, doc.name, doc.summary, doc.description, doc.impact, doc.mitigation,
    ...(Array.isArray(doc.keywords) ? doc.keywords : []), doc.language, doc.cweId, doc.cveId].filter(Boolean).join(" ");
}

/**
 * Lightweight local retrieval for the project prototype. This deliberately works
 * without a vector database or paid embedding service. It ranks curated CWE pages
 * and any imported CVE records by token overlap. Replace/extend this retriever
 * with embeddings for a larger corpus without changing the agent API.
 */
export function retrieveSecurityKnowledge(query, { topK = 5 } = {}) {
  const docs = [
    ...readJson(CWE_FILE, []),
    ...readJson(CVE_FILE, []),
  ];
  const queryTokens = tokenize(query);
  const queryCounts = new Map();
  for (const token of queryTokens) queryCounts.set(token, (queryCounts.get(token) || 0) + 1);

  const ranked = docs.map((doc) => {
    const text = documentText(doc);
    const tokens = tokenize(text);
    const set = new Set(tokens);
    let score = 0;
    for (const [token, count] of queryCounts) {
      if (set.has(token)) score += 1 + Math.min(count - 1, 2) * 0.2;
    }
    // Strongly prioritize an exact CWE/CVE identifier mentioned in the input.
    if (doc.id && query.toUpperCase().includes(String(doc.id).toUpperCase())) score += 8;
    if (doc.cweId && query.toUpperCase().includes(String(doc.cweId).toUpperCase())) score += 8;
    if (doc.cveId && query.toUpperCase().includes(String(doc.cveId).toUpperCase())) score += 8;
    return { doc, score };
  }).filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.doc.id || "").localeCompare(String(b.doc.id || "")))
    .slice(0, Math.max(1, Math.min(Number(topK) || 5, 10)));

  return {
    method: "local-keyword-retrieval",
    corpus: { cweDocuments: readJson(CWE_FILE, []).length, cveDocuments: readJson(CVE_FILE, []).length },
    documents: ranked.map(({ doc, score }) => ({
      id: doc.id || doc.cweId || doc.cveId || "knowledge-item",
      title: doc.title || doc.name || doc.id || "Security reference",
      source: doc.source || (doc.cveId ? "CVE knowledge base" : "Curated CWE knowledge base"),
      score: Number(score.toFixed(2)),
      cweId: doc.cweId || (String(doc.id || "").startsWith("CWE-") ? doc.id : null),
      cveId: doc.cveId || (String(doc.id || "").startsWith("CVE-") ? doc.id : null),
      summary: doc.summary || doc.description || "",
      impact: doc.impact || "",
      mitigation: doc.mitigation || "",
      reference: doc.reference || null,
    })),
  };
}

export function formatRetrievedKnowledge(retrieved) {
  const docs = retrieved?.documents || [];
  if (!docs.length) return "No relevant security-reference documents matched this code. Use conservative source-grounded reasoning.";
  return docs.map((doc, index) => [
    `[${index + 1}] ${doc.id} — ${doc.title}`,
    `Summary: ${doc.summary}`,
    doc.impact ? `Impact: ${doc.impact}` : "",
    doc.mitigation ? `Mitigation: ${doc.mitigation}` : "",
    doc.reference ? `Reference: ${doc.reference}` : "",
  ].filter(Boolean).join("\n")).join("\n\n");
}
