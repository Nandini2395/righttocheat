import { AnalyzeResponseBody, HistoryEntry } from "../types";

// Empty default = same-origin relative calls ("/api/..."), which is what a single-project
// Vercel deploy needs (frontend and serverless API share one domain). In local dev the Vite
// proxy forwards /api to the backend port. Set VITE_API_BASE_URL only when the backend is
// hosted on a different origin than the frontend.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore body parse failure
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export async function analyzeFrame(imageDataUrl: string): Promise<AnalyzeResponseBody> {
  const res = await fetch(`${API_BASE_URL}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ image: imageDataUrl }),
  });
  return handleJson<AnalyzeResponseBody>(res);
}

export async function fetchHistory(): Promise<HistoryEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/history`);
  const data = await handleJson<{ history: HistoryEntry[] }>(res);
  return data.history;
}

export async function clearHistoryApi(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/history`, { method: "DELETE" });
  await handleJson(res);
}

export async function checkHealth(): Promise<{ ok: boolean; llmConfigured: boolean; searchConfigured: boolean; llmProvider: string }> {
  const res = await fetch(`${API_BASE_URL}/api/health`);
  return handleJson(res);
}
