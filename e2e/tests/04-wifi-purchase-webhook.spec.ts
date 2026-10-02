import { createHmac } from "node:crypto";
import { test, expect } from "@playwright/test";
import { issueLink, waitForApiHealthy, API_BASE_URL } from "../fixtures/internal-api.js";

/**
 * Mirrors `STUB_WEBHOOK_SECRET` in
 * `services/bff/src/adapters/payment-gateway/stub.ts` exactly — that
 * constant is hardcoded (not env-sourced) and explicitly documented there
 * as "dev-only", so replicating the literal string here (rather than
 * importing the module, which this suite's separate process cannot do) is
 * accurate, not a guess. If that file's constant ever changes, this must
 * change with it.
 */
const STUB_WEBHOOK_SECRET = "dev-only-stub-payment-webhook-secret";

function signWebhookBody(rawBody: string): string {
  return createHmac("sha256", STUB_WEBHOOK_SECRET).update(Buffer.from(rawBody, "utf-8")).digest("hex");
}

/**
 * Design scenario 4/7: "WiFi purchase via stub webhook".
 *
 * Full purchase flow (task 10.1-10.4): browse `/trip/wifi`'s catalog,
 * create an order, simulate the payment gateway's webhook call, and assert
 * the UI reflects the activated entitlement after polling status.
 *
 * BLOCKED today by THREE independent, stacked gaps (`e2e/KNOWN-GAPS.md`):
 * - Gap A: no way to obtain the link token to open a session at all.
 * - Gap B: `wifi.checkout` defaults `false` and nothing in
 *   `docker-compose.yml`/`main-api.ts` overrides it, so `/trip/wifi` would
 *   403 with `feature_disabled` even with a valid session.
 * - Gap C: entitlement activation (`runWifiEntitlementActivationJob`) runs
 *   in the separate `bff-worker` process against its OWN empty, in-memory
 *   `WifiOrderStore` — it will never see an order `bff-api` created, so
 *   even past gaps A/B the order would stay stuck `PAID`, never
 *   `ENTITLEMENT_ACTIVE`.
 */
test("a full WiFi purchase activates the entitlement after the stub webhook fires", async ({
  page,
  request,
}) => {
  test.fixme(
    true,
    "Gaps A+B+C (e2e/KNOWN-GAPS.md): no token retrieval, wifi.checkout flag off with no override, " +
      "and bff-api/bff-worker don't share the WifiOrderStore",
  );

  await waitForApiHealthy(request);

  const { token } = await issueLink(request, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);

  await page.goto("/trip/wifi");
  const firstPackage = page.getByRole("button", { name: /comprar|buy|comprar/i }).first();
  await expect(firstPackage).toBeVisible();
  await firstPackage.click();

  // `createWifiOrder` redirects to the gateway's hosted session; the stub
  // gateway's hosted page is a deterministic fixture page this suite would
  // need a known URL/selector for once gap A/B are closed.
  await expect(page).toHaveURL(/order=/);

  // Simulate the payment gateway's webhook call directly (this is what a
  // real gateway would POST to `bff-api` asynchronously, independent of the
  // passenger's browser session).
  const idempotencyKey = new URL(page.url()).searchParams.get("order");
  const rawBody = JSON.stringify({
    type: "payment_succeeded",
    providerRef: `e2e-${idempotencyKey}`,
    orderIdempotencyKey: idempotencyKey,
    amountMinor: 500,
    currency: "USD",
  });
  const webhookResponse = await request.post(`${API_BASE_URL}/webhooks/payments/stub`, {
    headers: {
      "content-type": "application/json",
      "x-stub-signature": signWebhookBody(rawBody),
    },
    data: rawBody,
  });
  expect(webhookResponse.ok()).toBe(true);

  // Poll the UI until the entitlement shows active (worker-side activation
  // job needs at least one scan interval to run).
  await expect(page.getByText(/activ[ao]|active/i)).toBeVisible({ timeout: 15_000 });
});
