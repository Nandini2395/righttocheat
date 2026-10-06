# Visual Question Answering (search-based)

Point a device camera at a question — a worksheet, textbook page, exam, or slide — and get an
answer backed by web sources. The app reads the question with on-device OCR, searches the web for
it, and picks an answer from the evidence it finds.

**It uses no AI model and needs no API key to run.**

```
Camera → Frame Capture → OCR (in browser) → Question Parsing → Web Search
       → Evidence Scoring → Answer + Sources
```

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS. Camera via `MediaDevices`/`getUserMedia`.
- **OCR**: [Tesseract.js](https://tesseract.projectnaptha.com/) running **in the browser** — no API key,
  no quota, no image upload. Only the recognized text is sent to the server.
- **Backend**: Node.js + Express + TypeScript. No LLM.
- **Search**: Google Programmable Search when `GOOGLE_SEARCH_API_KEY` is set, otherwise keyless
  sources (DuckDuckGo + Wikipedia) so the app works with zero configuration.
- **Answering**: deterministic heuristics — a local math solver, encyclopedia lookups per
  multiple-choice option, and keyword/phrase scoring over search results.
- **History storage**: a zero-config JSON file store (`backend/data/history.json`) by default; see
  [Swapping in PostgreSQL](#swapping-in-postgresql) to use a real database instead.

## What it can and can't do

Because there is no language model, there is **no reasoning step**. Answers come from matching text
against sources, so quality varies sharply by question type:

| Works well | Unreliable |
| --- | --- |
| Arithmetic and simple linear equations (solved exactly, locally) | Word problems and multi-step reasoning |
| Factual multiple choice with distinctive wording ("Which planet is the Red Planet?") | Questions whose options are phrased abstractly |
| Definitions and general-knowledge lookups | "Which statement is correct?" style questions |

The UI is deliberately blunt about this: every answer carries a **Verified / Likely Correct /
Needs Review** badge and an evidence-based confidence score, and the explanation states plainly that
the result is text matching rather than reasoning. Treat it as a fast way to find sources, not as an
oracle.

## Project layout

```
vercel.json             Declares the frontend + backend services and /api routing
backend/                Express API (deploys as the "backend" service)
  src/
    app.ts              Builds the Express app (routes, CORS, rate limiting)
    index.ts            Entrypoint — binds PORT (injected by Vercel in production)
    config.ts            Env var loading/validation
    routes/analyze.ts     POST /api/analyze — the full pipeline
    routes/history.ts     GET/DELETE /api/history
    services/
      questionParser.ts       OCR text -> question stem, options, type, math expression
      mathSolver.ts           Tokenizer + shunting-yard evaluator and linear-equation solver
      searchProviders.ts      Google / DuckDuckGo / Wikipedia lookups behind one interface
      answerDeriver.ts        Scores evidence -> answer, confidence, verification status
      searchService.ts        Authoritative-domain list used to weight sources
      historyStore.ts         JSON-file backed history persistence
frontend/               React app
  src/
    services/ocr.ts           Tesseract.js worker (in-browser OCR, reused across captures)
    hooks/useCamera.ts        getUserMedia lifecycle, start/stop/flip
    hooks/useScanner.ts       Auto-scan loop, manual capture, pause/resume, state machine
    utils/imageUtils.ts       Frame capture + blur and frame-change heuristics
    components/
      CameraView.tsx          Live preview + detection indicator overlay
      Controls.tsx             Start/Stop/Flip/Capture/Pause/Auto-scan controls
      ResultsPanel.tsx         Detected question, answer, explanation, verification, sources
      HistoryPanel.tsx         Slide-over history list with clear
      SetupBanner.tsx          Flags an unreachable backend / keyless search mode
      StatusBar.tsx             Bottom status line, incl. OCR progress
    api/client.ts              Typed fetch wrapper around the backend API
```

## Setup

### Prerequisites

- Node.js 18+
- No API keys. (Optionally, a Google Programmable Search key for better results — see below.)

### 1. Install dependencies

From the repo root (this is an npm workspaces monorepo):

```bash
npm install
```

### 2. Configure the backend (optional)

The app runs with no configuration. To change defaults or enable Google search:

```bash
cp backend/.env.example backend/.env
```

`GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` switch search from the keyless sources
(DuckDuckGo + Wikipedia) to Google Programmable Search, which returns noticeably better results and
is free for 100 queries/day. To set it up:

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

> The first capture downloads the Tesseract OCR engine and English language data (~15MB) into the
> browser cache. That one-time download is why the first scan is slower than later ones; after it,
> OCR takes roughly 1–3 seconds per frame and works offline.

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

The whole app deploys as **one Vercel project with two services**: `frontend` (Vite static build)
and `backend` (the Express API). [`vercel.json`](vercel.json) declares both and rewrites `/api/*` to
the backend while everything else goes to the frontend — so both live on a single domain. That means
no CORS setup and no API URL to configure: the frontend just calls `/api/...` on its own origin.
Vercel serves it over HTTPS, which is what mobile browsers require before granting camera access.

```jsonc
// vercel.json — one project, two services, one domain
"services": {
  "backend":  { "root": "backend",  "framework": "express" },
  "frontend": { "root": "frontend", "framework": "vite" }
},
"rewrites": [
  { "source": "/api/(.*)", "destination": { "service": "backend" } },
  { "source": "/(.*)",     "destination": { "service": "frontend" } }
]
```

The backend binds whatever `PORT` Vercel injects (see `port` in
[`backend/src/config.ts`](backend/src/config.ts)), and `CORS_ORIGIN` needs no production value —
same-origin requests are allowed automatically, as are Vercel's own deployment URLs.

### 1. Push the repo to GitHub

Vercel deploys from a Git repo. Make sure your latest commit is pushed.

### 2. Import the project on Vercel

[vercel.com/new](https://vercel.com/new) → **Import** your repository.

Vercel detects `backend/` and `frontend/` as two applications and selects the **Services** preset —
that's correct, keep it. Leave **Root Directory** as `./` and don't use the "Import single project"
buttons next to the individual folders: those would deploy only one half (a frontend-only deploy
returns 404s for every `/api` call). `vercel.json` already declares both services and their routing.

### 3. Environment variables (optional)

There is nothing you have to set — the app deploys and runs as-is.

If you want better search results, add `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` under
**Settings → Environment Variables**. These stay server-side, read only by the backend service.
**Do not** prefix them with `VITE_`, which would expose them publicly in the browser bundle.

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
   **Capture / Analyze**. Before doing any work it runs a cheap sharpness check (variance of a
   Laplacian edge filter on a downsampled frame) so blurry/out-of-focus frames are skipped. It also
   compares each frame against the last one processed (mean grayscale pixel difference) and skips
   re-processing if the camera is still pointed at the same question — only a manual
   **Capture / Analyze** forces a re-run.
3. **OCR in the browser** — `services/ocr.ts` runs Tesseract.js on the captured frame and reports
   both the text and a 0–1 confidence. The worker is created once and reused across captures. The
   image never leaves the device; only the recognized text is posted to the API.
4. **POST /api/analyze** — takes `{ text, ocrConfidence }` and runs entirely deterministic logic:
   - `questionParser` splits the OCR text into a question stem and options (handling both one-per-line
     and inline `A) ... B) ...` layouts), classifies the question type, and detects a math expression.
   - If OCR confidence is below `MIN_OCR_CONFIDENCE`, it returns `needs_clearer_image` instead of
     guessing from garbled text.
   - `mathSolver` evaluates arithmetic and simple linear equations exactly, using an explicit
     tokenizer and shunting-yard parser — deliberately **not** `eval`, since the input is arbitrary
     text read off a photo.
   - `searchProviders` queries the question stem only (including the options would bias results
     toward whichever option shares wording with the question), via Google if configured and
     DuckDuckGo + Wikipedia otherwise.
   - `answerDeriver` scores the evidence. For multiple choice it fetches **each option's own
     encyclopedia article** and measures how well that article matches the question's distinctive
     phrases — asking "does Mars's article mention 'red planet'?" is far more reliable than counting
     which option appears most in generic snippets, since any article about planets mentions all of
     them. Snippet matching from the question search is folded in as a weaker tiebreaker.
   - The result is saved to history and returned.
5. **Results panel** shows the detected question and options, the answer, an explanation stating how
   it was derived, a verification badge with an evidence-based confidence bar, and clickable sources.
6. **History** — a slide-over panel lists past answered questions with timestamp, verification status,
   and sources; **Clear** wipes it.

## Accuracy safeguards

- OCR confidence below `MIN_OCR_CONFIDENCE` (default 0.55) returns a "reposition the camera" prompt
  rather than an answer derived from garbled text.
- A blur heuristic skips unusable frames before OCR even runs.
- Arithmetic is computed locally rather than looked up, which is both exact and immune to bad search
  results.
- Confidence is evidence-based, derived from the *margin* between the best and second-best option and
  whether a distinctive phrase actually matched — not from a model's self-assessment. A near-tie is
  reported as `needs_review` with an explicit note that the pick is a coin flip.
- Sources are never fabricated: every URL shown came back from a real search or encyclopedia response.
- Explanations state plainly that the answer is text matching rather than reasoning.

## Swapping in PostgreSQL

History currently persists to `backend/data/history.json` via `backend/src/services/historyStore.ts`
(`HISTORY_STORE=file`). To use Postgres instead:

1. Add `pg` (or an ORM of your choice) to `backend/package.json`.
2. Create a `history` table matching the `HistoryEntry` shape in `backend/src/types.ts`.
3. Implement `getHistory` / `addHistory` / `clearHistory` against `DATABASE_URL` in a new
   `historyStore.postgres.ts`, and select it in `routes/history.ts` based on
   `config.historyStore === "postgres"`.

## Troubleshooting

- **First scan is slow / seems stuck at "Reading the text…"** — the first capture downloads the
  Tesseract engine and English data (~15MB). It's cached afterwards; later scans take 1–3 seconds.
- **"Couldn't determine an answer"** — search found nothing that matches well enough. This is common
  with the keyless sources on exam-style questions; adding `GOOGLE_SEARCH_API_KEY` and
  `GOOGLE_SEARCH_ENGINE_ID` improves it a lot.
- **Answers are wrong on reasoning questions** — expected, and not fixable by configuration. There is
  no language model here, so nothing reasons about the question; see
  [What it can and can't do](#what-it-can-and-cant-do). The confidence badge is the thing to watch:
  `needs_review` genuinely means "don't trust this".
- **OCR misreads the question** — improve the input rather than the software: fill the frame with just
  the question, avoid glare and shadows, hold steady, and prefer flat pages over curved ones. Tesseract
  is far more sensitive to image quality than a vision model would be.
- **Camera won't start** — check the browser's site permissions, and confirm you're on `localhost`
  or HTTPS (see note above).
- **Rate limit errors during heavy auto-scanning** — the backend caps `/api/analyze` at 20 requests/min
  per client by default (`backend/src/app.ts`); lower the auto-scan frequency in
  `frontend/src/hooks/useScanner.ts` (`AUTO_SCAN_INTERVAL_MS`) or raise the limit.
- **"Origin ... is not allowed by CORS_ORIGIN" / requests fail after deploying** — only relevant when
  the frontend and API are on different domains. Set `CORS_ORIGIN` to the frontend's origin (scheme +
  host, no trailing slash); it accepts a comma-separated list. Same-origin deploys need nothing.
