import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Locale } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";
import { Alert } from "../../shared/ui/atoms/alert.js";
import { Button } from "../../shared/ui/atoms/button.js";
import { requestRelink } from "./request-relink.js";

export interface ReissueFormProps {
  apiClient: ApiClient;
}

type SubmitState = "idle" | "submitting" | "submitted" | "error";

/**
 * `trip-link-access` "Link re-request" UI (task 5.4/5.5, spec "Re-request
 * with non-matching inputs"): always shows the identical confirmation
 * message on a successful submission, regardless of whether the reservation
 * reference/surname matched anything server-side — the server's own `202`
 * response is uniform either way, and this component must never introduce
 * a distinguishable signal the server itself withholds.
 */
export function ReissueForm({ apiClient }: ReissueFormProps) {
  const { t, i18n } = useTranslation();
  const [reservationRef, setReservationRef] = useState("");
  const [surname, setSurname] = useState("");
  const [state, setState] = useState<SubmitState>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setState("submitting");
    try {
      await requestRelink(apiClient, {
        reservationRef,
        surname,
        locale: i18n.language as Locale,
      });
      setState("submitted");
    } catch {
      setState("error");
    }
  }

  if (state === "submitted") {
    return <Alert tone="success">{t("tripAccess.relinkForm.confirmation")}</Alert>;
  }

  return (
    <form className="stack" onSubmit={(event) => void handleSubmit(event)}>
      <label className="field">
        <span className="field__label">{t("tripAccess.relinkForm.reservationRef")}</span>
        <input
          className="input"
          autoCapitalize="characters"
          autoComplete="off"
          value={reservationRef}
          onChange={(event) => setReservationRef(event.target.value)}
          required
        />
      </label>
      <label className="field">
        <span className="field__label">{t("tripAccess.relinkForm.surname")}</span>
        <input
          className="input"
          autoComplete="family-name"
          value={surname}
          onChange={(event) => setSurname(event.target.value)}
          required
        />
      </label>
      <Button type="submit" block disabled={state === "submitting"}>
        {t("tripAccess.relinkForm.submit")}
      </Button>
      {state === "error" && <Alert tone="error">{t("tripAccess.relinkForm.error")}</Alert>}
    </form>
  );
}
