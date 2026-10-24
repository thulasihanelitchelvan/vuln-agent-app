import express from "express";
import cors from "cors";
import { runRecon, runScan, runVerify, runFullPipeline } from "../api/lib/agent.js";
import { retrieveSecurityKnowledge } from "../api/lib/rag.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

function handleError(res, error) {
  console.error(error);
  const status = Number.isInteger(error.status) ? error.status : 500;
  res.status(status).json({ error: error.message || "Internal server error" });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "Google Gemini",
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.post("/api/recon", async (req, res) => {
  try {
    const { code } = req.body || {};
    res.json({ recon: await runRecon(code) });
  } catch (error) { handleError(res, error); }
});

app.post("/api/scan", async (req, res) => {
  try {
    const { code, recon } = req.body || {};
    const ragContext = retrieveSecurityKnowledge(code, { topK: process.env.RAG_TOP_K || 5 });
    const findings = await runScan(code, recon, ragContext);
    res.json({ findings, ragContext });
  } catch (error) { handleError(res, error); }
});

app.post("/api/verify", async (req, res) => {
  try {
    const { code, findings, ragContext } = req.body || {};
    const context = ragContext || retrieveSecurityKnowledge(`${code || ""}\n${JSON.stringify(findings || [])}`, { topK: process.env.RAG_TOP_K || 5 });
    res.json({ findings: await runVerify(code, findings, context) });
  } catch (error) { handleError(res, error); }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const body = req.body || {};
    res.json(await runFullPipeline(body.code, body.options || {}));
  }
  catch (error) { handleError(res, error); }
});

app.post("/api/knowledge/search", (req, res) => {
  try {
    const { query, topK } = req.body || {};
    if (typeof query !== "string" || !query.trim()) return res.status(400).json({ error: "`query` must be a non-empty string." });
    res.json(retrieveSecurityKnowledge(query, { topK: topK || process.env.RAG_TOP_K || 5 }));
  } catch (error) { handleError(res, error); }
});

export default app;
