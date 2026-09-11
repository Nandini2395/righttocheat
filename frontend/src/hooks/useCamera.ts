import { useCallback, useRef, useState } from "react";

export type CameraStatus = "idle" | "starting" | "active" | "error";

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const start = useCallback(async (mode: "environment" | "user" = facingMode) => {
    setStatus("starting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setFacingMode(mode);
      setStatus("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access the camera.");
      setStatus("error");
    }
  }, [facingMode]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const flip = useCallback(async () => {
    stop();
    await start(facingMode === "environment" ? "user" : "environment");
  }, [facingMode, start, stop]);

  return { videoRef, status, error, start, stop, flip, facingMode };
}
