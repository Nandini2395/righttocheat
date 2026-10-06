import fs from "fs";
import os from "os";
import path from "path";
import { HistoryEntry } from "../types";

// Zero-config JSON-file store, used by default (HISTORY_STORE=file).
// On Vercel the deployment filesystem is read-only apart from the OS temp dir, and that
// temp dir is per-instance and short-lived — so history there is best-effort and resets.
// Every filesystem operation is therefore non-fatal: history is a convenience feature and
// must never break answering a question.
// To swap in PostgreSQL (for history that actually persists on serverless): implement the
// same three functions against a `history` table shaped like HistoryEntry, using
// DATABASE_URL from config, and select it in routes/history.ts via config.historyStore.

const IS_SERVERLESS = Boolean(process.env.VERCEL);
const DATA_DIR = IS_SERVERLESS ? path.join(os.tmpdir(), "vqa") : path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "history.json");
const MAX_ENTRIES = 200;

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}

export function getHistory(): HistoryEntry[] {
  try {
    ensureFile();
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function addHistory(entry: HistoryEntry): void {
  try {
    ensureFile();
    const trimmed = [entry, ...getHistory()].slice(0, MAX_ENTRIES);
    fs.writeFileSync(DATA_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[warn] could not persist history entry:", (err as Error).message);
  }
}

export function clearHistory(): void {
  try {
    ensureFile();
    fs.writeFileSync(DATA_FILE, "[]", "utf-8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[warn] could not clear history:", (err as Error).message);
  }
}
