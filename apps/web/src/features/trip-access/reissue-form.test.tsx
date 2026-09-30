import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../i18n/index.js";
import type { ApiClient } from "../../shared/api/client.js";
import { ReissueForm } from "./reissue-form.js";

function renderForm(apiClient: ApiClient) {
  const i18n = createI18n({ initialLocale: "en" });
  return render(
    <I18nextProvider i18n={i18n}>
      <ReissueForm apiClient={apiClient} />
    </I18nextProvider>,
  );
}

function buildFakeApiClient(post: ApiClient["post"]): ApiClient {
  return { get: vi.fn(), post, delete: vi.fn() };
}

describe("ReissueForm", () => {
  it("submits the entered reservation reference and surname to the reissue endpoint", async () => {
    const post = vi.fn().mockResolvedValue({ status: "accepted" });
    const user = userEvent.setup();
    renderForm(buildFakeApiClient(post));

    await user.type(screen.getByLabelText("Booking reference"), "RES-1001");
    await user.type(screen.getByLabelText("Surname"), "Torres");
    await user.click(screen.getByRole("button", { name: "Send me a new link" }));

    expect(post).toHaveBeenCalledWith("/api/links/reissue", {
      reservationRef: "RES-1001",
      surname: "Torres",
      locale: "en",
    });
  });

  it("shows the same confirmation message on submit regardless of whether a reservation matched", async () => {
    const post = vi.fn().mockResolvedValue({ status: "accepted" });
    const user = userEvent.setup();
    renderForm(buildFakeApiClient(post));

    await user.type(screen.getByLabelText("Booking reference"), "RES-9999");
    await user.type(screen.getByLabelText("Surname"), "Nobody");
    await user.click(screen.getByRole("button", { name: "Send me a new link" }));

    expect(
      await screen.findByText("If those details match a booking, we've sent a new link."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the request itself fails (network/server error)", async () => {
    const post = vi.fn().mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderForm(buildFakeApiClient(post));

    await user.type(screen.getByLabelText("Booking reference"), "RES-1001");
    await user.type(screen.getByLabelText("Surname"), "Torres");
    await user.click(screen.getByRole("button", { name: "Send me a new link" }));

    expect(await screen.findByText("Something went wrong. Please try again.")).toBeInTheDocument();
  });
});
