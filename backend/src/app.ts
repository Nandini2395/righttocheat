import express from "express";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config, isSearchConfigured } from "./config";
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

  // Browsers DO send an Origin header on same-origin POSTs, so a single-domain deploy
  // (frontend and API behind one host, as on Vercel) must treat same-origin as allowed —
  // otherwise the app blocks its own requests. Cross-origin callers still need to be
  // listed in CORS_ORIGIN. A rejected origin simply gets no CORS headers (the browser
  // then blocks it) rather than erroring the request into a 500.
  app.use(
    cors((req, callback) => {
      const origin = req.headers.origin;
      if (!origin) return callback(null, { origin: true });

      let isSameOrigin = false;
      try {
        isSameOrigin = Boolean(req.headers.host) && new URL(origin).host === req.headers.host;
      } catch {
        isSameOrigin = false;
      }

      const allowed = isSameOrigin || config.corsOrigins.includes(origin);
      callback(null, { origin: allowed });
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
      searchProvider: isSearchConfigured() ? "google" : "duckduckgo+wikipedia",
      searchConfigured: isSearchConfigured(),
    });
  });

  app.use("/api/analyze", analyzeLimiter, analyzeRouter);
  app.use("/api/history", historyRouter);

  app.use(errorHandler);

  return app;
}
