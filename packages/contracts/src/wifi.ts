import { z } from "zod";

export const CurrencySchema = z.enum(["PEN", "USD"]);
export type Currency = z.infer<typeof CurrencySchema>;

/**
 * `GET /api/wifi/packages` catalog entry. `name` is already resolved to the
 * requesting passenger's locale server-side (source `wifi_package.names`).
 */
export const WifiPackageDTOSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  priceMinor: z.number().int().nonnegative(),
  currency: CurrencySchema,
  durationMinutes: z.number().int().positive(),
});
export type WifiPackageDTO = z.infer<typeof WifiPackageDTOSchema>;

/**
 * WiFi order saga states (design Decision 8):
 * `CREATED -> PAYMENT_PENDING -> PAID -> ENTITLEMENT_ACTIVE`, with failure
 * states `PAYMENT_FAILED`, `REFUND_PENDING -> REFUNDED`. SIR registration
 * and e-receipt issuance are tracked as independent flags on the order, not
 * as saga states, because they are retried asynchronously after
 * `ENTITLEMENT_ACTIVE` and must not block or reorder it.
 */
export const WifiOrderStatusSchema = z.enum([
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "ENTITLEMENT_ACTIVE",
  "PAYMENT_FAILED",
  "REFUND_PENDING",
  "REFUNDED",
]);
export type WifiOrderStatus = z.infer<typeof WifiOrderStatusSchema>;

/**
 * `GET /api/wifi/orders/:id` status-polling response.
 */
export const WifiOrderDTOSchema = z.object({
  id: z.string().min(1),
  packageId: z.string().min(1),
  status: WifiOrderStatusSchema,
  amountMinor: z.number().int().nonnegative(),
  currency: CurrencySchema,
  sirRegistered: z.boolean(),
  receiptIssued: z.boolean(),
  entitlementRef: z.string().min(1).nullable(),
  entitlementExpiresAt: z.string().min(1).nullable(),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
export type WifiOrderDTO = z.infer<typeof WifiOrderDTOSchema>;

/**
 * `POST /api/wifi/orders` request body. `Idempotency-Key` travels as an HTTP
 * header (see design-interfaces HTTP surface), not as part of this body.
 */
export const CreateWifiOrderRequestSchema = z.object({
  packageId: z.string().min(1),
});
export type CreateWifiOrderRequest = z.infer<typeof CreateWifiOrderRequestSchema>;

/**
 * The normalized event `PaymentGatewayPort.parseWebhook` returns once the
 * raw webhook body's signature has been verified.
 */
export const PaymentEventTypeSchema = z.enum([
  "payment_succeeded",
  "payment_failed",
  "refund_completed",
]);
export type PaymentEventType = z.infer<typeof PaymentEventTypeSchema>;

export const PaymentEventSchema = z.object({
  type: PaymentEventTypeSchema,
  providerRef: z.string().min(1),
  orderIdempotencyKey: z.string().min(1).nullable(),
  amountMinor: z.number().int().nonnegative(),
  currency: CurrencySchema,
  occurredAt: z.string().min(1),
});
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;
