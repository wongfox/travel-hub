/**
 * A decoded RGBA pixel buffer — deliberately shaped like the DOM's own
 * `ImageData` (`width`, `height`, `data`) rather than requiring the real
 * type, so this pure function never needs a browser `CanvasRenderingContext2D`
 * to be unit tested (design Decision 15's "cheap quality checks (no ML)").
 */
export interface QualityCheckImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type QualityIssue = "low_resolution" | "blurry" | "poor_exposure";

export interface ImageQualityResult {
  ok: boolean;
  reasons: QualityIssue[];
}

export interface ImageQualityThresholds {
  minWidth: number;
  minHeight: number;
  /** Below this Laplacian-variance value, the image is judged out of focus. */
  blurVarianceThreshold: number;
  minMeanBrightness: number;
  maxMeanBrightness: number;
}

/**
 * Defaults per design Decision 15 ("min resolution, blur via Laplacian
 * variance, exposure histogram" — no fixed numbers named in the design, so
 * these are this task's own configurable starting point, not an invented
 * business requirement).
 */
export const DEFAULT_IMAGE_QUALITY_THRESHOLDS: ImageQualityThresholds = {
  minWidth: 480,
  minHeight: 480,
  blurVarianceThreshold: 50,
  minMeanBrightness: 25,
  maxMeanBrightness: 230,
};

function toGrayscale(image: QualityCheckImage): Float64Array {
  const gray = new Float64Array(image.width * image.height);
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    const r = image.data[offset] ?? 0;
    const g = image.data[offset + 1] ?? 0;
    const b = image.data[offset + 2] ?? 0;
    // Standard luma weights (ITU-R BT.601) — good enough for a coarse
    // sharpness/exposure heuristic, not color-accurate rendering.
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/**
 * Variance of the discrete Laplacian (edge-detection kernel `[[0,1,0],
 * [1,-4,1],[0,1,0]]`) across the image. A blurry/out-of-focus image has weak,
 * smoothed edges and therefore low Laplacian variance; a sharp image has
 * strong edges and high variance. This is the same well-known
 * "variance of Laplacian" blur heuristic the design names.
 */
function laplacianVariance(gray: Float64Array, width: number, height: number): number {
  if (width < 3 || height < 3) {
    // Too small to evaluate a 3x3 kernel meaningfully; treat as blurry so it
    // never slips past on a technicality (it will also fail low_resolution).
    return 0;
  }
  const values: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        (gray[idx - width] ?? 0) +
        (gray[idx + width] ?? 0) +
        (gray[idx - 1] ?? 0) +
        (gray[idx + 1] ?? 0) -
        4 * (gray[idx] ?? 0);
      values.push(lap);
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

function meanBrightness(gray: Float64Array): number {
  if (gray.length === 0) return 0;
  let sum = 0;
  for (const value of gray) sum += value;
  return sum / gray.length;
}

/**
 * Pre check-in's client-side capture-quality gate (task 8.2, design Decision
 * 15). Runs entirely on decoded pixel data — no network call, no ML model —
 * before a captured photo/ID image is accepted for submission (task 8.3).
 */
export function computeImageQuality(
  image: QualityCheckImage,
  thresholds: ImageQualityThresholds = DEFAULT_IMAGE_QUALITY_THRESHOLDS,
): ImageQualityResult {
  const reasons: QualityIssue[] = [];

  if (image.width < thresholds.minWidth || image.height < thresholds.minHeight) {
    reasons.push("low_resolution");
  }

  const gray = toGrayscale(image);
  const variance = laplacianVariance(gray, image.width, image.height);
  if (variance < thresholds.blurVarianceThreshold) {
    reasons.push("blurry");
  }

  const brightness = meanBrightness(gray);
  if (brightness < thresholds.minMeanBrightness || brightness > thresholds.maxMeanBrightness) {
    reasons.push("poor_exposure");
  }

  return { ok: reasons.length === 0, reasons };
}
