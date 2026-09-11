import fs from "fs";
import path from "path";
import { HistoryEntry } from "../types";

// Zero-config JSON-file store, used by default (HISTORY_STORE=file).
// To swap in PostgreSQL: implement the same three functions (getHistory/addHistory/clearHistory)
// against a `history` table with the same shape as HistoryEntry, using DATABASE_URL from config,
// and select the implementation in routes/history.ts based on config.historyStore.

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DATA_FILE = path.join(DATA_DIR, "history.json");
const MAX_ENTRIES = 200;

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}

export function getHistory(): HistoryEntry[] {
  ensureFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  try {
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function addHistory(entry: HistoryEntry): void {
  ensureFile();
  const current = getHistory();
  current.unshift(entry);
  const trimmed = current.slice(0, MAX_ENTRIES);
  fs.writeFileSync(DATA_FILE, JSON.stringify(trimmed, null, 2), "utf-8");
}

export function clearHistory(): void {
  ensureFile();
  fs.writeFileSync(DATA_FILE, "[]", "utf-8");
}
