import express from "express";
import cors from "cors";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { config, assertLlmConfigured, isSearchConfigured } from "./config";
import { errorHandler } from "./middleware/errorHandler";
import analyzeRouter from "./routes/analyze";
import historyRouter from "./routes/history";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin/non-browser requests (no Origin header) and configured origins.
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

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`VQA backend listening on http://localhost:${config.port}`);
  const configError = assertLlmConfigured();
  if (configError) {
    // eslint-disable-next-line no-console
    console.warn(`[warn] ${configError}`);
  }
  if (!isSearchConfigured()) {
    // eslint-disable-next-line no-console
    console.warn("[warn] Google Search API not configured — verification will run without web search.");
  }
});
