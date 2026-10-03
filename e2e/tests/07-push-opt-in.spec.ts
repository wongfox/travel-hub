import { test, expect } from "@playwright/test";
import { issueLink, waitForApiHealthy } from "../fixtures/internal-api.js";

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
 * BLOCKED today by:
 * - Gap A: no way to obtain the link token.
 * - Gap B: `push.enabled` defaults `false` with no override.
 */
test("an eligible passenger can opt in to push notifications", async ({ page, context, request }) => {
  test.fixme(
    true,
    "Gaps A+B (e2e/KNOWN-GAPS.md): no token retrieval, push.enabled flag off with no override",
  );

  await context.grantPermissions(["notifications"]);
  await waitForApiHealthy(request);

  const { token } = await issueLink(request, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);

  await page.goto("/trip/push");
  await expect(page.getByRole("heading", { name: /notification/i })).toBeVisible();

  await page.getByRole("button", { name: /enable notifications|activar notificaciones/i }).click();

  await expect(page.getByText(/notifications are enabled|notificaciones.*activ/i)).toBeVisible();
});
