# Sentinel — Agentic AI Vulnerability Detection

Sentinel is an **agentic AI-powered source code vulnerability detection system**. It analyzes source code, identifies potential security vulnerabilities, classifies them using **CWE**, and localizes the issues to specific lines and functions.

The system uses a multi-agent pipeline powered by **Google Gemini**.

**Tech Stack:** React · Vite · Node.js · Express · Google Gemini API · Vercel

## Architecture

```text
Source Code
     │
     ▼
Reconnaissance Agent
     │
     ▼
Vulnerability Scan Agent
     │
     ▼
Verification & Localization Agent
     │
     ▼
Verified Vulnerability Findings
```

### Agents

1. **Reconnaissance Agent** — Identifies the programming language and maps important functions, routes, and code structure.

2. **Vulnerability Scan Agent** — Analyzes the code for potential security vulnerabilities and classifies findings using CWE IDs.

3. **Verification Agent** — Reviews the detected vulnerabilities, removes false positives and duplicates, and improves the exact line-level localization.

The complete pipeline can also be executed through:

```text
POST /api/analyze
```

## Key Features

* AI-powered vulnerability detection
* Multi-agent architecture
* CWE classification
* Severity assessment
* Line-level vulnerability localization
* False-positive filtering
* Structured JSON responses
* React-based interactive interface

## Project Structure

```text
client/          React + Vite frontend
server/          Express backend
api/             Vercel serverless API
api/lib/         AI agent logic
```

## Local Setup

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure Gemini

Create a `.env` file:

```env
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=your-gemini-model
```

### 3. Start the backend

```bash
npm run dev:server
```

### 4. Start the frontend

```bash
npm run dev:client
```

Open:

```text
http://localhost:5173
```

## API Endpoints

| Method | Endpoint       | Description                   |
| ------ | -------------- | ----------------------------- |
| GET    | `/api/health`  | Health check                  |
| POST   | `/api/recon`   | Code reconnaissance           |
| POST   | `/api/scan`    | Vulnerability detection       |
| POST   | `/api/verify`  | Verification and localization |
| POST   | `/api/analyze` | Complete analysis pipeline    |

## Deployment

The application can be deployed to **Vercel**.

Configure the following environment variable in Vercel:

```text
GEMINI_API_KEY
```

Optionally:

```text
GEMINI_MODEL
```

The Gemini API key is kept server-side and is never exposed to the frontend.

## Limitations

Sentinel is a prototype and should not be considered a replacement for professional security auditing or production-grade SAST tools.

* AI-generated results may contain false positives or false negatives.
* Source code is limited to approximately 40,000 characters.
* Analysis is stateless and does not maintain scan history.

## Author

**Thulasihan Elitchelvan**

GitHub:
https://github.com/thulasihanelitchelvan

Project:
https://github.com/thulasihanelitchelvan/vuln-agent-app
