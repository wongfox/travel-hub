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

/**
 * `WifiEntitlementPort` per `sdd/travel-hub-mvp/design-interfaces` (design
 * Decision 9): `grant` registers the entitlement server-to-server with the
 * captive-portal system; `buildRedemption` returns the URL/code the PWA
 * presents on the train network; `status`/`revoke` round out the lifecycle.
 * Task 10.3's entitlement-first activation calls only `grant` — the first
 * step after `PAID`, strictly before SIR registration/e-receipt issuance are
 * even attempted (design Decision 8).
 */
export interface WifiEntitlementPort {
  /** MUST be idempotent per `orderId` (task 10.3): a retried activation attempt for an already-granted order returns the same `entitlementRef`, never a second grant. */
  grant(input: {
    orderId: string;
    packageCode: string;
    durationMinutes: number;
    legRef: string;
  }): Promise<{ entitlementRef: string }>;
  buildRedemption(entitlementRef: string): Promise<{ kind: "url" | "code"; value: string; expiresAt: string }>;
  status(
    entitlementRef: string,
  ): Promise<{ state: "granted" | "active" | "expired" | "revoked"; remainingMinutes?: number }>;
  revoke(entitlementRef: string): Promise<void>;
}

/**
 * `EReceiptPort` per `sdd/travel-hub-mvp/design-interfaces`: issues and
 * emails the boleta electrónica for a completed WiFi sale. One of the two
 * independently retried post-activation steps (design Decision 8).
 */
export interface EReceiptPort {
  /** MUST be idempotent per `idempotencyKey` (task 10.3), same convention as `PaymentGatewayPort.refund`: a retried issuance for the same key returns the same `receiptRef`, never a second receipt. */
  issue(input: {
    orderId: string;
    buyerEmail: string;
    lines: { description: string; amountMinor: number }[];
    currency: Currency;
    idempotencyKey: string;
  }): Promise<{ receiptRef: string }>;
}

/** Persisted shape of one `wifi_order` row (design Data Model), extended in task 10.3 with the entitlement/SIR/receipt fields the activation jobs read and write. */
export interface WifiOrderRecord {
  id: string;
  reservationRef: string;
  passengerRef: string;
  packageId: string;
  /**
   * The leg this WiFi entitlement applies to (`WifiEntitlementPort.grant`'s
   * `legRef`). Resolved at order-creation time from the same next-milestone
   * leg already used for tier/package resolution (task 10.1); a narrowly
   * scoped resolution since design-interfaces does not otherwise say which
   * leg a multi-leg reservation's WiFi purchase binds to. Empty string when
   * unresolved (e.g. existing tests that never supplied one).
   */
  legRef: string;
  /** The passenger's contact email, resolved from `SirReservation.contact` at order-creation time when it is an email channel (`EReceiptPort.issue`'s `buyerEmail`, task 10.3); empty string when the contact on file is not an email channel or was not supplied. */
  buyerEmail: string;
  amountMinor: number;
  currency: Currency;
  status: WifiOrderStatus;
  idempotencyKey: string;
  gatewaySessionRef: string | null;
  gatewayPaymentRef: string | null;
  /** Set once `WifiEntitlementPort.grant` succeeds (task 10.3's entitlement-first activation). */
  entitlementRef: string | null;
  entitlementExpiresAt: string | null;
  /** Set once `SirPosPort.registerSale` succeeds; an independent flag per design Decision 8, never blocking `ENTITLEMENT_ACTIVE`. */
  sirRegisteredAt: string | null;
  sirSaleRef: string | null;
  /**
   * Count of failed `SirPosPort.registerSale` attempts so far (task 10.3's
   * retry-exhaustion-to-reconciliation rule). The SIR-registration job scans
   * all eligible orders per invocation and catches each order's failure
   * independently (same "one failure never blocks another" convention as
   * `runHandoffJob`), so a per-item retry count cannot be read off the
   * queue's own `QueueRetryPolicy` the way a one-job-per-order queue could —
   * this field is the documented, honest substitute (same "in-memory
   * simplification, documented" precedent as WU14-18's deferred migrations).
   */
  sirRegistrationAttempts: number;
  /**
   * Set once `sirRegistrationAttempts` exceeds `SIR_REGISTRATION_RETRY_LIMIT`
   * (task 10.3's acceptance criterion): the order lands in reconciliation,
   * never triggers a refund from the SIR job itself, and is excluded from
   * further automatic registration attempts until a human resolves it.
   */
  sirReconciliationRequired: boolean;
  /** Set once `EReceiptPort.issue` succeeds; independent of SIR registration, same convention. */
  receiptIssuedAt: string | null;
  receiptRef: string | null;
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
  /** Defaults to `""` when omitted (existing WU18 call sites/tests predate this field). */
  legRef?: string;
  /** Defaults to `""` when omitted (existing WU18 call sites/tests predate this field). */
  buyerEmail?: string;
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
  /**
   * Transitions `id` from its current status to `toStatus`, applies `patch`,
   * and appends one `wifi_order_event` row. `toStatus` MAY equal the current
   * status (task 10.3's SIR-registration/e-receipt steps record progress —
   * `sirRegisteredAt`, `receiptIssuedAt` — without a saga state change, per
   * design Decision 8's "independent flags" rule); the event row still
   * records that attempt for audit purposes. Throws `WifiOrderNotFoundError`
   * if `id` is unknown.
   */
  transition(
    id: string,
    toStatus: WifiOrderStatus,
    patch: Partial<
      Pick<
        WifiOrderRecord,
        | "gatewaySessionRef"
        | "gatewayPaymentRef"
        | "entitlementRef"
        | "entitlementExpiresAt"
        | "sirRegisteredAt"
        | "sirSaleRef"
        | "sirRegistrationAttempts"
        | "sirReconciliationRequired"
        | "receiptIssuedAt"
        | "receiptRef"
      >
    >,
  ): Promise<WifiOrderRecord>;
  /** Every event recorded for `id`, in transition order; test/audit introspection. */
  listEventsForOrder(id: string): Promise<WifiOrderEventRecord[]>;
  /** Every order currently in `status`; the activation/SIR-registration/e-receipt-issuance jobs' (task 10.3) input set. */
  listByStatus(status: WifiOrderStatus): Promise<WifiOrderRecord[]>;
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
