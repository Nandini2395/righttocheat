import express from "express";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config, assertLlmConfigured, isSearchConfigured } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import analyzeRouter from "./routes/analyze";
import historyRouter from "./routes/history";

/**
 * Builds the Express app without binding a port, so it can be used both by the local
 * dev server (index.ts) and by the Vercel serverless entrypoint (/api/index.ts), where
 * the platform owns the listener.
 */
export function createApp() {
  const app = express();

  // Required when running behind Vercel's proxy so rate limiting sees the real client IP.
  app.set("trust proxy", 1);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin deploys (Vercel) send no Origin header for same-site requests, and
        // a split frontend/backend deploy must list its frontend origin in CORS_ORIGIN.
        if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
        else callback(new Error(`Origin ${origin} is not allowed by CORS_ORIGIN`));
      },
    })
  );
  app.use(express.json({ limit: "12mb" })); // camera frames as base64 can be a few MB
  app.use(morgan("tiny"));

  const analyzeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20, // generous for a scanning UI, but caps runaway auto-scan loops
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many analyze requests, slow down scanning for a moment." },
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      llmProvider: config.llmProvider,
      llmConfigured: assertLlmConfigured() === null,
      searchConfigured: isSearchConfigured(),
    });
  });

  app.use("/api/analyze", analyzeLimiter, analyzeRouter);
  app.use("/api/history", historyRouter);

  app.use(errorHandler);

  return app;
}
