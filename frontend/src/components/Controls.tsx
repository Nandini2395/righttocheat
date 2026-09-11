import { CameraStatus } from "../hooks/useCamera";

interface Props {
  cameraStatus: CameraStatus;
  onStart: () => void;
  onStop: () => void;
  onFlip: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onManualCapture: () => void;
  autoScan: boolean;
  onToggleAutoScan: () => void;
  processing: boolean;
}

export default function Controls({
  cameraStatus,
  onStart,
  onStop,
  onFlip,
  isPaused,
  onTogglePause,
  onManualCapture,
  autoScan,
  onToggleAutoScan,
  processing,
}: Props) {
  const active = cameraStatus === "active";

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-900/80 p-3">
      {!active ? (
        <button
          onClick={onStart}
          disabled={cameraStatus === "starting"}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {cameraStatus === "starting" ? "Starting..." : "Start Camera"}
        </button>
      ) : (
        <button
          onClick={onStop}
          className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
        >
          Stop Camera
        </button>
      )}

      <button
        onClick={onFlip}
        disabled={!active}
        className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        title="Flip camera"
      >
        Flip
      </button>

      <button
        onClick={onManualCapture}
        disabled={!active || processing}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
      >
        {processing ? "Analyzing..." : "Capture / Analyze"}
      </button>

      <button
        onClick={onTogglePause}
        disabled={!active}
        className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
      >
        {isPaused ? "Resume Scanning" : "Pause Scanning"}
      </button>

      <label className="ml-auto flex items-center gap-2 text-xs text-slate-300">
        <input
          type="checkbox"
          checked={autoScan}
          onChange={onToggleAutoScan}
          disabled={!active}
          className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-brand-600 focus:ring-brand-600"
        />
        Auto-scan
      </label>
    </div>
  );
}
