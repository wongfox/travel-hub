import { z } from "zod";
import { LocaleSchema } from "./locale.js";
import { AlertTypeSchema } from "./trip.js";

/**
 * `POST /api/push/subscriptions` request body — the standard Web Push
 * subscription shape (`PushSubscriptionJSON`), plus the passenger's locale
 * so notification text can be localized without a lookup.
 */
export const PushSubscriptionRequestSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  locale: LocaleSchema,
});
export type PushSubscriptionRequest = z.infer<typeof PushSubscriptionRequestSchema>;

/**
 * The payload passed to `WebPushPort.send` (design-interfaces).
 */
export const WebPushPayloadSchema = z.object({
  type: AlertTypeSchema,
  titleKey: z.string().min(1),
  bodyKey: z.string().min(1),
  url: z.string().min(1),
  locale: LocaleSchema,
});
export type WebPushPayload = z.infer<typeof WebPushPayloadSchema>;

/**
 * Design Decision 11's `AlertSourcePolicy`: for each alert type, whether
 * push is the official source (banner is always sent regardless, so it is
 * not modeled here as a channel toggle).
 */
export const AlertSourcePolicySchema = z.record(
  AlertTypeSchema,
  z.object({ pushIsOfficialSource: z.boolean() }),
);
export type AlertSourcePolicy = z.infer<typeof AlertSourcePolicySchema>;
