import { GoogleGenAI } from "@google/genai";

// One client, reused across invocations (safe for Vercel's warm lambdas).
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

/**
 * Calls Gemini.
 *
 * The function intentionally keeps the name `callClaude()` so the existing
 * Recon, Scan, and Verify agents don't need to be rewritten.
 *
 * responseSchema is optional. When provided, Gemini is instructed to return
 * JSON matching that schema.
 */
export async function callClaude(
  systemPrompt,
  userPrompt,
  maxTokens = 1200,
  responseSchema = null
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set on the server. Add it to your .env file locally or Vercel Environment Variables."
    );
  }

  try {
    const config = {
      systemInstruction: systemPrompt,
      maxOutputTokens: maxTokens,
      responseMimeType: "application/json",
    };

    // Add structured JSON schema when supplied.
    if (responseSchema) {
      config.responseJsonSchema = responseSchema;
    }

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: userPrompt,
      config,
    });

    const text = response?.text;

    if (!text || typeof text !== "string" || !text.trim()) {
      console.error("Gemini returned an empty response.");
      console.error(JSON.stringify(response, null, 2));

      throw new Error("Gemini returned an empty response.");
    }

    return text.trim();
  } catch (error) {
    console.error("Gemini API error:", error);
    throw error;
  }
}

/**
 * Extracts JSON from a model response.
 *
 * Normally Gemini should already return valid JSON because we use
 * responseMimeType + responseJsonSchema. This function remains as a
 * defensive fallback.
 */
export function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Model returned an empty response.");
  }

  let cleaned = text.trim();

  // Remove Markdown code fences if they somehow appear.
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // First attempt: parse the complete response.
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with extraction.
  }

  // Find the first JSON object or array.
  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");

  let start = -1;

  if (objectStart === -1 && arrayStart === -1) {
    console.error("Gemini returned non-JSON text:");
    console.error(cleaned);

    throw new Error("No JSON object found in the model's response.");
  }

  if (objectStart === -1) {
    start = arrayStart;
  } else if (arrayStart === -1) {
    start = objectStart;
  } else {
    start = Math.min(objectStart, arrayStart);
  }

  // Find the final possible JSON closing character.
  const objectEnd = cleaned.lastIndexOf("}");
  const arrayEnd = cleaned.lastIndexOf("]");

  const end = Math.max(objectEnd, arrayEnd);

  if (end === -1 || end < start) {
    console.error("Incomplete Gemini response:");
    console.error(cleaned);

    throw new Error("Incomplete JSON returned by the model.");
  }

  const jsonText = cleaned.slice(start, end + 1);

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Invalid JSON returned by Gemini:");
    console.error(jsonText);

    throw new Error(
      `Gemini returned invalid JSON: ${error.message}`
    );
  }
}

/**
 * Adds line numbers to source code.
 */
export function numberLines(code) {
  return code
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");
}
