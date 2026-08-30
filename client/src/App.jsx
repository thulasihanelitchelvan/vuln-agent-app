import React, { useState, useRef, useEffect } from "react";
import {
  ShieldAlert,
  ScanLine,
  Bug,
  CheckCircle2,
  Loader2,
  ChevronRight,
  AlertTriangle,
  Terminal,
  Play,
  RotateCcw,
  Copy,
  Check,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Design tokens: a dark "security console" aesthetic grounded in the subject
// — code scanning. Monospace throughout, cyan scan-accent, severity ramp for
// findings, animated scan-line as the signature element.
// ---------------------------------------------------------------------------
const SEVERITY = {
  critical: { label: "Critical", color: "#FB4B4B", bg: "rgba(251,75,75,0.12)", ring: "rgba(251,75,75,0.35)" },
  high: { label: "High", color: "#FF9F45", bg: "rgba(255,159,69,0.12)", ring: "rgba(255,159,69,0.35)" },
  medium: { label: "Medium", color: "#FFD866", bg: "rgba(255,216,102,0.12)", ring: "rgba(255,216,102,0.35)" },
  low: { label: "Low", color: "#4C9AFF", bg: "rgba(76,154,255,0.12)", ring: "rgba(76,154,255,0.35)" },
};

const AGENT_STEPS = [
  { key: "recon", label: "Reconnaissance", icon: Terminal },
  { key: "scan", label: "Vulnerability Scan", icon: Bug },
  { key: "verify", label: "Verify & Localize", icon: ShieldAlert },
];

const SAMPLE_CODE = `import sqlite3
from flask import Flask, request

app = Flask(__name__)

def get_user(username):
    conn = sqlite3.connect("app.db")
    cur = conn.cursor()
    query = "SELECT * FROM users WHERE username = '" + username + "'"
    cur.execute(query)
    return cur.fetchone()

@app.route("/login")
def login():
    username = request.args.get("username")
    password = request.args.get("password")
    user = get_user(username)
    if user and user[2] == password:
        return "Welcome " + username
    return "Access denied"

@app.route("/run")
def run_cmd():
    cmd = request.args.get("cmd")
    import os
    os.system(cmd)
    return "done"
`;

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request to ${path} failed (${res.status})`);
  }
  return data;
}

function numberedLines(code) {
  return code.split("\n");
}

export default function App() {
  const [code, setCode] = useState(SAMPLE_CODE);
  const [status, setStatus] = useState("idle"); // idle | running | done | error
  const [activeStep, setActiveStep] = useState(-1);
  const [log, setLog] = useState([]);
  const [recon, setRecon] = useState(null);
  const [findings, setFindings] = useState(null);
  const [selectedFinding, setSelectedFinding] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  function pushLog(text, tone = "dim") {
    setLog((l) => [...l, { text, tone, t: Date.now() }]);
  }

  async function runAgent() {
    if (!code.trim()) return;
    setStatus("running");
    setActiveStep(0);
    setLog([]);
    setRecon(null);
    setFindings(null);
    setSelectedFinding(null);
    setErrorMsg("");

    try {
      // ---------------- Stage 1: Reconnaissance ----------------
      pushLog("agent.recon > reading source, identifying language and structure...");
      const { recon: reconData } = await api("/api/recon", { code });
      setRecon(reconData);
      pushLog(
        `agent.recon > language=${reconData.language} | ${reconData.functions?.length || 0} function(s) mapped`,
        "cyan"
      );
      setActiveStep(1);

      // ---------------- Stage 2: Vulnerability scan ----------------
      pushLog("agent.scan > running vulnerability heuristics against mapped regions...");
      const { findings: rawFindings } = await api("/api/scan", { code, recon: reconData });
      pushLog(`agent.scan > ${rawFindings.length} candidate issue(s) detected`, "amber");
      setActiveStep(2);

      // ---------------- Stage 3: Verify & localize ----------------
      pushLog("agent.verify > cross-checking candidates and refining fault locations...");
      const { findings: verifiedFindings } = await api("/api/verify", { code, findings: rawFindings });
      const finalFindings = verifiedFindings.map((f, i) => ({ ...f, _key: f.id || `finding-${i}` }));
      pushLog(`agent.verify > ${finalFindings.length} confirmed finding(s) after verification`, "green");
      pushLog("agent.pipeline > analysis complete", "green");

      setFindings(finalFindings);
      setSelectedFinding(finalFindings[0] || null);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong during analysis.");
      pushLog(`agent.error > ${err.message}`, "red");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setActiveStep(-1);
    setLog([]);
    setRecon(null);
    setFindings(null);
    setSelectedFinding(null);
    setErrorMsg("");
  }

  function copyCode() {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const lines = numberedLines(code);
  const running = status === "running";

  function lineFindings(lineNum) {
    return (findings || []).filter((f) => lineNum >= f.startLine && lineNum <= f.endLine);
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 md:p-8" style={{ background: "#05060A" }}>
      <div
        className="w-full max-w-6xl rounded-xl overflow-hidden font-mono text-sm"
        style={{ background: "#0A0C10", color: "#C9D1D9", border: "1px solid #1E2530" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "#1E2530", background: "#0D1017" }}
        >
          <div className="flex items-center gap-2.5">
            <ShieldAlert size={18} color="#4CD9C0" />
            <span className="tracking-widest text-xs uppercase font-semibold" style={{ color: "#C9D1D9" }}>
              Sentinel · Agentic Vulnerability Scanner
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] uppercase tracking-wider px-2 py-1 rounded"
              style={{
                color:
                  status === "idle" ? "#6B7280" : status === "running" ? "#4CD9C0" : status === "error" ? "#FB4B4B" : "#4CD9C0",
                border: `1px solid ${
                  status === "idle" ? "#2A303B" : status === "running" ? "#1B4A44" : status === "error" ? "#4A1B1B" : "#1B4A44"
                }`,
                background: status === "running" ? "rgba(76,217,192,0.06)" : "transparent",
              }}
            >
              {status === "idle" && "standby"}
              {status === "running" && "pipeline active"}
              {status === "done" && "scan complete"}
              {status === "error" && "error"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0" style={{ minHeight: 640 }}>
          {/* LEFT: code input */}
          <div className="flex flex-col border-r" style={{ borderColor: "#1E2530" }}>
            <div
              className="flex items-center justify-between px-4 py-2 border-b text-xs"
              style={{ borderColor: "#1E2530", background: "#0D1017", color: "#6B7280" }}
            >
              <span className="uppercase tracking-wider">Source Input</span>
              <div className="flex items-center gap-3">
                <button onClick={copyCode} className="flex items-center gap-1 hover:opacity-80 transition-opacity" style={{ color: "#6B7280" }}>
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "copied" : "copy"}
                </button>
                <button
                  onClick={() => setCode(SAMPLE_CODE)}
                  disabled={running}
                  className="hover:opacity-80 transition-opacity disabled:opacity-40"
                  style={{ color: "#4C9AFF" }}
                >
                  load sample
                </button>
              </div>
            </div>

            <div className="relative flex-1 overflow-auto" style={{ background: "#0A0C10" }}>
              {status === "done" && findings ? (
                <div className="flex text-[13px] leading-[1.6]">
                  <div className="select-none text-right pr-3 pl-4 py-3" style={{ color: "#3B4252", background: "#0B0E14", minWidth: 46 }}>
                    {lines.map((_, i) => (
                      <div key={i}>{i + 1}</div>
                    ))}
                  </div>
                  <pre className="py-3 pr-4 flex-1 overflow-x-auto whitespace-pre">
                    {lines.map((l, i) => {
                      const fs = lineFindings(i + 1);
                      const top = fs[0];
                      const active = selectedFinding && fs.some((f) => f._key === selectedFinding._key);
                      return (
                        <div
                          key={i}
                          style={{
                            background: top ? SEVERITY[top.severity]?.bg : "transparent",
                            borderLeft: top ? `2px solid ${SEVERITY[top.severity]?.color}` : "2px solid transparent",
                            boxShadow: active ? `inset 0 0 0 1px ${SEVERITY[top.severity]?.ring}` : "none",
                            cursor: top ? "pointer" : "default",
                          }}
                          onClick={() => top && setSelectedFinding(fs[0])}
                          className="pl-2 -ml-0.5"
                        >
                          {l || " "}
                        </div>
                      );
                    })}
                  </pre>
                </div>
              ) : (
                <textarea
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={running}
                  spellCheck={false}
                  className="w-full h-full p-4 resize-none outline-none text-[13px] leading-[1.6]"
                  style={{ background: "transparent", color: "#C9D1D9", minHeight: 560 }}
                  placeholder="Paste source code to analyze..."
                />
              )}

              {running && (
                <div
                  className="pointer-events-none absolute left-0 right-0"
                  style={{
                    height: 2,
                    background: "linear-gradient(90deg, transparent, #4CD9C0, transparent)",
                    boxShadow: "0 0 14px 2px rgba(76,217,192,0.6)",
                    animation: "scanmove 2.1s ease-in-out infinite",
                  }}
                />
              )}
            </div>

            <style>{`
              @keyframes scanmove {
                0% { top: 0%; opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { top: 98%; opacity: 0; }
              }
            `}</style>

            <div className="px-4 py-3 border-t flex items-center gap-3" style={{ borderColor: "#1E2530", background: "#0D1017" }}>
              {status !== "done" ? (
                <button
                  onClick={runAgent}
                  disabled={running || !code.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold tracking-wide uppercase transition-opacity disabled:opacity-40"
                  style={{ background: "#4CD9C0", color: "#0A0C10" }}
                >
                  {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {running ? "Analyzing…" : "Run Agentic Scan"}
                </button>
              ) : (
                <button
                  onClick={reset}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold tracking-wide uppercase transition-opacity"
                  style={{ background: "transparent", border: "1px solid #2A303B", color: "#C9D1D9" }}
                >
                  <RotateCcw size={14} />
                  New Scan
                </button>
              )}
              {recon && <span className="text-xs" style={{ color: "#6B7280" }}>{recon.language ? `detected: ${recon.language}` : ""}</span>}
            </div>
          </div>

          {/* RIGHT: agent pipeline + results */}
          <div className="flex flex-col">
            <div className="px-4 py-3 border-b" style={{ borderColor: "#1E2530", background: "#0D1017" }}>
              <div className="text-xs uppercase tracking-wider mb-2.5" style={{ color: "#6B7280" }}>
                Agent Pipeline
              </div>
              <div className="flex items-center gap-1">
                {AGENT_STEPS.map((s, i) => {
                  const Icon = s.icon;
                  const isActive = running && activeStep === i;
                  const isDone = status === "done" || (running && activeStep > i);
                  return (
                    <React.Fragment key={s.key}>
                      <div
                        className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md"
                        style={{
                          background: isActive ? "rgba(76,217,192,0.08)" : "transparent",
                          border: `1px solid ${isActive ? "#1B4A44" : "transparent"}`,
                        }}
                      >
                        {isDone ? (
                          <CheckCircle2 size={14} color="#4CD9C0" />
                        ) : isActive ? (
                          <Loader2 size={14} className="animate-spin" color="#4CD9C0" />
                        ) : (
                          <Icon size={14} color="#3B4252" />
                        )}
                        <span className="text-[11px] font-semibold" style={{ color: isActive || isDone ? "#C9D1D9" : "#3B4252" }}>
                          {s.label}
                        </span>
                      </div>
                      {i < AGENT_STEPS.length - 1 && <ChevronRight size={12} color="#2A303B" />}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div
              className="px-4 py-2.5 border-b text-[11px] leading-relaxed overflow-y-auto"
              style={{ borderColor: "#1E2530", background: "#08090D", maxHeight: 120, color: "#6B7280" }}
            >
              {log.length === 0 && <div style={{ color: "#3B4252" }}>// agent log will stream here during analysis</div>}
              {log.map((l, i) => (
                <div
                  key={i}
                  style={{
                    color:
                      l.tone === "cyan" ? "#4CD9C0" : l.tone === "amber" ? "#FF9F45" : l.tone === "green" ? "#4CD9C0" : l.tone === "red" ? "#FB4B4B" : "#6B7280",
                  }}
                >
                  {l.text}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>

            <div className="flex-1 overflow-y-auto">
              {status === "idle" && (
                <div className="h-full flex flex-col items-center justify-center gap-3 px-8 text-center" style={{ color: "#3B4252" }}>
                  <ScanLine size={28} />
                  <p className="text-xs leading-relaxed">
                    Paste code on the left and run the scan. The agent pipeline will map the code, hunt for
                    vulnerabilities, then verify and localize each fault before reporting results here.
                  </p>
                </div>
              )}

              {status === "error" && (
                <div className="p-4 flex items-start gap-2 text-xs" style={{ color: "#FB4B4B" }}>
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold mb-1">Analysis failed</div>
                    <div style={{ color: "#8b8f98" }}>{errorMsg}</div>
                  </div>
                </div>
              )}

              {status === "done" && findings && findings.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-2 px-8 text-center" style={{ color: "#4CD9C0" }}>
                  <CheckCircle2 size={28} />
                  <p className="text-xs">No vulnerabilities were confirmed by the verification agent.</p>
                </div>
              )}

              {status === "done" && findings && findings.length > 0 && (
                <div className="divide-y" style={{ borderColor: "#1E2530" }}>
                  {findings.map((f) => {
                    const sev = SEVERITY[f.severity] || SEVERITY.medium;
                    const active = selectedFinding && selectedFinding._key === f._key;
                    return (
                      <div
                        key={f._key}
                        onClick={() => setSelectedFinding(f)}
                        className="px-4 py-3 cursor-pointer transition-colors"
                        style={{ background: active ? "rgba(76,217,192,0.05)" : "transparent", borderLeft: active ? "2px solid #4CD9C0" : "2px solid transparent" }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-[13px] font-semibold" style={{ color: "#C9D1D9" }}>
                            {f.title}
                          </span>
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0" style={{ color: sev.color, background: sev.bg }}>
                            {sev.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] mb-1.5" style={{ color: "#6B7280" }}>
                          <span className="px-1.5 py-0.5 rounded font-semibold" style={{ background: "rgba(76,154,255,0.1)", color: "#4C9AFF" }}>
                            {f.cweId}
                          </span>
                          <span>{f.cweName}</span>
                        </div>
                        <div className="text-[11px] mb-1" style={{ color: "#8b8f98" }}>
                          line{f.startLine !== f.endLine ? "s" : ""} {f.startLine}
                          {f.startLine !== f.endLine ? `–${f.endLine}` : ""}
                          {f.functionName ? ` · ${f.functionName}()` : ""}
                        </div>
                        {active && (
                          <div className="mt-2 text-[11px] leading-relaxed space-y-1.5" style={{ color: "#9BA3AF" }}>
                            <p>{f.explanation}</p>
                            {f.recommendation && (
                              <p style={{ color: "#4CD9C0" }}>
                                <span style={{ color: "#6B7280" }}>fix » </span>
                                {f.recommendation}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
