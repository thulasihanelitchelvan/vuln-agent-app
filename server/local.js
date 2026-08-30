import app from "./app.js";

const port = process.env.PORT || 8787;

app.listen(port, () => {
  console.log(`Vulnerability agent API listening on http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("Warning: ANTHROPIC_API_KEY is not set. Requests to the agent endpoints will fail.");
  }
});
