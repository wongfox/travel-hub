import { test, expect } from "../fixtures/stack.js";

/**
 * Guards the harness itself: the static server must mirror
 * `apps/web/docker/nginx.conf` (same-origin `/api`, `/webhooks`, `/healthz`
 * proxy; `/internal` NOT proxied; SPA fallback; `index.html` never cached) so
 * the suite keeps exercising the same boundary as the deployed web front.
 */
test.describe("in-process harness", () => {
  test("proxies /healthz and serves the SPA shell without caching it", async ({ request, stack }) => {
    const health = await request.get(`${stack.webUrl}/healthz`);
    expect(health.ok()).toBe(true);

    const shell = await request.get(`${stack.webUrl}/trip/documents`);
    expect(shell.status()).toBe(200);
    expect(shell.headers()["content-type"]).toContain("text/html");
    expect(shell.headers()["cache-control"]).toBe("no-cache");
  });

  test("never exposes /internal/* through the web origin", async ({ request, stack }) => {
    const before = stack.linkDelivery.deliveries.length;

    const response = await request.post(`${stack.webUrl}/internal/links`, {
      headers: { authorization: `Bearer ${stack.internalApiKey}` },
      data: {
        reservationRef: "RES-1001",
        contact: { kind: "email", address: "must-not-be-issued@example.com" },
        locale: "es",
      },
    });

    // Falls through to the SPA fallback exactly like nginx; the BFF never saw it.
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(stack.linkDelivery.deliveries).toHaveLength(before);
  });

  test("link issuance never returns the token over HTTP", async ({ stack }) => {
    const response = await stack.inject({
      method: "POST",
      url: "/internal/links",
      headers: { authorization: `Bearer ${stack.internalApiKey}`, "content-type": "application/json" },
      payload: {
        reservationRef: "RES-1001",
        contact: { kind: "email", address: "sanity@example.com" },
        locale: "es",
      },
    });
    expect(response.statusCode).toBe(201);

    const delivery = stack.linkDelivery.deliveries.at(-1);
    const token = new URL(delivery!.linkUrl).hash.slice(1);
    expect(token.length).toBeGreaterThan(16);
    expect(response.body).not.toContain(token);
    expect(Object.keys(response.json<Record<string, unknown>>()).sort()).toEqual(["accessLinkId", "expiresAt"]);
  });
});
