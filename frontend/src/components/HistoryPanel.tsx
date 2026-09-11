import { HistoryEntry } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
  history: HistoryEntry[];
  loading: boolean;
  onClear: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  verified: "Verified",
  likely_correct: "Likely Correct",
  needs_review: "Needs Review",
};

export default function HistoryPanel({ open, onClose, history, loading, onClear }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="scrollbar-thin flex h-full w-full max-w-md flex-col overflow-y-auto bg-slate-950 border-l border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <h2 className="text-sm font-semibold text-slate-100">Question History</h2>
          <div className="flex items-center gap-2">
            <button onClick={onClear} className="text-xs text-red-400 hover:text-red-300">
              Clear
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Close history">
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-3 p-4">
          {loading && <p className="text-sm text-slate-500">Loading history...</p>}
          {!loading && history.length === 0 && <p className="text-sm text-slate-500">No questions answered yet.</p>}
          {history.map((entry) => (
            <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">{new Date(entry.timestamp).toLocaleString()}</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                  {STATUS_LABEL[entry.verificationStatus] || entry.verificationStatus}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-slate-200">{entry.questionText}</p>
              <p className="mt-1 line-clamp-2 text-xs text-slate-400">{entry.answer}</p>
              {entry.sources.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {entry.sources.slice(0, 3).map((s, i) => (
                    <a
                      key={i}
                      href={s.link}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="truncate rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-brand-500 hover:underline"
                    >
                      {s.displayLink}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
