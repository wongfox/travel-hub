import { z } from "zod";
import { LocaleSchema } from "contracts";
import type { FastifyInstance } from "fastify";
import { issueAccessLink, type IssueLinkDeps } from "./issue-link.js";

const ContactChannelSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("email"), address: z.string().min(1) }),
  z.object({ kind: z.literal("sms"), address: z.string().min(1) }),
  z.object({ kind: z.literal("whatsapp"), address: z.string().min(1) }),
]);

const IssueLinkRequestSchema = z.object({
  reservationRef: z.string().min(1),
  passengerScope: z.array(z.string().min(1)).optional(),
  contact: ContactChannelSchema,
  locale: LocaleSchema,
});

export interface TripAccessRouteDeps extends IssueLinkDeps {
  /**
   * Shared-secret service credential checked against the `Authorization:
   * Bearer <key>` header. Design-interfaces documents this route as
   * "service-authenticated (mTLS or signed service token), not
   * internet-exposed via CDN" without picking one mechanism; this is the
   * signed-service-token half of that (mTLS/network isolation is an infra
   * concern for the CDN/ALB layer, task 13.2's scope, not this app route).
   */
  internalApiKey: string;
}

/**
 * Registers `POST /internal/links` (design-interfaces, task 5.2): issues a
 * personalized, reservation-scoped access link for the transactional
 * system to send. Never exposed to the passenger-facing web app.
 */
export function registerTripAccessRoutes(app: FastifyInstance, deps: TripAccessRouteDeps): void {
  app.post("/internal/links", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader !== `Bearer ${deps.internalApiKey}`) {
      return reply.code(401).send({ code: "unauthorized", requestId: request.id });
    }

    const parsed = IssueLinkRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "invalid_request", requestId: request.id });
    }

    const { passengerScope, ...rest } = parsed.data;
    const result = await issueAccessLink(
      { ...rest, ...(passengerScope !== undefined ? { passengerScope } : {}) },
      deps,
    );
    return reply.code(201).send(result);
  });
}
