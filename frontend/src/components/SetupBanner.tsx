interface Props {
  reachable: boolean;
  searchConfigured: boolean;
  onDismiss: () => void;
}

/**
 * The app needs no API key to run, so this only reports a backend that can't be reached, or
 * the reduced-quality keyless search mode — it should never block or alarm on a normal start.
 */
export default function SetupBanner({ reachable, searchConfigured, onDismiss }: Props) {
  if (reachable && searchConfigured) return null;

  if (!reachable) {
    return (
      <Banner tone="error" onDismiss={onDismiss}>
        <strong className="font-semibold">Can't reach the backend API.</strong> Start it with{" "}
        <code className="rounded bg-black/30 px-1">npm run dev</code> locally, or check that the deployed
        backend service is running.
      </Banner>
    );
  }

  return (
    <Banner tone="info" onDismiss={onDismiss}>
      Using <strong className="font-semibold">keyless search</strong> (DuckDuckGo + Wikipedia) — works with no
      setup, but coverage is limited. For better answers, set{" "}
      <code className="rounded bg-black/30 px-1">GOOGLE_SEARCH_API_KEY</code> and{" "}
      <code className="rounded bg-black/30 px-1">GOOGLE_SEARCH_ENGINE_ID</code> (free, 100 searches/day).
    </Banner>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: "error" | "info";
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  const styles =
    tone === "error"
      ? "border-red-900 bg-red-950/70 text-red-200"
      : "border-slate-700 bg-slate-900 text-slate-300";

  return (
    <div className={`flex items-start gap-3 border-b px-4 py-2 text-xs leading-relaxed ${styles}`}>
      <p className="flex-1">{children}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded px-1 text-sm opacity-70 hover:opacity-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
