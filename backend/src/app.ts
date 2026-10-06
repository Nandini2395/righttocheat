import express from "express";
import cors from "cors";
import fs from "fs";
import morgan from "morgan";
import path from "path";
import rateLimit from "express-rate-limit";
import { config, isSearchConfigured } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import analyzeRouter from "./routes/analyze";
import historyRouter from "./routes/history";

/**
 * Builds the Express app without binding a port, so the same app serves local dev, a
 * single-process deployment, and Vercel's backend service.
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

  serveBuiltFrontend(app);

  app.use(errorHandler);

  return app;
}

/**
 * When a production build of the frontend exists next to the backend, serve it from this
 * same process. That makes the whole app a single origin on one port — which is what lets it
 * be exposed through one HTTPS tunnel or run on any plain Node host, with no separate static
 * host and no CORS. On Vercel the frontend is its own service, so this directory won't exist
 * and the block is skipped.
 */
function serveBuiltFrontend(app: express.Express) {
  const distDir = path.resolve(__dirname, "..", "..", "frontend", "dist");
  if (!fs.existsSync(path.join(distDir, "index.html"))) return;

  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}
