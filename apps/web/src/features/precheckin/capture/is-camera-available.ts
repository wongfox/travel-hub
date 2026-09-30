/**
 * The subset of `MediaDevices` this feature depends on — narrowed to just
 * "does a `getUserMedia` function exist at all" so this module never has to
 * agree on `camera-capture.ts`'s own (stricter, return-type-specific)
 * `MediaDevicesLike` shape; only whether the property is callable matters
 * for availability detection.
 */
export interface MediaDevicesLike {
  getUserMedia?: unknown;
}

/**
 * Feature-detects live camera capture (`pre-check-in` "Camera unavailable,
 * fallback used" scenario). `undefined`/`null` covers browsers with no
 * `navigator.mediaDevices` at all and known in-app webviews (WhatsApp,
 * Gmail, Instagram — design Decision 15) that strip it entirely; a present
 * `mediaDevices` without a `getUserMedia` function covers older/locked-down
 * embedded browsers that expose a partial API.
 */
export function isCameraAvailable(mediaDevices: MediaDevicesLike | null | undefined): boolean {
  return typeof mediaDevices?.getUserMedia === "function";
}
