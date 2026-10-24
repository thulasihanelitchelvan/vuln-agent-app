import test from "node:test";
import assert from "node:assert/strict";
import { retrieveSecurityKnowledge } from "../api/lib/rag.js";

test("retrieves SQL injection CWE guidance for a query-concatenation example", () => {
  const result = retrieveSecurityKnowledge("cursor.execute(\"SELECT * FROM users WHERE name = \" + username)");
  assert.ok(result.documents.some((doc) => doc.cweId === "CWE-89"));
  assert.equal(result.method, "local-keyword-retrieval");
});

test("retrieves the exact CVE record by identifier", () => {
  const result = retrieveSecurityKnowledge("Please explain CVE-2021-44228");
  assert.ok(result.documents.some((doc) => doc.cveId === "CVE-2021-44228"));
});

test("respects the requested retrieval top K", () => {
  const result = retrieveSecurityKnowledge("security vulnerability injection input file command SQL", { topK: 2 });
  assert.ok(result.documents.length <= 2);
});
