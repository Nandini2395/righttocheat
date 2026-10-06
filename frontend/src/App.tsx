import { useEffect, useState } from "react";
import { useCamera } from "./hooks/useCamera";
import { useScanner } from "./hooks/useScanner";
import CameraView from "./components/CameraView";
import Controls from "./components/Controls";
import ResultsPanel from "./components/ResultsPanel";
import StatusBar from "./components/StatusBar";
import HistoryPanel from "./components/HistoryPanel";
import SetupBanner from "./components/SetupBanner";
import { checkHealth, clearHistoryApi, fetchHistory } from "./api/client";
import { HistoryEntry } from "./types";

interface HealthState {
  reachable: boolean;
  llmConfigured: boolean;
  searchConfigured: boolean;
  provider: string;
}

export default function App() {
  const { videoRef, status: cameraStatus, error: cameraError, start, stop, flip } = useCamera();
  const {
    scanState,
    isPaused,
    togglePause,
    autoScan,
    setAutoScan,
    manualCapture,
    result,
    errorMessage,
    reset,
  } = useScanner(videoRef, cameraStatus === "active");

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    checkHealth()
      .then((h) =>
        setHealth({
          reachable: true,
          llmConfigured: h.llmConfigured,
          searchConfigured: h.searchConfigured,
          provider: h.llmProvider,
        })
      )
      .catch(() =>
        setHealth({ reachable: false, llmConfigured: false, searchConfigured: false, provider: "" })
      );
  }, []);

  useEffect(() => {
    if (result?.status === "ok" && historyOpen) {
      void loadHistory();
    }
  }, [result]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const data = await fetchHistory();
      setHistory(data);
    } catch {
      // history is best-effort; ignore failures silently in the UI
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    await loadHistory();
  }

  async function handleClearHistory() {
    await clearHistoryApi();
    setHistory([]);
  }

  async function handleStop() {
    stop();
    reset();
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h1 className="text-base font-bold text-white">AI Visual Question Answering</h1>
          <p className="text-xs text-slate-500">Point your camera at a question to get a verified answer</p>
        </div>
        <button
          onClick={openHistory}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
        >
          History
        </button>
      </header>

      {health && !bannerDismissed && (
        <SetupBanner
          reachable={health.reachable}
          llmConfigured={health.llmConfigured}
          searchConfigured={health.searchConfigured}
          provider={health.provider}
          onDismiss={() => setBannerDismissed(true)}
        />
      )}

      <main className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* On phones the two panes split the screen (camera 3/5, results 2/5) so an answer is
            actually readable; on desktop the camera grows and the results keep a fixed column.
            min-h-0 lets the results panel scroll inside its pane instead of stretching it. */}
        <section className="flex min-h-0 flex-[3] flex-col border-b border-slate-800 md:flex-1 md:border-b-0 md:border-r">
          <CameraView videoRef={videoRef} cameraStatus={cameraStatus} scanState={scanState} />
          <Controls
            cameraStatus={cameraStatus}
            onStart={() => start()}
            onStop={handleStop}
            onFlip={flip}
            isPaused={isPaused}
            onTogglePause={togglePause}
            onManualCapture={manualCapture}
            autoScan={autoScan}
            onToggleAutoScan={() => setAutoScan((v) => !v)}
            processing={scanState === "processing" || scanState === "detected"}
          />
        </section>

        <aside className="flex min-h-0 w-full flex-[2] flex-col md:w-[420px] md:min-w-[360px] md:flex-none">
          <ResultsPanel scanState={scanState} result={result} />
        </aside>
      </main>

      <StatusBar state={scanState} errorMessage={errorMessage} cameraError={cameraError} />

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        history={history}
        loading={historyLoading}
        onClear={handleClearHistory}
      />
    </div>
  );
}
