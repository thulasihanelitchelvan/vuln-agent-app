import Anthropic from "@anthropic-ai/sdk";

// One client, reused across invocations (safe for Vercel's warm lambdas).
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

/**
 * Calls Claude with a system prompt + user prompt, expecting a text response.
 * Throws if ANTHROPIC_API_KEY isn't configured or the request fails.
 */
export async function callClaude(systemPrompt, userPrompt, maxTokens = 1200) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set on the server. Add it in your Vercel project's Environment Variables."
    );
  }

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

/**
 * Pulls the first JSON object/array out of a model response, tolerating
 * markdown code fences or stray prose the model might add despite instructions.
 */
export function extractJson(text) {
  let cleaned = text.trim();
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");

  const start = cleaned.search(/[[{]/);
  const lastCurly = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const end = Math.max(lastCurly, lastBracket);

  if (start === -1 || end === -1) {
    throw new Error("No JSON object found in the model's response.");
  }

  cleaned = cleaned.slice(start, end + 1);
  return JSON.parse(cleaned);
}

export function numberLines(code) {
  return code
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");
}
