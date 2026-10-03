import type { InProcessStack } from "../harness/in-process-stack.js";

export interface IssuedLink {
  accessLinkId: string;
  expiresAt: string;
  /** The opaque token, read from the stub `LinkDeliveryPort`'s in-process delivery record. */
  token: string;
}

/**
 * Issues a link exactly like an internal reservation-management system would
 * (`POST /internal/links`, service-authenticated), then reads the token from
 * the stub `LinkDeliveryPort`'s `deliveries[]` — an in-memory seam on an
 * adapter instance the harness itself injected into the in-process BFF.
 *
 * No HTTP route exposes tokens: the route's response stays
 * `{ accessLinkId, expiresAt }` and `/internal/*` is not reachable through the
 * web origin. The internal call goes straight into the in-process app.
 */
export async function issueLink(
  stack: InProcessStack,
  input: {
    reservationRef: string;
    contact: { kind: "email" | "sms" | "whatsapp"; address: string };
    locale: "es" | "en" | "pt";
  },
): Promise<IssuedLink> {
  const before = stack.linkDelivery.deliveries.length;

  const response = await stack.inject({
    method: "POST",
    url: "/internal/links",
    headers: {
      authorization: `Bearer ${stack.internalApiKey}`,
      "content-type": "application/json",
    },
    payload: input,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`POST /internal/links failed: ${response.statusCode} ${response.body}`);
  }
  const body = response.json<{ accessLinkId: string; expiresAt: string }>();

  const delivery = stack.linkDelivery.deliveries
    .slice(before)
    .find((d) => d.to.address === input.contact.address);
  if (!delivery) {
    throw new Error(
      `issueLink: the stub LinkDeliveryPort recorded no new delivery for ${input.contact.address} ` +
        `(deliveries before=${before}, after=${stack.linkDelivery.deliveries.length}).`,
    );
  }
  const token = new URL(delivery.linkUrl).hash.replace(/^#/, "");
  if (!token) {
    throw new Error("issueLink: the delivered link URL carries no token fragment.");
  }
  return { ...body, token };
}
