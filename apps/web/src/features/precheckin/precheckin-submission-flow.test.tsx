import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import { ApiError, type ApiClient } from "../../shared/api/client.js";
import { PrecheckinSubmissionFlow } from "./precheckin-submission-flow.js";

afterEach(() => cleanup());

function buildApiClient(post: ApiClient["post"]): ApiClient {
  return { get: vi.fn(), post, delete: vi.fn() };
}

function renderFlow(post: ApiClient["post"], extra: { onConsentRequired?: () => void; onSubmitted?: () => void } = {}) {
  const onConsentRequired = extra.onConsentRequired ?? vi.fn();
  const onSubmitted = extra.onSubmitted ?? vi.fn();
  render(
    <I18nextProvider i18n={createI18n({ initialLocale: "en" })}>
      <PrecheckinSubmissionFlow
        apiClient={buildApiClient(post)}
        passengerOrdinal={1}
        consentRecordId="consent-1"
        onConsentRequired={onConsentRequired}
        onSubmitted={onSubmitted}
        mediaDevices={{}}
      />
    </I18nextProvider>,
  );
  return { onConsentRequired, onSubmitted };
}

async function captureBoth(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(await screen.findByTestId("precheckin-file-fallback-photo"), new File(["p"], "p.jpg", { type: "image/jpeg" }));
  await user.upload(await screen.findByTestId("precheckin-file-fallback-id_front"), new File(["i"], "i.jpg", { type: "image/jpeg" }));
}

describe("PrecheckinSubmissionFlow", () => {
  it("captures the photo, then the ID front, and only then offers submission", async () => {
    const user = userEvent.setup();
    renderFlow(vi.fn());

    expect(screen.queryByTestId("precheckin-file-fallback-id_front")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send pre check-in" })).not.toBeInTheDocument();
    await user.upload(screen.getByTestId("precheckin-file-fallback-photo"), new File(["p"], "p.jpg", { type: "image/jpeg" }));
    expect(await screen.findByTestId("precheckin-file-fallback-id_front")).toBeInTheDocument();
    await user.upload(screen.getByTestId("precheckin-file-fallback-id_front"), new File(["i"], "i.jpg", { type: "image/jpeg" }));

    expect(await screen.findByRole("button", { name: "Send pre check-in" })).toBeDisabled();
  });

  it("submits after the passenger picks a document type, then reports success", async () => {
    const user = userEvent.setup();
    const post = vi.fn().mockResolvedValue({ passengerOrdinal: 1, status: "received" });
    const { onSubmitted } = renderFlow(post);
    await captureBoth(user);

    await user.selectOptions(await screen.findByLabelText("Document type"), "PASSPORT");
    await user.click(screen.getByRole("button", { name: "Send pre check-in" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    const [path, body] = post.mock.calls[0]!;
    expect(path).toBe("/api/precheckin/1");
    expect((body as FormData).get("docType")).toBe("PASSPORT");
    expect((body as FormData).get("consentRecordId")).toBe("consent-1");
  });

  it("keeps the captures and retries without asking for consent again after a network/server error", async () => {
    const user = userEvent.setup();
    const post = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ passengerOrdinal: 1, status: "received" });
    const { onSubmitted, onConsentRequired } = renderFlow(post);
    await captureBoth(user);
    await user.selectOptions(await screen.findByLabelText("Document type"), "DNI");

    await user.click(screen.getByRole("button", { name: "Send pre check-in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't send/i);
    expect(onSubmitted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Send pre check-in" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledTimes(2);
    expect(onConsentRequired).not.toHaveBeenCalled();
  });

  it("asks for consent again when the BFF answers 403 consent_required", async () => {
    const user = userEvent.setup();
    const post = vi.fn().mockRejectedValue(new ApiError("consent_required", "req-1", 403));
    const { onConsentRequired, onSubmitted } = renderFlow(post);
    await captureBoth(user);
    await user.selectOptions(await screen.findByLabelText("Document type"), "DNI");

    await user.click(screen.getByRole("button", { name: "Send pre check-in" }));

    await waitFor(() => expect(onConsentRequired).toHaveBeenCalledTimes(1));
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("treats 409 already_submitted as completed, not as an error", async () => {
    const user = userEvent.setup();
    const post = vi.fn().mockRejectedValue(new ApiError("already_submitted", "req-1", 409));
    const { onSubmitted } = renderFlow(post);
    await captureBoth(user);
    await user.selectOptions(await screen.findByLabelText("Document type"), "DNI");

    await user.click(screen.getByRole("button", { name: "Send pre check-in" }));

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows an unavailable message, not a retry, when the BFF answers 403 feature_disabled", async () => {
    const user = userEvent.setup();
    const post = vi.fn().mockRejectedValue(new ApiError("feature_disabled", "req-1", 403));
    renderFlow(post);
    await captureBoth(user);
    await user.selectOptions(await screen.findByLabelText("Document type"), "DNI");

    await user.click(screen.getByRole("button", { name: "Send pre check-in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not available right now/i);
    expect(screen.queryByRole("button", { name: "Send pre check-in" })).not.toBeInTheDocument();
  });
});
