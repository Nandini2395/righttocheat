import { ScanState } from "../hooks/useScanner";

const MESSAGES: Record<ScanState, string> = {
  idle: "Start the camera to begin scanning.",
  watching: "Watching for a question — point the camera at one.",
  detected: "Frame captured, checking sharpness...",
  reading: "Reading the text in the image...",
  processing: "Searching the web and matching an answer...",
  answered: "Answer found from search results.",
  needs_reposition: "Reposition the camera for a clearer view of the question.",
  no_question: "No question detected in this frame.",
  error: "Something went wrong. See message below.",
};

export default function StatusBar({
  state,
  errorMessage,
  cameraError,
  ocrProgress,
}: {
  state: ScanState;
  errorMessage: string | null;
  cameraError: string | null;
  ocrProgress?: number | null;
}) {
  const readingMessage =
    state === "reading" && ocrProgress !== null && ocrProgress !== undefined
      ? `Reading the text in the image... ${Math.round(ocrProgress * 100)}%`
      : null;

  const message = cameraError
    ? `Camera error: ${cameraError}`
    : errorMessage && state === "error"
    ? errorMessage
    : readingMessage || MESSAGES[state];
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
