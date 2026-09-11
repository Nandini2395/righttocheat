import { ScanState } from "../hooks/useScanner";

const CONFIG: Record<ScanState, { label: string; color: string; pulse: boolean }> = {
  idle: { label: "Camera off", color: "bg-slate-500", pulse: false },
  watching: { label: "Watching for a question", color: "bg-slate-400", pulse: false },
  detected: { label: "Frame captured", color: "bg-amber-400", pulse: true },
  processing: { label: "Analyzing...", color: "bg-amber-400", pulse: true },
  answered: { label: "Question detected", color: "bg-emerald-400", pulse: false },
  needs_reposition: { label: "Reposition camera", color: "bg-orange-400", pulse: true },
  no_question: { label: "No question found", color: "bg-slate-400", pulse: false },
  error: { label: "Error", color: "bg-red-500", pulse: false },
};

export default function DetectionIndicator({ state }: { state: ScanState }) {
  const cfg = CONFIG[state];
  return (
    <div className="flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur-sm">
      <span className="relative flex h-2.5 w-2.5">
        {cfg.pulse && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.color} opacity-75`} />
        )}
        <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${cfg.color}`} />
      </span>
      <span className="text-xs font-medium text-white">{cfg.label}</span>
    </div>
  );
}
