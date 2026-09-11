import { RefObject } from "react";
import { CameraStatus } from "../hooks/useCamera";
import { ScanState } from "../hooks/useScanner";
import DetectionIndicator from "./DetectionIndicator";

interface Props {
  videoRef: RefObject<HTMLVideoElement>;
  cameraStatus: CameraStatus;
  scanState: ScanState;
}

export default function CameraView({ videoRef, cameraStatus, scanState }: Props) {
  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className={`h-full w-full object-contain ${cameraStatus === "active" ? "" : "opacity-0"}`}
      />

      {cameraStatus !== "active" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-500">
          <CameraIcon />
          <p className="text-sm">
            {cameraStatus === "starting" ? "Requesting camera access..." : "Camera preview will appear here"}
          </p>
        </div>
      )}

      {cameraStatus === "active" && (
        <>
          <div className="absolute left-3 top-3">
            <DetectionIndicator state={scanState} />
          </div>
          <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-white/25" />
        </>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path
        d="M4 8a2 2 0 0 1 2-2h1.17a2 2 0 0 0 1.6-.8l.66-.9A2 2 0 0 1 11 3.5h2a2 2 0 0 1 1.6.8l.66.9a2 2 0 0 0 1.6.8H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
