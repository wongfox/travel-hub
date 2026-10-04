import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ConsentPurpose } from "contracts";
import type { ApiClient } from "../api/client.js";
import { Alert } from "../ui/atoms/alert.js";
import { cacheGrantedConsent, clearCachedConsent, hasCachedGrantedConsent } from "./consent-cache.js";
import { PurposeConsentScreen } from "./purpose-consent-screen.js";
import { submitConsent } from "./submit-consent.js";

export interface ConsentGateContext {
  /** Identifier of the consent record just written (`POST /api/consents`'s `recordId`); undefined for a cached grant. */
  consentRecordId?: string;
  /** Call when the BFF answers 403 `consent_required`: forgets any cached grant and shows the consent screen again. */
  onConsentRequired: () => void;
}

export interface PurposeConsentGateProps {
  apiClient: ApiClient;
  purpose: ConsentPurpose;
  /** The currently published consent text version (served by the BFF). */
  textVersion: string;
  /** i18n key prefix owning `title`, `body`, `accept`, `decline`, `declined` and `error`. */
  i18nPrefix: string;
  /** When set (e.g. the trip's `linkId`), a granted consent is cached per device and scope so a reload does not re-ask. */
  cacheScope?: string;
  children: ReactNode | ((context: ConsentGateContext) => ReactNode);
}

type GateState = "pending" | "submitting" | "granted" | "declined" | "error";

/**
 * Shared consent gate: `children` render only after `POST /api/consents` has
 * recorded a granted consent (or a cached grant for the same text version
 * exists). A declined consent leaves the feature unavailable with a calm,
 * non-error message and no retry control.
 *
 * TODO(legal): the copy behind `i18nPrefix` is provisional for push and pulse.
 */
export function PurposeConsentGate({
  apiClient,
  purpose,
  textVersion,
  i18nPrefix,
  cacheScope,
  children,
}: PurposeConsentGateProps) {
  const { t } = useTranslation();
  const [recordId, setRecordId] = useState<string | undefined>(undefined);
  const [state, setState] = useState<GateState>(() =>
    cacheScope !== undefined && hasCachedGrantedConsent(cacheScope, purpose, textVersion) ? "granted" : "pending",
  );

  async function record(granted: boolean): Promise<void> {
    setState("submitting");
    try {
      const result = await submitConsent(apiClient, { purpose, textVersion, granted });
      if (result.granted && cacheScope !== undefined) {
        cacheGrantedConsent(cacheScope, purpose, textVersion);
      }
      setRecordId(result.granted ? result.recordId : undefined);
      setState(result.granted ? "granted" : "declined");
    } catch {
      setState("error");
    }
  }

  function onConsentRequired(): void {
    if (cacheScope !== undefined) {
      clearCachedConsent(cacheScope, purpose);
    }
    setRecordId(undefined);
    setState("pending");
  }

  if (state === "granted") {
    return <>{typeof children === "function" ? children({ onConsentRequired, ...(recordId ? { consentRecordId: recordId } : {}) }) : children}</>;
  }
  if (state === "declined") {
    return <Alert tone="info">{t(`${i18nPrefix}.declined`)}</Alert>;
  }
  return (
    <div className="stack">
      <PurposeConsentScreen
        i18nPrefix={i18nPrefix}
        onAccept={() => void record(true)}
        onDecline={() => void record(false)}
        submitting={state === "submitting"}
      />
      {state === "error" && <Alert tone="error">{t(`${i18nPrefix}.error`)}</Alert>}
    </div>
  );
}
