import { test, expect } from "@playwright/test";
import { issueLink, waitForApiHealthy } from "../fixtures/internal-api.js";

/**
 * Design scenario 2/7: "offline boarding pass".
 *
 * After one successful online load of `/trip/documents` (task 6.4/6.5), the
 * offline store (`shared/offline`, task 7.1) has written a `TripSnapshot`.
 * Going offline and reloading the same page must still render the ticket
 * list (not an error), with a freshness banner, per `offline-trip-data`'s
 * "Trip data accessible with no connectivity" requirement.
 *
 * BLOCKED today by Gap A (`e2e/KNOWN-GAPS.md`).
 */
test("boarding pass/tickets remain visible after going offline and reloading", async ({
  page,
  context,
  request,
}) => {
  test.fixme(true, "Gap A (e2e/KNOWN-GAPS.md): POST /internal/links never returns a retrievable token/linkUrl");

  await waitForApiHealthy(request);

  const { token } = await issueLink(request, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  // One successful ONLINE load first, so the offline store has something to
  // fall back to.
  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);
  await page.goto("/trip/documents");
  await expect(page.getByRole("heading")).toBeVisible();

  // Now go offline and reload the exact same route.
  await context.setOffline(true);
  await page.reload();

  // Still renders real ticket content from the cached `TripSnapshot`, not
  // `trip.loadError`'s role="alert" state.
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("heading")).toBeVisible();

  // A freshness ("last updated at...") indicator is present while offline.
  await expect(page.getByText(/actualizaci[oó]n|last updated|atualiza/i)).toBeVisible();

  await context.setOffline(false);
});
