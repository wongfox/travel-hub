import { test, expect } from "../fixtures/stack.js";
import { issueLink } from "../fixtures/internal-api.js";

/**
 * Design scenario 4/7: "WiFi purchase via stub webhook".
 *
 * Full purchase flow (task 10.1-10.4): browse `/trip/wifi`'s catalog,
 * create an order, simulate the payment gateway's webhook call, and assert
 * the UI reflects the activated entitlement after polling status.
 *
 * Runs against the in-process BFF: `wifi.checkout` is enabled via the
 * composition root's `flags` option, and api and worker share one
 * `WifiOrderStore`, so the entitlement-activation job sees the paid order.
 * The webhook is signed by the very `PaymentGatewayStub` instance the BFF
 * uses, and posted through the web origin's `/webhooks` proxy.
 */
test("a full WiFi purchase activates the entitlement after the stub webhook fires", async ({ page, stack }) => {
  const { token } = await issueLink(stack, {
    reservationRef: "RES-1001",
    contact: { kind: "email", address: "passenger@example.com" },
    locale: "es",
  });

  await page.goto(`/t#${token}`);
  await expect(page).toHaveURL(/\/trip$/);

  // The stub gateway's hosted page is an external, non-routable host: serve a
  // placeholder so the passenger's redirect lands somewhere, as a real gateway would.
  await page.route("https://stub-gateway.local/**", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<h1>stub payment gateway</h1>" }),
  );

  await page.goto("/trip/wifi");
  const firstPackage = page.getByRole("button", { name: /comprar|buy/i }).first();
  await expect(firstPackage).toBeVisible();
  await firstPackage.click();

  await page.waitForURL(/stub-gateway\.local\/pay\//);

  const session = stack.paymentGateway.createdSessions.at(-1);
  expect(session).toBeDefined();
  const idempotencyKey = session!.idempotencyKey;
  const order = await stack.wifiOrderStore.findByIdempotencyKey(idempotencyKey);
  expect(order).not.toBeNull();

  // The gateway's asynchronous webhook call, independent of the browser
  // session, through the same-origin `/webhooks` proxy.
  const { rawBody, headers } = stack.paymentGateway.buildWebhookRequest({
    type: "payment_succeeded",
    providerRef: `e2e-${idempotencyKey}`,
    orderIdempotencyKey: idempotencyKey,
    amountMinor: order!.amountMinor,
    currency: order!.currency,
  });
  const webhookResponse = await page.request.post(`${stack.webUrl}/webhooks/payments/stub`, {
    headers: { ...headers, "content-type": "application/json" },
    data: rawBody,
  });
  expect(webhookResponse.ok()).toBe(true);

  // The passenger returns from the gateway; the return view polls the order
  // status while the worker-side activation scan (harness job interval) runs.
  await page.goto(`/trip/wifi?order=${idempotencyKey}`);
  await expect(page.getByText(/your wifi is active|tu wifi está activo|seu wifi está ativo/i)).toBeVisible({
    timeout: 15_000,
  });
});
