# Sentinel — Agentic AI Vulnerability Detection

A prototype agentic AI system that analyzes pasted source code for bugs and
security vulnerabilities, classifies each into a CWE category, and localizes
the fault to specific lines/functions.

**Stack:** React (Vite) frontend · Express/Node backend · Claude-powered agent
pipeline. Deployable to Vercel as a static frontend + serverless API.

## Architecture

```
client/          React + Vite frontend (the UI you paste code into)
server/app.js    Express app — the actual backend, defines all /api/* routes
server/local.js  Runs the Express app locally with app.listen() for dev
api/[...path].js Vercel serverless entry point — re-exports the same Express
                  app so every /api/* request in production is handled by it
api/lib/         Agent logic shared by both entry points
```

`server/app.js` is the single source of truth for the backend. Locally it
runs under plain Node via `app.listen()`; on Vercel, the same Express app is
invoked directly as a serverless function (an Express app is just a
`(req, res)` handler, so no extra adapter is needed). This means there's one
backend implementation, not two.

### The agent pipeline

Three agents run in sequence, each a separate call to the Claude API, each
depending on the previous stage's output — this is what makes it "agentic"
rather than a single one-shot prompt:

1. **Reconnaissance agent** (`POST /api/recon`) — reads the submitted code,
   identifies the language, and maps out its functions/routes with line
   ranges.
2. **Vulnerability scan agent** (`POST /api/scan`) — takes the recon map +
   code and detects candidate bugs/vulnerabilities, classifying each into a
   CWE ID.
3. **Verify & localize agent** (`POST /api/verify`) — the quality gate:
   drops false positives, merges duplicates, and tightens the exact
   startLine/endLine so each finding points precisely at the offending code.

There's also `POST /api/analyze`, which runs all three stages server-side in
a single request if you'd rather not orchestrate them from the frontend.

The frontend calls the three endpoints in sequence and renders live progress
(an agent log + pipeline status) as each stage completes.

## Local development

Requires Node 18+.

```bash
# 1. Install dependencies (root = backend, client = frontend)
npm run install:all

# 2. Add your Anthropic API key
cp .env.example .env
# edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 3. Run the backend (terminal 1)
npm run dev:server
# → Express API on http://localhost:8787

# 4. Run the frontend (terminal 2)
npm run dev:client
# → Vite dev server on http://localhost:5173, proxying /api/* to :8787
```

Open http://localhost:5173, hit "Run Agentic Scan" on the pre-loaded sample
(a Flask app with a SQL injection and a command injection bug baked in), or
paste your own code.

## Deploying to Vercel

1. Push this project to a GitHub repo.
2. In Vercel, "Add New Project" → import the repo.
3. Vercel will read `vercel.json`, which:
   - runs `npm install` at the root (installs backend deps for the `/api`
     functions) and `npm install` inside `client/`
   - builds the frontend with `npm --prefix client run build`
   - serves `client/dist` as the static site
   - auto-detects `api/[...path].js` as a serverless function handling every
     `/api/*` request
4. Before the first deploy (or right after), go to **Project Settings →
   Environment Variables** and add:
   - `ANTHROPIC_API_KEY` — your Anthropic API key (required)
   - `ANTHROPIC_MODEL` — optional, defaults to `claude-sonnet-5`
5. Deploy. Your app will be live at `https://<your-project>.vercel.app`,
   with the frontend calling same-origin `/api/...` routes — no CORS
   configuration needed in production (the `cors()` middleware is there
   mainly so the Vite dev server on a different port can call the local
   Express server during development).

**Note on the API key:** it lives only on the server (`api/lib/claude.js`
reads `process.env.ANTHROPIC_API_KEY`) and is never sent to or exposed in
the browser bundle — the frontend only ever talks to your own `/api/*`
routes.

## Scope

This is a basic prototype per the assignment brief, not a production
vulnerability scanner:
- Each agent call is capped at ~800–1400 output tokens, so the scan reports
  at most ~8 findings per run.
- Submitted code is capped at 40,000 characters (see `MAX_CODE_CHARS` in
  `api/lib/agent.js`) to keep prompts within a reasonable size.
- There's no persistence — every scan is a fresh, stateless run.
