import { createWorker, Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

export interface OcrResult {
  text: string;
  confidence: number; // 0-1
}

/**
 * Tesseract runs entirely in the browser, so OCR needs no API key, no quota, and no image
 * upload — only the extracted text is sent to the server. The worker (and its ~15MB language
 * data) is created once and reused; the first call pays the download, later calls are fast.
 */
function getWorker(onProgress?: (status: string, progress: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker("eng", 1, {
      logger: (m: { status: string; progress: number }) => onProgress?.(m.status, m.progress),
    });
  }
  return workerPromise;
}

export async function warmUpOcr(onProgress?: (status: string, progress: number) => void): Promise<void> {
  await getWorker(onProgress);
}

export async function recognize(
  image: string,
  onProgress?: (status: string, progress: number) => void
): Promise<OcrResult> {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(image);

  return {
    text: (data.text || "").trim(),
    // Tesseract reports 0-100; normalize so the backend threshold is a single 0-1 scale.
    confidence: Math.max(0, Math.min(1, (data.confidence ?? 0) / 100)),
  };
}

export async function disposeOcr(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
