import { ScanState } from "../hooks/useScanner";

const MESSAGES: Record<ScanState, string> = {
  idle: "Start the camera to begin scanning.",
  watching: "Watching for a question — point the camera at one.",
  detected: "Frame captured, checking sharpness...",
  processing: "Processing: extracting question, generating answer, verifying with search...",
  answered: "Question answered and cross-verified.",
  needs_reposition: "Reposition the camera for a clearer view of the question.",
  no_question: "No question detected in this frame.",
  error: "Something went wrong. See message below.",
};

export default function StatusBar({
  state,
  errorMessage,
  cameraError,
}: {
  state: ScanState;
  errorMessage: string | null;
  cameraError: string | null;
}) {
  const message = cameraError ? `Camera error: ${cameraError}` : errorMessage && state === "error" ? errorMessage : MESSAGES[state];
  const isError = Boolean(cameraError) || state === "error";

  return (
    <div
      className={`flex w-full items-center justify-center border-t px-4 py-2.5 text-center text-sm ${
        isError
          ? "border-red-900 bg-red-950/60 text-red-300"
          : "border-slate-800 bg-slate-900 text-slate-300"
      }`}
    >
      {message}
    </div>
  );
}
