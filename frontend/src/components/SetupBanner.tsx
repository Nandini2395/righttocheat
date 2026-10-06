interface Props {
  reachable: boolean;
  llmConfigured: boolean;
  searchConfigured: boolean;
  provider: string;
  onDismiss: () => void;
}

const KEY_BY_PROVIDER: Record<string, string> = {
  google: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};

/**
 * Surfaces backend configuration problems up front, rather than letting the user point the
 * camera at a question and get a raw API error back on the first scan.
 */
export default function SetupBanner({ reachable, llmConfigured, searchConfigured, provider, onDismiss }: Props) {
  if (reachable && llmConfigured && searchConfigured) return null;

  if (!reachable) {
    return (
      <Banner tone="error" onDismiss={onDismiss}>
        <strong className="font-semibold">Can't reach the backend API.</strong> Start it with{" "}
        <code className="rounded bg-black/30 px-1">npm run dev</code> locally, or check that the deployed
        backend service is running.
      </Banner>
    );
  }

  if (!llmConfigured) {
    const keyName = KEY_BY_PROVIDER[provider] || "the provider API key";
    return (
      <Banner tone="error" onDismiss={onDismiss}>
        <strong className="font-semibold">Setup needed:</strong> {keyName} isn't set, so questions can't be
        answered yet. Add it to <code className="rounded bg-black/30 px-1">backend/.env</code> (local) or your
        host's environment variables, then restart the backend.{" "}
        {provider === "google" && (
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2"
          >
            Get a free key
          </a>
        )}
      </Banner>
    );
  }

  return (
    <Banner tone="warn" onDismiss={onDismiss}>
      <strong className="font-semibold">Google search verification is off.</strong> Answers will show as
      "Likely Correct" from model reasoning alone. Set{" "}
      <code className="rounded bg-black/30 px-1">GOOGLE_SEARCH_API_KEY</code> and{" "}
      <code className="rounded bg-black/30 px-1">GOOGLE_SEARCH_ENGINE_ID</code> to enable it.
    </Banner>
  );
}

function Banner({
  tone,
  children,
  onDismiss,
}: {
  tone: "error" | "warn";
  children: React.ReactNode;
  onDismiss: () => void;
}) {
  const styles =
    tone === "error"
      ? "border-red-900 bg-red-950/70 text-red-200"
      : "border-amber-900 bg-amber-950/60 text-amber-200";

  return (
    <div className={`flex items-start gap-3 border-b px-4 py-2.5 text-xs leading-relaxed ${styles}`}>
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
