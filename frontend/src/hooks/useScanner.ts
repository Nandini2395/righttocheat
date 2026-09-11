import { useCallback, useEffect, useRef, useState } from "react";
import { analyzeFrame } from "../api/client";
import {
  captureFrameAsDataUrl,
  FRAME_CHANGE_THRESHOLD,
  frameDifference,
  FrameSample,
  sampleFrame,
  SHARPNESS_BLUR_THRESHOLD,
  sharpnessFromSample,
} from "../utils/imageUtils";
import { AnalyzeResponseBody } from "../types";

export type ScanState =
  | "idle" // camera not active / not scanning
  | "watching" // camera active, waiting for a sharp frame
  | "detected" // a question shape was seen, sending to backend
  | "processing" // waiting on backend analysis
  | "answered" // got a full ok result
  | "needs_reposition" // backend asked for a clearer frame
  | "no_question" // backend found nothing question-like
  | "error";

const AUTO_SCAN_INTERVAL_MS = 3000;

export function useScanner(videoRef: React.RefObject<HTMLVideoElement>, cameraActive: boolean) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const inFlightRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  // Last frame we actually sent for analysis, so auto-scan can skip re-sending a frame that
  // hasn't meaningfully changed (e.g. the camera is still held on the same answered question) —
  // this is what was burning through the free-tier LLM quota with a scan every 3s regardless.
  const lastAnalyzedSampleRef = useRef<FrameSample | null>(null);
  const hasResultRef = useRef(false);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [isPaused, setIsPaused] = useState(false);
  const [autoScan, setAutoScan] = useState(true);
  const [result, setResult] = useState<AnalyzeResponseBody | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastCapturedAt, setLastCapturedAt] = useState<number | null>(null);

  if (!canvasRef.current && typeof document !== "undefined") {
    canvasRef.current = document.createElement("canvas");
    sampleCanvasRef.current = document.createElement("canvas");
  }

  useEffect(() => {
    hasResultRef.current = result !== null;
  }, [result]);

  const runAnalysis = useCallback(
    async (force: boolean) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const sampleCanvas = sampleCanvasRef.current;
      if (!video || !canvas || !sampleCanvas) return;
      if (video.readyState < 2 || video.videoWidth === 0) return;
      if (inFlightRef.current) return;

      const sample = sampleFrame(video, sampleCanvas);
      const sharpness = sharpnessFromSample(sample);
      if (sharpness < SHARPNESS_BLUR_THRESHOLD) {
        setScanState("watching");
        return;
      }

      if (!force && hasResultRef.current && lastAnalyzedSampleRef.current) {
        const distance = frameDifference(sample, lastAnalyzedSampleRef.current);
        if (distance < FRAME_CHANGE_THRESHOLD) {
          // Same scene as last time we actually analyzed — don't spend another API call.
          return;
        }
      }

      inFlightRef.current = true;
      lastAnalyzedSampleRef.current = sample;
      setScanState("detected");
      try {
        const dataUrl = captureFrameAsDataUrl(video, canvas);
        setLastCapturedAt(Date.now());
        setScanState("processing");
        const response = await analyzeFrame(dataUrl);
        setResult(response);
        setErrorMessage(null);

        if (response.status === "ok") setScanState("answered");
        else if (response.status === "needs_clearer_image") setScanState("needs_reposition");
        else if (response.status === "no_question_detected") setScanState("no_question");
        else setScanState("error");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Analysis failed.");
        setScanState("error");
      } finally {
        inFlightRef.current = false;
      }
    },
    [videoRef]
  );

  const manualCapture = useCallback(() => {
    void runAnalysis(true);
  }, [runAnalysis]);

  const togglePause = useCallback(() => setIsPaused((p) => !p), []);

  useEffect(() => {
    if (!cameraActive || isPaused || !autoScan) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      if (cameraActive && !isPaused) setScanState((s) => (s === "idle" ? "watching" : s));
      return;
    }

    setScanState((s) => (s === "idle" ? "watching" : s));
    timerRef.current = window.setInterval(() => {
      void runAnalysis(false);
    }, AUTO_SCAN_INTERVAL_MS);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [cameraActive, isPaused, autoScan, runAnalysis]);

  useEffect(() => {
    if (!cameraActive) {
      setScanState("idle");
      setResult(null);
      lastAnalyzedSampleRef.current = null;
    }
  }, [cameraActive]);

  const reset = useCallback(() => {
    setResult(null);
    setErrorMessage(null);
    lastAnalyzedSampleRef.current = null;
    setScanState(cameraActive ? "watching" : "idle");
  }, [cameraActive]);

  return {
    scanState,
    isPaused,
    togglePause,
    autoScan,
    setAutoScan,
    manualCapture,
    result,
    errorMessage,
    lastCapturedAt,
    reset,
  };
}
