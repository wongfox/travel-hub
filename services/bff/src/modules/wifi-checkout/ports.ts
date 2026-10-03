import type { Currency, Locale, PaymentEvent, ServiceTier, WifiOrderStatus } from "contracts";

/**
 * `wifi-package-checkout` saga core (task 10.1, design Decision 8):
 * `CREATED -> PAYMENT_PENDING -> PAID -> ENTITLEMENT_ACTIVE`, failure states
 * `PAYMENT_FAILED`, `REFUND_PENDING -> REFUNDED` (`WifiOrderStatus`,
 * `contracts/src/wifi.ts`). This work unit (tasks 10.1-10.2) only drives the
 * saga up to `PAID`/`PAYMENT_FAILED` — entitlement activation, SIR sale
 * registration and e-receipt issuance are WU19's scope (tasks 10.3-10.5);
 * nothing in this module ever produces `ENTITLEMENT_ACTIVE`,
 * `REFUND_PENDING` or `REFUNDED` yet.
 */

/**
 * `PaymentGatewayPort` per `sdd/travel-hub-mvp/design-interfaces`. The
 * gateway webhook is authoritative for `PAID` (design Decision 8): the
 * return URL only triggers a status poll, never a direct state transition.
 */
export interface PaymentGatewayPort {
  createHostedSession(input: {
    orderId: string;
    amountMinor: number;
    currency: Currency;
    returnUrl: string;
    locale: Locale;
    idempotencyKey: string;
  }): Promise<{ sessionRef: string; redirectUrl: string }>;
  /** Verifies the raw body's signature against `headers` and parses the event; throws `InvalidWebhookSignatureError` (errors.ts) otherwise. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<PaymentEvent>;
  refund(paymentRef: string, amountMinor: number, idempotencyKey: string): Promise<{ refundRef: string }>;
}

/** Persisted shape of one `wifi_order` row (design Data Model), simplified for the in-memory port — only the fields tasks 10.1-10.2 read or write. */
export interface WifiOrderRecord {
  id: string;
  reservationRef: string;
  passengerRef: string;
  packageId: string;
  amountMinor: number;
  currency: Currency;
  status: WifiOrderStatus;
  idempotencyKey: string;
  gatewaySessionRef: string | null;
  gatewayPaymentRef: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWifiOrderRecordInput {
  reservationRef: string;
  passengerRef: string;
  packageId: string;
  amountMinor: number;
  currency: Currency;
  idempotencyKey: string;
}

/** One `wifi_order_event` row (design Data Model): an audit trail of every status transition. */
export interface WifiOrderEventRecord {
  id: string;
  orderId: string;
  fromStatus: WifiOrderStatus;
  toStatus: WifiOrderStatus;
  detail: Record<string, unknown>;
  at: string;
}

/**
 * Same in-memory-port convention as `PrecheckinSubmissionStore`/
 * `ContentCache` (WU14-17): unit-testable deterministically without a live
 * Postgres. A Drizzle-backed adapter over `wifi_order`/`wifi_order_event`
 * lands once a consumer needs it against a live database, per this
 * codebase's established precedent for every capability-owned table since
 * task 8.3.
 */
export interface WifiOrderStore {
  findByIdempotencyKey(idempotencyKey: string): Promise<WifiOrderRecord | null>;
  findById(id: string): Promise<WifiOrderRecord | null>;
  /**
   * Persists a new order with `status: "CREATED"`, unless `idempotencyKey`
   * already has one — the design's `wifi_order.idempotency_key unique`
   * column: a second `create()` for the same key returns the existing order
   * instead of creating a duplicate row (task 10.1's acceptance criterion).
   */
  create(input: CreateWifiOrderRecordInput): Promise<WifiOrderRecord>;
  /** Transitions `id` from its current status to `toStatus`, applies `patch`, and appends one `wifi_order_event` row. Throws `WifiOrderNotFoundError` if `id` is unknown. */
  transition(
    id: string,
    toStatus: WifiOrderStatus,
    patch: Partial<Pick<WifiOrderRecord, "gatewaySessionRef" | "gatewayPaymentRef">>,
  ): Promise<WifiOrderRecord>;
  /** Every event recorded for `id`, in transition order; test/audit introspection. */
  listEventsForOrder(id: string): Promise<WifiOrderEventRecord[]>;
}

/**
 * Configuration data (design Decision 8: "Packages are configuration data —
 * prices PEN/USD, duration, localized names, tier rules"). Pricing/currency
 * selection and the exact tier-rule semantics (e.g. a zero-amount First
 * Class entitlement) are open items per the design; this port only exposes
 * whatever a concrete adapter resolves.
 */
export interface WifiPackageRecord {
  id: string;
  code: string;
  /** Localized commercial names; resolved against the session's locale with `es` fallback, same as `ContentPort`. */
  names: Partial<Record<Locale, string>>;
  priceMinor: number;
  currency: Currency;
  durationMinutes: number;
  /** Tiers this package is offered to; omitted/undefined means every tier. */
  tierRules?: ServiceTier[];
}

export interface WifiPackageStore {
  listActive(): Promise<WifiPackageRecord[]>;
  findById(id: string): Promise<WifiPackageRecord | null>;
}
