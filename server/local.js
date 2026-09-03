import "dotenv/config";
import app from "./app.js";

const port = process.env.PORT || 8787;

app.listen(port, () => {
  console.log(`Vulnerability agent API listening on http://localhost:${port}`);

  if (!process.env.GEMINI_API_KEY) {
    console.warn(
      "Warning: GEMINI_API_KEY is not set. Requests to the agent endpoints will fail."
    );
  }
});