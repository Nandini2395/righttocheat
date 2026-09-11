import dotenv from "dotenv";

dotenv.config();

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

export const config = {
  // API_PORT takes priority so this never collides with a frontend dev server's own
  // PORT env var when both are launched from the same parent process/shell locally.
  // Falls back to PORT because most Node hosts (Render, Railway, Heroku-style) inject
  // PORT themselves and expect the app to bind to it.
  port: Number(process.env.API_PORT || process.env.PORT || 8787),
  // Comma-separated list, e.g. "http://localhost:5173,https://you.github.io"
  corsOrigins: (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  llmProvider: (process.env.LLM_PROVIDER || "google") as "anthropic" | "openai" | "google",

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    visionModel: process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5",
    textModel: process.env.ANTHROPIC_TEXT_MODEL || "claude-sonnet-5",
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    visionModel: process.env.OPENAI_VISION_MODEL || "gpt-4o",
    textModel: process.env.OPENAI_TEXT_MODEL || "gpt-4o",
  },

  // Google Gemini — has a free tier with no credit card required, so this is the
  // default provider for anyone who doesn't already have an Anthropic/OpenAI key.
  // Get a key at https://aistudio.google.com/apikey
  google: {
    apiKey: process.env.GEMINI_API_KEY || "",
    visionModel: process.env.GEMINI_VISION_MODEL || "gemini-flash-lite-latest",
    textModel: process.env.GEMINI_TEXT_MODEL || "gemini-flash-lite-latest",
  },

  googleSearch: {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY || "",
    engineId: process.env.GOOGLE_SEARCH_ENGINE_ID || "",
  },

  historyStore: (process.env.HISTORY_STORE || "file") as "file" | "postgres",
  databaseUrl: process.env.DATABASE_URL || "",

  minOcrConfidence: Number(process.env.MIN_OCR_CONFIDENCE || 0.55),
};

export function assertLlmConfigured(): string | null {
  if (config.llmProvider === "anthropic" && !config.anthropic.apiKey) {
    return "ANTHROPIC_API_KEY is not set. Add it to backend/.env.";
  }
  if (config.llmProvider === "openai" && !config.openai.apiKey) {
    return "OPENAI_API_KEY is not set. Add it to backend/.env.";
  }
  if (config.llmProvider === "google" && !config.google.apiKey) {
    return "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it to backend/.env.";
  }
  return null;
}

export function isSearchConfigured(): boolean {
  return Boolean(config.googleSearch.apiKey && config.googleSearch.engineId);
}
