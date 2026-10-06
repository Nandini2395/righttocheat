# AI Visual Question Answering

Point a device camera at a question — a worksheet, textbook page, exam, or slide — and get
a verified answer. The app continuously watches the camera feed, extracts the question with
a vision model, generates an answer, and cross-checks that answer against live Google search
results before showing it to you.

```
Camera → Frame Capture → Vision/OCR Extraction → Question Classification
       → Answer Generation → Web Search → Source Verification → Final Answer
```

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS. Camera via `MediaDevices`/`getUserMedia`.
- **Backend**: Node.js + Express + TypeScript.
- **Vision/OCR + reasoning**: configurable LLM provider — Google Gemini (default, free tier, no credit
  card required), Anthropic Claude, or OpenAI, all called with vision input so a single model pass
  handles OCR, question extraction, classification, and (in a second call) answer generation and
  verification reasoning.
- **Search verification**: Google Programmable Search (Custom Search JSON API).
- **History storage**: a zero-config JSON file store (`backend/data/history.json`) by default; see
  [Swapping in PostgreSQL](#swapping-in-postgresql) to use a real database instead.

All API keys live only in `backend/.env` and are never sent to the browser — the frontend only ever
talks to your own backend.

## Project layout

```
api/
  index.ts              Vercel serverless entrypoint (exports the Express app)
backend/                Express API
  src/
    app.ts              Builds the Express app (shared by local server + Vercel function)
    index.ts            Local dev server — binds a port and starts app.ts
    config.ts            Env var loading/validation
    routes/analyze.ts     POST /api/analyze — the full pipeline
    routes/history.ts     GET/DELETE /api/history
    services/
      visionService.ts        Frame -> structured question (OCR + extraction + classification)
      answerService.ts        Question -> answer + explanation + calc steps
      searchService.ts        Google Custom Search wrapper, authoritative-domain scoring
      verificationService.ts  Builds a search query, reasons over results -> verification status
      historyStore.ts         JSON-file backed history persistence
      llmProvider.ts          Anthropic/OpenAI wire-format abstraction
frontend/               React app
  src/
    hooks/useCamera.ts        getUserMedia lifecycle, start/stop/flip
    hooks/useScanner.ts       Auto-scan loop, manual capture, pause/resume, state machine
    utils/imageUtils.ts       Frame capture + client-side blur/sharpness heuristic
    components/
      CameraView.tsx          Live preview + detection indicator overlay
      Controls.tsx             Start/Stop/Flip/Capture/Pause/Auto-scan controls
      ResultsPanel.tsx         Detected question, answer, explanation, verification, sources
      HistoryPanel.tsx         Slide-over history list with clear
      StatusBar.tsx             Bottom status line
    api/client.ts              Typed fetch wrapper around the backend API
```

## Setup

### Prerequisites

- Node.js 18+
- A free Google Gemini API key ([aistudio.google.com/apikey](https://aistudio.google.com/apikey) — no
  credit card required, ~2 minutes) **or** an Anthropic/OpenAI key if you already have one
- A Google Programmable Search Engine + API key (optional but required for Google cross-verification —
  see below)

### 1. Install dependencies

From the repo root (this is an npm workspaces monorepo):

```bash
npm install
```

### 2. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

- `LLM_PROVIDER` — `google` (default, free tier), `anthropic`, or `openai`.
- `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — set the one matching your provider. For
  the default `google` provider, grab a free key at <https://aistudio.google.com/apikey> (sign in with
  any Google account, no billing setup needed) and paste it in as `GEMINI_API_KEY`.
- `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` — for Google cross-verification. Without these,
  the app still works but skips web verification and reports `Likely Correct` based on model reasoning
  alone, with a note in the UI that search wasn't available. (This is separate from `GEMINI_API_KEY` —
  it's the Programmable Search product, not the Gemini model API.)

To set up Google Programmable Search:

1. Create a search engine at <https://programmablesearchengine.google.com/> — set it to "Search the
   entire web" for best results.
2. Copy its **Search engine ID** into `GOOGLE_SEARCH_ENGINE_ID`.
3. Create an API key with the "Custom Search API" enabled at
   <https://console.cloud.google.com/apis/credentials>, put it in `GOOGLE_SEARCH_API_KEY`.

### 3. Configure the frontend

Nothing to do — the frontend calls `/api/...` on its own origin, and Vite's dev server proxies
`/api` to the backend on port 8787. Only set `VITE_API_BASE_URL` (see
[`frontend/.env.example`](frontend/.env.example)) if you host the backend on a *different* origin
than the frontend.

### 4. Run it

From the repo root:

```bash
npm run dev
```

This starts the backend on `http://localhost:8787` and the frontend on `http://localhost:5173`
concurrently. Open the frontend URL, click **Start Camera**, grant permission, and point it at a
question.

> Camera access requires a "secure context" — `localhost` is fine for dev, but if you access the
> frontend from another device on your network (e.g. testing on a phone), you'll need HTTPS or a
> tunnel (e.g. `ngrok`), since browsers block camera access on plain `http://` for non-localhost hosts.

## Deploying to Vercel (and using it on your phone)

The whole app deploys as **one Vercel project**: the Vite frontend as static files, and the same
Express app as a serverless function at `/api`. Because both live on one domain, there's no CORS
setup and no API URL to configure — the frontend just calls `/api/...` on its own origin. Vercel
serves it over HTTPS, which is what mobile browsers require before granting camera access.

How the pieces map:

| File | Role |
| --- | --- |
| [`vercel.json`](vercel.json) | Build command, output dir (`frontend/dist`), and 60s function timeout |
| [`api/index.ts`](api/index.ts) | Serverless entrypoint — exports the Express app from `backend/src/app.ts` |
| [`backend/src/app.ts`](backend/src/app.ts) | Builds the app without binding a port (shared by local dev and Vercel) |

### 1. Push the repo to GitHub

Vercel deploys from a Git repo. Make sure your latest commit is pushed.

### 2. Import the project on Vercel

[vercel.com/new](https://vercel.com/new) → **Import** your repository. Leave every build setting at
its default — `vercel.json` already specifies them. Don't set a Root Directory; it must stay at the
repo root so the `api/` folder is detected.

### 3. Add your API key as an environment variable

In the import screen (or later under **Settings → Environment Variables**) add:

| Name | Value |
| --- | --- |
| `GEMINI_API_KEY` | your key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

Optional: `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` to enable search cross-verification,
and `LLM_PROVIDER`/`GEMINI_VISION_MODEL` to switch provider or model without a code change.

These stay server-side — they're only ever read by the serverless function, never shipped to the
browser. **Do not** prefix them with `VITE_`, which would expose them publicly.

### 4. Deploy, then make it reachable

Hit **Deploy**. When it finishes, check **Settings → Deployment Protection**: if Vercel
Authentication is enabled, anyone opening the link (including you on your phone) hits a Vercel login
wall first. Set it to **Disabled** for a personal demo.

### 5. Open it on your phone

Open the deployment URL (`https://<project>.vercel.app`) in Chrome or Safari, tap **Start Camera**,
tap **Allow**, and point it at a question. Use the rear camera via **Flip** if it starts on the
selfie camera.

If the camera won't start, confirm you're on the `https://` URL (not an IP address) and that you
didn't previously deny the camera permission for that site — on Android: Chrome → ⋮ → Site settings →
Camera; on iOS: Settings → Safari → Camera.

> **Note on history:** Vercel's filesystem is read-only apart from a temporary directory, so the
> JSON-file history store is best-effort there and resets between invocations. Answering is
> unaffected (history failures are swallowed). See
> [Swapping in PostgreSQL](#swapping-in-postgresql) for history that actually persists.

## How it works

1. **Camera** — `useCamera` requests `getUserMedia`, renders the stream into a `<video>`, and exposes
   start/stop/flip controls.
2. **Scanning loop** — `useScanner` auto-captures a frame every 3s (toggleable), or on manual
   **Capture / Analyze**. Before sending anything, it runs a cheap client-side sharpness check
   (variance of a Laplacian edge filter on a downsampled frame) so obviously blurry/out-of-focus
   frames never hit the backend. It also compares each frame against the last one actually sent
   (mean grayscale pixel difference) and skips auto-scanning again if the camera is still pointed
   at the same question — only a manual **Capture / Analyze** forces a re-send regardless. This is
   what keeps a held-still phone from silently re-spending LLM quota every 3 seconds on a question
   you're just reading the answer to.
3. **POST /api/analyze** — the backend runs the pipeline server-side, deliberately kept to **two**
   LLM calls total (a naive design would need four — extraction, answering, search-query-building,
   verification — which burns through free-tier quotas fast):
   - `visionService` sends the frame to the vision LLM with an extraction prompt, asking it to decide
     whether a question is visible **and complete**, extract text/options/equations/tables/diagram
     descriptions, classify the question type, and self-report an OCR confidence score (LLM call #1).
     If the model reports the question is missing, incomplete, or below `MIN_OCR_CONFIDENCE`, the
     backend returns a `needs_clearer_image` status with a repositioning hint instead of guessing.
   - `verificationService` builds a search query with a plain string heuristic (no LLM call — it just
     strips instructional boilerplate like "choose the correct answer") and calls Google Custom Search.
   - `answerService` makes one combined LLM call (#2) that answers the question independently first
     (showing calculation steps for numerical questions, naming the selected option for MCQs), then
     reasons over the retrieved search snippets in the same pass to decide `verified` /
     `likely_correct` / `needs_review`, flag disagreements, and select which sources were actually used.
   - `llmProvider` retries once on a transient 429/500/502/503/504 from the LLM API before giving up,
     since free tiers occasionally return a momentary "overloaded" error.
   - The result (question, answer, explanation, verification, sources) is saved to history and
     returned to the frontend.
4. **Results panel** shows the detected question (with options/tables/diagram notes), the answer,
   explanation, a verification badge with an evidence-based confidence bar, and clickable sources
   that open in a new tab.
5. **History** — a slide-over panel lists past answered questions with timestamp, verification status,
   and sources; **Clear** wipes it.

## Accuracy safeguards

- The vision model must report `hasQuestion` **and** `isComplete` **and** `ocrConfidence` above
  `MIN_OCR_CONFIDENCE` (default 0.55) before an answer is attempted — otherwise the UI asks the user
  to reposition the camera.
- A client-side blur heuristic pre-filters frames before they're even sent, saving API calls on
  unusable frames.
- Numerical/mathematical answers are generated with explicit step-by-step reasoning *before* search
  verification runs, so the search step checks the model's independent work rather than anchoring on
  search results.
- Verification is evidence-based: the confidence shown is the verifier's assessment of source
  agreement/authority, not the answer model's own self-confidence.
- The verifier is instructed to never fabricate sources — `usedSources` only ever contains URLs that
  actually came back from the Google Search API response.

## Swapping in PostgreSQL

History currently persists to `backend/data/history.json` via `backend/src/services/historyStore.ts`
(`HISTORY_STORE=file`). To use Postgres instead:

1. Add `pg` (or an ORM of your choice) to `backend/package.json`.
2. Create a `history` table matching the `HistoryEntry` shape in `backend/src/types.ts`.
3. Implement `getHistory` / `addHistory` / `clearHistory` against `DATABASE_URL` in a new
   `historyStore.postgres.ts`, and select it in `routes/history.ts` based on
   `config.historyStore === "postgres"`.

## Troubleshooting

- **"GEMINI_API_KEY is not set" / "ANTHROPIC_API_KEY is not set"** — add the key matching your
  `LLM_PROVIDER` to `backend/.env` and restart the backend. For the default `google` provider, get a
  free key at <https://aistudio.google.com/apikey>.
- **"LLM request timed out after 20000ms"** — the provider accepted the request but never responded.
  Gemini's vision endpoint has been observed stalling on image requests (while text-only requests
  still return in under a second) and returning HTTP 503 "experiencing high demand" on others — i.e.
  a provider-side problem, not a bug in this app. Try again later, or point `GEMINI_VISION_MODEL` at
  a different model via env var (no code change needed). Tune the deadline with `LLM_TIMEOUT_MS`.
- **Gemini free-tier rate limit / quota errors (HTTP 429 "RESOURCE_EXHAUSTED")** — model choice matters
  a lot here: flagship "flash" models can have free-tier quotas as low as ~20 requests/**day**, while
  the default `gemini-flash-lite-latest` gets a far more generous quota for the same free key (which is
  why it's the default `GEMINI_VISION_MODEL`/`GEMINI_TEXT_MODEL` — don't swap to a non-"lite" model
  unless you're on a paid plan). If you still hit limits, slow down auto-scanning
  (`AUTO_SCAN_INTERVAL_MS` in `frontend/src/hooks/useScanner.ts`) or wait for the quota to reset. Check
  your key's actual limits at <https://ai.google.dev/gemini-api/docs/rate-limits>.
- **Verification always shows "Likely Correct" / "search API not configured"** — set
  `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` in `backend/.env`.
- **Camera won't start** — check the browser's site permissions, and confirm you're on `localhost`
  or HTTPS (see note above).
- **Rate limit errors during heavy auto-scanning** — the backend caps `/api/analyze` at 20 requests/min
  per client by default (`backend/src/index.ts`); lower the auto-scan frequency in
  `frontend/src/hooks/useScanner.ts` (`AUTO_SCAN_INTERVAL_MS`) or raise the limit if you have quota.
- **"Origin ... is not allowed by CORS_ORIGIN" / requests fail silently after deploying** — the
  backend's `CORS_ORIGIN` env var must exactly match your Pages URL's origin (scheme + host, e.g.
  `https://your-username.github.io`, no path/trailing slash); it accepts a comma-separated list if you
  need to allow both your local dev origin and the deployed one.
- **First request after opening the deployed site takes ~30–60s** — expected on Render's free tier;
  the backend was asleep and is cold-starting. Subsequent requests are fast until it sleeps again.
