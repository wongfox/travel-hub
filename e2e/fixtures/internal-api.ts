import type { APIRequestContext } from "@playwright/test";

/**
 * Base URL for `bff-api`'s own exposed port (task 13.1's docker-compose.yml:
 * `POST /internal/links` is called directly against this port, never
 * through `web`'s nginx — design-interfaces documents this route as
 * "not internet-exposed via CDN", mirrored by `nginx.conf` not proxying it).
 */
export const API_BASE_URL = process.env["E2E_API_BASE_URL"] ?? "http://localhost:3000";

/**
 * Matches docker-compose.yml's `INTERNAL_LINKS_API_KEY` default exactly.
 * Override via `E2E_INTERNAL_LINKS_API_KEY` if the stack under test was
 * started with a different value.
 */
export const INTERNAL_LINKS_API_KEY =
  process.env["E2E_INTERNAL_LINKS_API_KEY"] ?? "local-dev-internal-links-key";

export interface IssuedLink {
  accessLinkId: string;
  expiresAt: string;
  /** The opaque token this suite extracts from the (stub-delivered) link URL — see `issueLink`'s doc comment. */
  token: string;
}

/**
 * Calls `POST /internal/links` (task 5.2) the same way an internal
 * reservation-management system would. The stub `LinkDeliveryPort`
 * (design Decision 6) never sends a real email/SMS/WhatsApp message, and
 * `bff-api` does not echo the link URL back to the caller
 * (`services/bff/src/modules/trip-access/http.ts` returns only
 * `accessLinkId`/`expiresAt`; the token itself is never returned by design,
 * since the route's job is to hand it to the delivery channel, not the caller).
 *
 * BLOCKED (see `docs/device-spike.md` / apply-progress WU24 "Deviations"):
 * `POST /internal/links`'s response does NOT include the raw token or the
 * resulting `linkUrl` in its JSON body — only `{ accessLinkId, expiresAt }`
 * (confirmed by reading `services/bff/src/modules/trip-access/http.ts` and
 * `issue-link.ts`: the token is generated, hashed for storage, and handed
 * to `LinkDeliveryPort.deliver()`, never returned to the internal caller).
 * The `PaymentGatewayStub` pattern (`buildWebhookRequest`) shows this
 * codebase DOES use test-only inspection seams elsewhere, but `LinkDeliveryPort`'s
 * stub adapter has no equivalent "list what I delivered" inspection method
 * today. Until one exists, this suite cannot obtain a real token through
 * the same black-box HTTP surface a deployed stack exposes. `issueLink`
 * below documents the exact, minimal fix needed (a stub-only `GET
 * /internal/links/:id/delivered` or an inspectable `LinkDeliveryStub`) and
 * throws instead of fabricating a token, so a caller gets a clear failure
 * rather than a false pass.
 */
export async function issueLink(
  request: APIRequestContext,
  input: {
    reservationRef: string;
    contact: { kind: "email" | "sms" | "whatsapp"; address: string };
    locale: "es" | "en" | "pt";
  },
): Promise<IssuedLink> {
  const response = await request.post(`${API_BASE_URL}/internal/links`, {
    headers: {
      authorization: `Bearer ${INTERNAL_LINKS_API_KEY}`,
      "content-type": "application/json",
    },
    data: input,
  });

  if (!response.ok()) {
    throw new Error(
      `POST /internal/links failed: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { accessLinkId: string; expiresAt: string };

  throw new Error(
    "issueLink: bff-api's POST /internal/links response " +
      `(${JSON.stringify(body)}) does not expose the issued token or link URL. ` +
      "This is a real, pre-existing gap (see this file's doc comment and " +
      "sdd/travel-hub-mvp/apply-progress WU24): the stub LinkDeliveryPort " +
      "has no inspection seam a black-box E2E caller can use. Add one " +
      "(e.g. a stub-only GET /internal/links/:id/delivered route, or an " +
      "inspectable createLinkDeliveryStub().deliveries[] exposed over a " +
      "dev-only endpoint) before this helper — and every scenario that " +
      "depends on it — can run for real.",
  );
}

/** Polls `GET {API_BASE_URL}/healthz` until it responds 200 or the timeout elapses. */
export async function waitForApiHealthy(
  request: APIRequestContext,
  timeoutMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const response = await request.get(`${API_BASE_URL}/healthz`);
      if (response.ok()) return;
    } catch {
      // Connection refused while the stack is still booting — keep polling.
    }
    if (Date.now() > deadline) {
      throw new Error(`bff-api did not become healthy within ${timeoutMs}ms at ${API_BASE_URL}/healthz`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
