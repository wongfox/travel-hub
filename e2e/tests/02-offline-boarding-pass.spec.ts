import { test, expect } from "../fixtures/stack.js";
import { issueLink } from "../fixtures/internal-api.js";

/**
 * Design scenario 2/7: "offline boarding pass".
 *
 * After one successful online load of `/trip/documents` (task 6.4/6.5), the
 * offline store (`shared/offline`, task 7.1) has written a `TripSnapshot`.
 * Going offline and reloading the same page must still render the ticket
 * list (not an error), with a freshness banner, per `offline-trip-data`'s
 * "Trip data accessible with no connectivity" requirement.
 *
 * Gap A (token retrieval) is resolved by the in-process harness (`fixtures/internal-api.ts`).
 */
test("boarding pass/tickets remain visible after going offline and reloading", async ({
  page,
  context,
  stack,
}) => {
  const { token } = await issueLink(stack, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  // One successful ONLINE load first, so the offline store has something to
  // fall back to.
  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);
  await page.goto("/trip/documents");
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

  // The service worker must be installed AND controlling this page for an
  // offline navigation to be served at all; wait for that, then reload once
  // online so the documents route is also in the offline store.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible();

  // Now go offline and reload the exact same route.
  await context.setOffline(true);
  await page.reload();

  // Still renders real ticket content from the cached `TripSnapshot`, not
  // `trip.loadError`'s role="alert" state. The app only falls back to the
  // snapshot once TanStack Query's default retries (1s+2s+4s backoff) give up,
  // so the first paint is "Loading your trip…" for ~7s: wait it out.
  await expect(page.getByRole("heading", { level: 2 })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("alert")).toHaveCount(0);

  // A freshness ("last updated at...") indicator is present while offline,
  // alongside the cached tickets (barcode payloads from the seeded RES-1001).
  await expect(page.getByText(/actualizaci[oó]n|last updated|atualiza/i)).toBeVisible();
  await expect(page.getByText(/BP-RES-1001-L1/)).toBeVisible();

  await context.setOffline(false);
});
