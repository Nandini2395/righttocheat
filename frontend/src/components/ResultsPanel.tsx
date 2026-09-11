import { AnalyzeResponseBody, VerificationStatus } from "../types";
import { ScanState } from "../hooks/useScanner";

const VERIFICATION_STYLES: Record<VerificationStatus, { label: string; classes: string; icon: string }> = {
  verified: { label: "Google Verified", classes: "bg-emerald-950 text-emerald-300 border-emerald-800", icon: "✓" },
  likely_correct: { label: "Likely Correct", classes: "bg-amber-950 text-amber-300 border-amber-800", icon: "~" },
  needs_review: { label: "Needs Review", classes: "bg-red-950 text-red-300 border-red-800", icon: "!" },
};

function QuestionTypeBadge({ type }: { type: string }) {
  return (
    <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
      {type.replace(/_/g, " ")}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400">{pct}% evidence confidence</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

export default function ResultsPanel({ scanState, result }: { scanState: ScanState; result: AnalyzeResponseBody | null }) {
  if (!result) {
    return (
      <EmptyState
        title="No question yet"
        message={
          scanState === "idle"
            ? "Start the camera and point it at a question to see results here."
            : "Scanning... results will appear here as soon as a question is detected."
        }
      />
    );
  }

  if (result.status === "needs_clearer_image") {
    return (
      <EmptyState
        title="Needs a clearer view"
        message={result.message || "Reposition the camera so the full question is sharp and in frame."}
        tone="warn"
      />
    );
  }

  if (result.status === "no_question_detected") {
    return (
      <EmptyState
        title="No question detected"
        message={result.message || "Point the camera at a visible question."}
      />
    );
  }

  if (result.status === "error" || !result.extracted || !result.answer || !result.verification) {
    return <EmptyState title="Something went wrong" message={result.message || "Please try again."} tone="error" />;
  }

  const { extracted, answer, verification } = result;
  const vStyle = VERIFICATION_STYLES[verification.status];

  return (
    <div className="scrollbar-thin h-full space-y-5 overflow-y-auto p-4">
      <Section title="Detected Question">
        <div className="flex items-center gap-2">
          <QuestionTypeBadge type={extracted.questionType} />
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">{extracted.questionText}</p>
        {extracted.options.length > 0 && (
          <ul className="mt-1 space-y-1">
            {extracted.options.map((opt, i) => (
              <li
                key={i}
                className={`rounded-md border px-2.5 py-1.5 text-sm ${
                  answer.selectedOption && opt.trim().toUpperCase().startsWith(answer.selectedOption.trim().toUpperCase())
                    ? "border-emerald-700 bg-emerald-950/50 text-emerald-200"
                    : "border-slate-800 bg-slate-900 text-slate-300"
                }`}
              >
                {opt}
              </li>
            ))}
          </ul>
        )}
        {extracted.tableMarkdown && (
          <pre className="mt-1 overflow-x-auto rounded-md bg-slate-900 p-2 text-xs text-slate-300">{extracted.tableMarkdown}</pre>
        )}
        {extracted.diagramDescription && (
          <p className="mt-1 rounded-md bg-slate-900 p-2 text-xs italic text-slate-400">
            Figure: {extracted.diagramDescription}
          </p>
        )}
      </Section>

      <Section title="Answer">
        <p className="text-base font-semibold text-white">{answer.answer}</p>
        {answer.calculationSteps.length > 0 && (
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-300">
            {answer.calculationSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Explanation">
        <p className="text-sm leading-relaxed text-slate-300">{answer.explanation}</p>
      </Section>

      <Section title="Verification">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${vStyle.classes}`}>
            <span>{vStyle.icon}</span> {vStyle.label}
          </span>
          <ConfidenceBar value={verification.confidence} />
        </div>
        <p className="mt-1 text-sm text-slate-400">{verification.reasoning}</p>
        {verification.disagreements.length > 0 && (
          <div className="mt-1 rounded-md border border-orange-900 bg-orange-950/40 p-2 text-xs text-orange-300">
            <p className="font-semibold">Source disagreements:</p>
            <ul className="list-disc pl-4">
              {verification.disagreements.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}
        {!verification.searchPerformed && (
          <p className="mt-1 text-xs text-slate-500">Web verification unavailable — search API not configured.</p>
        )}
      </Section>

      <Section title="Sources">
        {verification.usedSources.length === 0 ? (
          <p className="text-sm text-slate-500">No sources returned.</p>
        ) : (
          <ul className="space-y-2">
            {verification.usedSources.map((src, i) => (
              <li key={i}>
                <a
                  href={src.link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-md border border-slate-800 bg-slate-900 p-2 text-sm hover:border-brand-600 hover:bg-slate-800"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium text-brand-500">{src.title || src.displayLink}</span>
                    {src.isAuthoritative && (
                      <span className="shrink-0 rounded bg-emerald-900 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                        AUTHORITATIVE
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">{src.displayLink}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{src.snippet}</p>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function EmptyState({ title, message, tone = "default" }: { title: string; message: string; tone?: "default" | "warn" | "error" }) {
  const color = tone === "warn" ? "text-orange-400" : tone === "error" ? "text-red-400" : "text-slate-500";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className={`text-sm font-semibold ${color}`}>{title}</p>
      <p className="max-w-xs text-sm text-slate-500">{message}</p>
    </div>
  );
}
