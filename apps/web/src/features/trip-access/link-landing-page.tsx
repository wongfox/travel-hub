import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Locale } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";
import { Alert } from "../../shared/ui/atoms/alert.js";
import { Card } from "../../shared/ui/atoms/card.js";
import { exchangeSession } from "./exchange-session.js";
import { readTokenFromHash } from "./read-token-from-hash.js";
import { ReissueForm } from "./reissue-form.js";

export interface LinkLandingPageProps {
  apiClient: ApiClient;
  /** Where trip home lives once the exchange succeeds. */
  navigate: (path: string) => void;
  /** Injectable seam for deterministic tests; defaults to the real browser fragment. */
  getHash?: () => string;
  /** Injectable seam for deterministic tests; defaults to the real `history.replaceState`. */
  replaceState?: (path: string) => void;
}

type ExchangeState = "exchanging" | "success" | "error";

const TRIP_HOME_PATH = "/trip";

/**
 * `trip-link-access` link-landing route (task 5.5, design Decision 4):
 * reads the opaque token out of the URL fragment (never sent to the
 * server as part of the path), exchanges it for a session via `POST
 * /api/session` (task 5.3), strips the fragment via `history.replaceState`
 * so it never lingers in browser history, and redirects to trip home — all
 * in the single additional navigation step the spec's "Valid, unexpired
 * token" scenario requires. On any failure (no token in the fragment, or
 * the exchange itself rejecting), shows a re-request path instead of a
 * dead-end error (spec "Expired or invalid token").
 */
export function LinkLandingPage({
  apiClient,
  navigate,
  getHash = () => window.location.hash,
  replaceState = (path: string) => window.history.replaceState(null, "", path),
}: LinkLandingPageProps) {
  const { t, i18n } = useTranslation();
  // Read once, synchronously, during the initial render (not inside the
  // effect below): the fragment never changes for the lifetime of this
  // component, and computing the starting state here — rather than calling
  // `setState` directly in the effect body — avoids the extra cascading
  // render `react-hooks/set-state-in-effect` warns about.
  const [token] = useState<string | null>(() => readTokenFromHash(getHash()));
  const [state, setState] = useState<ExchangeState>(token ? "exchanging" : "error");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    exchangeSession(apiClient, token, i18n.language as Locale)
      .then(() => {
        if (cancelled) return;
        replaceState(window.location.pathname);
        setState("success");
        navigate(TRIP_HOME_PATH);
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });

    return () => {
      cancelled = true;
    };
    // Intentionally runs once on mount: the fragment is read exactly once,
    // matching the "resolve on link open" flow — not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "error") {
    return (
      <div className="page landing">
        <Alert tone="warning" role="alert">
          {t("tripAccess.invalidLink")}
        </Alert>
        <Card className="landing__card">
          <ReissueForm apiClient={apiClient} />
        </Card>
      </div>
    );
  }

  return (
    <div className="page landing landing--opening">
      <span className="spinner spinner--lg" aria-hidden="true" />
      <p className="landing__text">{t("tripAccess.loading")}</p>
    </div>
  );
}
