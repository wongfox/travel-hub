import { test, expect } from "../fixtures/stack.js";
import { issueLink } from "../fixtures/internal-api.js";
import { grantConsent } from "../fixtures/passenger-api.js";

/**
 * Design scenario 7/7: "push opt-in (Chromium)".
 *
 * Chromium-only per the design's own scenario name (Firefox/WebKit's Push
 * API support/permission model differs enough that the design never asked
 * for cross-browser push coverage) — enforced via `playwright.config.ts`'s
 * `testIgnore` on the `firefox` project.
 *
 * Exercises task 11.1/11.3: `PushManager` feature-detection, the opt-in
 * button, and `POST /api/push/subscriptions` actually persisting a
 * consent-gated subscription. This scenario is specifically about the
 * OPT-IN step, not push delivery (scenario 6 is a closer analog for a
 * delivery-shaped assertion) — it does NOT depend on Gap C's cross-process
 * store sharing, only on Gaps A and B.
 *
 * Runs against the in-process BFF with `push.enabled` on via the composition
 * root's `flags` option; the link token comes from the stub delivery port.
 */
test("an eligible passenger can opt in to push notifications", async ({ page, context, stack }) => {
  await context.grantPermissions(["notifications"]);

  // A headless browser in a network-less container has no push service to
  // subscribe against. Replace only `PushManager.subscribe` with a fake that
  // returns a subscription-shaped object; everything else (feature detection,
  // service worker readiness, the BFF subscription route) is real.
  await page.addInitScript(() => {
    PushManager.prototype.subscribe = async () =>
      ({
        endpoint: "https://push.example.test/e2e-endpoint",
        toJSON: () => ({
          endpoint: "https://push.example.test/e2e-endpoint",
          keys: { p256dh: "e2e-p256dh-key", auth: "e2e-auth-secret" },
        }),
      }) as unknown as PushSubscription;
  });

  const { token } = await issueLink(stack, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);

  // Gap E (e2e/KNOWN-GAPS.md): no web UI records push consent; the BFF
  // requires it, so it is recorded through the public consent route.
  await grantConsent(page, "push");

  await page.goto("/trip/push");
  await expect(page.getByRole("heading", { name: /notification/i })).toBeVisible();

  await page.getByRole("button", { name: /enable notifications|activar notificaciones/i }).click();

  await expect(page.getByText(/notifications are enabled|notificaciones.*activ/i)).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
