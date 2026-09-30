import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ApiClient } from "../../../shared/api/client.js";
import { ConsentScreen } from "./consent-screen.js";
import { submitConsent } from "./submit-consent.js";

export interface PrecheckinConsentGateProps {
  apiClient: ApiClient;
  /** The currently published consent text's version (design's `PRECHECKIN_CONSENT_TEXT_VERSION`, go-live-guard input). */
  consentTextVersion: string;
  children: ReactNode;
}

type GateState = "pending" | "submitting" | "granted" | "declined" | "error";

/**
 * `pre-check-in`'s consent gate (task 8.1/8.2, spec "Consent required before
 * camera access": "the system... MUST NOT request camera access or accept an
 * uploaded file until consent is given"). `children` (the capture UI) is
 * never rendered until `POST /api/consents` has successfully recorded a
 * granted consent — not merely "the accept button was clicked" — so a failed
 * request never silently lets the passenger through.
 */
export function PrecheckinConsentGate({ apiClient, consentTextVersion, children }: PrecheckinConsentGateProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<GateState>("pending");

  async function record(granted: boolean): Promise<void> {
    setState("submitting");
    try {
      const result = await submitConsent(apiClient, {
        purpose: "precheckin_biometric",
        textVersion: consentTextVersion,
        granted,
      });
      setState(result.granted ? "granted" : "declined");
    } catch {
      setState("error");
    }
  }

  if (state === "granted") {
    return <>{children}</>;
  }

  if (state === "declined") {
    return <p role="status">{t("precheckin.consent.declined")}</p>;
  }

  return (
    <div>
      <ConsentScreen
        onAccept={() => void record(true)}
        onDecline={() => void record(false)}
        submitting={state === "submitting"}
      />
      {state === "error" && <p role="alert">{t("precheckin.consent.error")}</p>}
    </div>
  );
}
