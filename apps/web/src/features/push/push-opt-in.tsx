import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Locale } from "contracts";
import { ApiError, type ApiClient } from "../../shared/api/client.js";
import { Alert } from "../../shared/ui/atoms/alert.js";
import { Button } from "../../shared/ui/atoms/button.js";
import { Icon } from "../../shared/ui/atoms/icon.js";
import { StatusPanel } from "../../shared/ui/atoms/status-panel.js";
import { PurposeConsentGate } from "../../shared/consent/purpose-consent-gate.js";
import { createPushSubscription } from "../../shared/push/get-push.js";
import {
  detectPushEligibilityEnv,
  resolvePushEligibility,
  type PushEligibilityEnv,
} from "../../shared/push/push-eligibility.js";

interface BrowserPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Real browser subscription flow: waits for the active service worker, then subscribes via `PushManager`. Only ever called when `resolvePushEligibility` already returned `"eligible"`. */
async function defaultSubscribeToBrowserPush(): Promise<BrowserPushSubscription> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true });
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error("PushManager.subscribe() returned an incomplete subscription");
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

export interface PushOptInProps {
  apiClient: ApiClient;
  /** `trip.features.pushA2hsPrompt` (design Decision 13): whether the add-to-home-screen explainer is shown at all. */
  a2hsPromptEnabled: boolean;
  locale: Locale;
  /** `trip.consentTextVersions.push`: the consent text version the BFF currently publishes. */
  consentTextVersion: string;
  /** `trip.linkId`: scopes the per-device cache of the granted consent so a reload does not re-ask. */
  cacheScope: string;
  /** Injectable seam for deterministic tests; defaults to the real browser environment. */
  env?: PushEligibilityEnv;
  /** Injectable seam for deterministic tests; defaults to the real `PushManager` flow. */
  subscribeToBrowserPush?: () => Promise<BrowserPushSubscription>;
}

/**
 * `push-notifications` opt-in UI (task 11.3): feature-detects eligibility
 * first and renders NOTHING for an ineligible browser (spec "Ineligible
 * platform skips push offer entirely" — not even a disabled control, the
 * option itself is absent). An iOS browser that needs add-to-home-screen
 * sees only the explainer (gated by `push.a2hs_prompt`), never a permission
 * prompt. An eligible browser sees the opt-in button; a subscribe failure
 * (permission denied, browser error) shows an error message without
 * crashing — the passenger can retry.
 */
export function PushOptIn({
  apiClient,
  a2hsPromptEnabled,
  locale,
  consentTextVersion,
  cacheScope,
  env = detectPushEligibilityEnv(),
  subscribeToBrowserPush = defaultSubscribeToBrowserPush,
}: PushOptInProps) {
  const { t } = useTranslation();
  const eligibility = resolvePushEligibility(env);

  if (eligibility === "ineligible") {
    return null;
  }

  if (eligibility === "needs_a2hs") {
    if (!a2hsPromptEnabled) {
      return null;
    }
    return (
      <Alert tone="info" testId="push-a2hs-explainer">
        {t("push.a2hsExplainer")}
      </Alert>
    );
  }

  // Consent comes BEFORE the browser permission prompt: the enable button
  // (and so `subscribeToBrowserPush`) only exists once `push` consent is
  // recorded. A 403 `consent_required` from the BFF re-shows the gate.
  return (
    <PurposeConsentGate
      apiClient={apiClient}
      purpose="push"
      textVersion={consentTextVersion}
      i18nPrefix="consent.push"
      cacheScope={cacheScope}
    >
      {({ onConsentRequired }) => (
        <PushEnableButton
          apiClient={apiClient}
          locale={locale}
          subscribeToBrowserPush={subscribeToBrowserPush}
          onConsentRequired={onConsentRequired}
        />
      )}
    </PurposeConsentGate>
  );
}

interface PushEnableButtonProps {
  apiClient: ApiClient;
  locale: Locale;
  subscribeToBrowserPush: () => Promise<BrowserPushSubscription>;
  onConsentRequired: () => void;
}

function PushEnableButton({ apiClient, locale, subscribeToBrowserPush, onConsentRequired }: PushEnableButtonProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "subscribing" | "subscribed" | "error">("idle");

  async function handleOptIn(): Promise<void> {
    setState("subscribing");
    try {
      const browserSubscription = await subscribeToBrowserPush();
      await createPushSubscription(apiClient, {
        endpoint: browserSubscription.endpoint,
        keys: browserSubscription.keys,
        locale,
      });
      setState("subscribed");
    } catch (error) {
      if (error instanceof ApiError && error.code === "consent_required") {
        onConsentRequired();
        return;
      }
      setState("error");
    }
  }

  if (state === "subscribed") {
    return (
      <StatusPanel tone="success" role="status">
        <p>{t("push.subscribed")}</p>
      </StatusPanel>
    );
  }

  return (
    <div className="opt-in">
      <span className="opt-in__icon">
        <Icon name="bell" size={32} />
      </span>
      <Button block onClick={() => void handleOptIn()} disabled={state === "subscribing"}>
        {t("push.optIn")}
      </Button>
      {state === "error" && <Alert tone="error">{t("push.optInError")}</Alert>}
    </div>
  );
}
