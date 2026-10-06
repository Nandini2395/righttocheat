import dotenv from "dotenv";

dotenv.config();

// Vercel injects the current deployment URL and the stable production URL. Allowing them
// automatically means preview deployments (whose hostname changes every time) work without
// anyone editing CORS_ORIGIN by hand.
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter((host): host is string => Boolean(host))
  .map((host) => `https://${host}`);

export const config = {
  // API_PORT takes priority so this never collides with a frontend dev server's own
  // PORT env var when both are launched from the same parent process/shell locally.
  // Falls back to PORT because most Node hosts (Vercel, Render, Railway) inject PORT
  // themselves and expect the app to bind to it.
  port: Number(process.env.API_PORT || process.env.PORT || 8787),
  // Comma-separated list, e.g. "http://localhost:5173,https://you.vercel.app"
  corsOrigins: [
    ...(process.env.CORS_ORIGIN || "http://localhost:5173")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),
    ...vercelOrigins,
  ],

  // Optional. When set, Google Programmable Search is used; otherwise the app falls back to
  // keyless sources (DuckDuckGo + Wikipedia) so it works with no configuration at all.
  googleSearch: {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY || "",
    engineId: process.env.GOOGLE_SEARCH_ENGINE_ID || "",
  },

  historyStore: (process.env.HISTORY_STORE || "file") as "file" | "postgres",
  databaseUrl: process.env.DATABASE_URL || "",

  // Minimum OCR confidence (0-1) required before attempting an answer.
  minOcrConfidence: Number(process.env.MIN_OCR_CONFIDENCE || 0.55),
};

export function isSearchConfigured(): boolean {
  return Boolean(config.googleSearch.apiKey && config.googleSearch.engineId);
}
