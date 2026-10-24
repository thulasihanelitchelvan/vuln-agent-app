import { GoogleGenAI } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
let client;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error(
      "GEMINI_API_KEY is not configured. Add it to .env for local use or to the deployment environment variables."
    );
    error.status = 503;
    throw error;
  }
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

/** Generate structured content from Gemini. The API key stays on the server. */
export async function callGemini(systemPrompt, userPrompt, maxTokens = 1800, responseSchema = null) {
  const ai = getClient();
  const config = {
    systemInstruction: systemPrompt,
    maxOutputTokens: maxTokens,
    responseMimeType: "application/json",
    temperature: 0.1,
  };
  if (responseSchema) config.responseJsonSchema = responseSchema;

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: userPrompt,
      config,
    });
    const text = response?.text;
    if (!text || typeof text !== "string" || !text.trim()) {
      throw new Error("Gemini returned an empty response. Check model availability and API quota.");
    }
    return text.trim();
  } catch (error) {
    // Preserve useful Gemini messages, but never expose API key material.
    console.error("Gemini API request failed:", error?.message || error);
    if (error?.status) throw error;
    const wrapped = new Error(`Gemini request failed: ${error?.message || "unknown provider error"}`);
    wrapped.status = error?.statusCode || 502;
    throw wrapped;
  }
}

export function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Gemini returned an empty response.");
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(cleaned); } catch { /* Try extracting the JSON region below. */ }

  const startObject = cleaned.indexOf("{");
  const startArray = cleaned.indexOf("[");
  const starts = [startObject, startArray].filter((n) => n >= 0);
  if (!starts.length) throw new Error("No JSON object or array found in Gemini's response.");
  const start = Math.min(...starts);
  const endObject = cleaned.lastIndexOf("}");
  const endArray = cleaned.lastIndexOf("]");
  const end = Math.max(endObject, endArray);
  if (end < start) throw new Error("Gemini returned incomplete JSON.");
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch (error) { throw new Error(`Gemini returned invalid JSON: ${error.message}`); }
}

export function numberLines(code) {
  return code.split("\n").map((line, index) => `${index + 1}: ${line}`).join("\n");
}
