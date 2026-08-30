import express from "express";
import cors from "cors";
import { runRecon, runScan, runVerify, runFullPipeline } from "../api/lib/agent.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

function handleError(res, err) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || "Internal server error" });
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY) });
});

// Stage 1 — Reconnaissance
app.post("/api/recon", async (req, res) => {
  try {
    const { code } = req.body || {};
    const recon = await runRecon(code);
    res.json({ recon });
  } catch (err) {
    handleError(res, err);
  }
});

// Stage 2 — Vulnerability scan (depends on stage 1's output)
app.post("/api/scan", async (req, res) => {
  try {
    const { code, recon } = req.body || {};
    const findings = await runScan(code, recon);
    res.json({ findings });
  } catch (err) {
    handleError(res, err);
  }
});

// Stage 3 — Verify & localize (depends on stage 2's output)
app.post("/api/verify", async (req, res) => {
  try {
    const { code, findings } = req.body || {};
    const verified = await runVerify(code, findings);
    res.json({ findings: verified });
  } catch (err) {
    handleError(res, err);
  }
});

// Convenience endpoint: runs the full 3-stage pipeline server-side in one call.
app.post("/api/analyze", async (req, res) => {
  try {
    const { code } = req.body || {};
    const result = await runFullPipeline(code);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

export default app;
