/**
 * `push-notifications` feature-detection (task 11.3, design Decision 11:
 * "on iOS only in standalone display mode, otherwise an add-to-home-screen
 * explainer"). Pure function over an injected `PushEligibilityEnv` so it is
 * unit-testable without a real browser — `detectPushEligibilityEnv` is the
 * one place that actually reads `window`/`navigator`.
 */
export type PushEligibility = "ineligible" | "needs_a2hs" | "eligible";

export interface PushEligibilityEnv {
  /** `"PushManager" in window && "serviceWorker" in navigator` — the baseline Web Push support check. */
  hasPushManager: boolean;
  /** Whether the current device is iOS (Safari requires standalone/home-screen mode for web push). */
  isIosDevice: boolean;
  /** Whether the PWA is currently running in standalone/installed mode. */
  isStandalone: boolean;
}

/**
 * `"ineligible"`: no opt-in option is ever shown (spec "Ineligible platform
 * skips push offer entirely" — the acceptance this function exists for).
 * `"needs_a2hs"`: the platform supports push but only once installed to the
 * home screen (iOS Safari); the explainer is shown instead of a permission
 * prompt. `"eligible"`: the opt-in control itself may be shown.
 */
export function resolvePushEligibility(env: PushEligibilityEnv): PushEligibility {
  if (!env.hasPushManager) {
    return "ineligible";
  }
  if (env.isIosDevice && !env.isStandalone) {
    return "needs_a2hs";
  }
  return "eligible";
}

/** Reads the real browser environment; the only place in this module that touches global `window`/`navigator`. */
export function detectPushEligibilityEnv(): PushEligibilityEnv {
  const hasWindow = typeof window !== "undefined";
  const hasNavigator = typeof navigator !== "undefined";

  const hasPushManager = hasWindow && hasNavigator && "PushManager" in window && "serviceWorker" in navigator;
  const isIosDevice = hasNavigator && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone =
    (hasNavigator && (navigator as Navigator & { standalone?: boolean }).standalone === true) ||
    (hasWindow && typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches);

  return { hasPushManager, isIosDevice, isStandalone };
}
