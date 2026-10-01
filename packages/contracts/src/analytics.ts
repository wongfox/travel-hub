import { z } from "zod";

/**
 * `usage-analytics` event names (design-interfaces `AnalyticsSinkPort`,
 * spec's named funnel/event coverage — tasks 12.1-12.2). A closed enum
 * (rather than an open string) so a typo in a call site fails validation
 * instead of silently creating an unrecognized event name no KPI mapping
 * will ever match.
 */
export const AnalyticsEventNameSchema = z.enum([
  // Navigation and interaction tracking (spec's generic requirement).
  "screen_view",
  // WiFi purchase funnel (spec's five named steps).
  "wifi_offer_viewed",
  "wifi_package_selected",
  "wifi_payment_attempted",
  "wifi_payment_succeeded",
  "wifi_payment_failed",
  "wifi_entitlement_activated",
  // complementary-services-redirect click-out.
  "tfe_click_out",
  // push-notifications opt-in.
  "push_opt_in",
  // experience-pulse response + D4a dispatch.
  "pulse_response_submitted",
  "pulse_alert_dispatched",
]);
export type AnalyticsEventName = z.infer<typeof AnalyticsEventNameSchema>;

/**
 * `props`' own enforcement of the "no PII" rule below: values are restricted
 * to short primitives (never nested objects/arrays, where PII could hide
 * from any shape-level check) and key names resembling a PII field are
 * rejected outright — a real technical control, not just a doc comment the
 * client is trusted to honor.
 */
const ANALYTICS_PROP_VALUE_MAX_LENGTH = 200;
const DISALLOWED_PROP_KEY_PATTERN = /reservation|passenger|email|phone|document|dni|passport|^name$/i;

const AnalyticsPropValueSchema = z.union([z.string().max(ANALYTICS_PROP_VALUE_MAX_LENGTH), z.number(), z.boolean()]);

/**
 * One event as submitted by a client (web `shared/analytics` queue, task
 * 12.1). `occurredAt` is client-supplied (the moment the interaction
 * happened, which may predate the network call when the queue was offline);
 * the server never trusts it for anything beyond display/ordering — no
 * authorization decision depends on it. `props` carries non-PII event
 * context only (e.g. package id, placement): `trip_hash` pseudonymization
 * only replaces the reservation reference itself, never arbitrary prop
 * content, so this schema itself rejects PII-shaped keys and restricts
 * every value to a short primitive.
 */
export const AnalyticsEventSchema = z.object({
  name: AnalyticsEventNameSchema,
  occurredAt: z.string().min(1).optional(),
  props: z
    .record(z.string(), AnalyticsPropValueSchema)
    .refine((props) => Object.keys(props).every((key) => !DISALLOWED_PROP_KEY_PATTERN.test(key)), {
      message: "props keys must not resemble a PII field (reservation/passenger/email/phone/document/name)",
    })
    .optional(),
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

/**
 * `POST /api/events` request body (task 12.1): a batch, so the
 * `sendBeacon`-compatible client can flush its whole offline queue in one
 * call. Bounded to a sane batch size — this is a passenger-facing endpoint,
 * not a bulk-import API.
 */
export const SendAnalyticsEventsRequestSchema = z.object({
  events: z.array(AnalyticsEventSchema).min(1).max(50),
});
export type SendAnalyticsEventsRequest = z.infer<typeof SendAnalyticsEventsRequestSchema>;
