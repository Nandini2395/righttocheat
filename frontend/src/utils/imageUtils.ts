export interface FrameSample {
  gray: Float32Array;
  width: number;
  height: number;
}

const SAMPLE_W = 160;

/**
 * Downsamples the current video frame to grayscale once, so both the blur check and the
 * frame-change check (used to avoid re-analyzing a static scene) can reuse the same pass.
 */
export function sampleFrame(video: HTMLVideoElement, sampleCanvas: HTMLCanvasElement): FrameSample {
  const sampleH = Math.round((video.videoHeight / video.videoWidth) * SAMPLE_W) || 120;

  sampleCanvas.width = SAMPLE_W;
  sampleCanvas.height = sampleH;
  const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { gray: new Float32Array(0), width: SAMPLE_W, height: sampleH };

  ctx.drawImage(video, 0, 0, SAMPLE_W, sampleH);
  const { data } = ctx.getImageData(0, 0, SAMPLE_W, sampleH);

  const gray = new Float32Array(SAMPLE_W * sampleH);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  return { gray, width: SAMPLE_W, height: sampleH };
}

/**
 * Variance of a simple Laplacian-like edge response — low variance means few sharp edges,
 * i.e. a blurry or featureless frame. Used to skip sending obviously unusable frames.
 */
export function sharpnessFromSample(sample: FrameSample): number {
  const { gray, width: W, height: H } = sample;
  if (gray.length === 0) return 1; // can't measure, don't block

  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const laplacian = 4 * gray[idx] - gray[idx - 1] - gray[idx + 1] - gray[idx - W] - gray[idx + W];
      sum += laplacian;
      sumSq += laplacian * laplacian;
      count++;
    }
  }

  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/**
 * Mean absolute per-pixel grayscale difference (0-255 scale) between two samples of the
 * same size. Used to detect "the camera is still pointed at the same question" so we don't
 * burn another LLM call re-analyzing a frame that hasn't meaningfully changed.
 */
export function frameDifference(a: FrameSample, b: FrameSample): number {
  if (a.gray.length === 0 || a.gray.length !== b.gray.length) return Infinity;
  let diff = 0;
  for (let i = 0; i < a.gray.length; i++) diff += Math.abs(a.gray[i] - b.gray[i]);
  return diff / a.gray.length;
}

export function captureFrameAsDataUrl(video: HTMLVideoElement, canvas: HTMLCanvasElement, quality = 0.85): string {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

// Empirically low-variance frames (out-of-focus, pointed at a blank surface) fall
// well under this threshold; sharp, text-filled frames are typically far above it.
export const SHARPNESS_BLUR_THRESHOLD = 25;

// Mean per-pixel grayscale delta below which two frames are considered "the same scene" —
// small enough to tolerate hand shake/lighting flicker, large enough to catch a real
// repositioning to a new question.
export const FRAME_CHANGE_THRESHOLD = 14;
