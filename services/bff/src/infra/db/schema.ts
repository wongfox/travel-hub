import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Foundational app-owned schema (design Data Model, task 3.3 scope only —
 * `wifi_package`/`wifi_order`/`precheckin_submission`/`push_subscription`/
 * `notification`/`pulse_response`/`staff_alert`/`content_cache`/
 * `analytics_event` and pg-boss's own schema land with their owning
 * capability's work unit). All tables are keyed off SIR's `reservation_ref`
 * + `passenger_ref` (SIR remains the source of truth — see design's Data
 * Model section); nothing here duplicates SIR data long-term.
 */

export const consentPurpose = pgEnum("consent_purpose", [
  "analytics",
  "push",
  "pulse",
  "precheckin_biometric",
]);

export const accessLink = pgTable("access_link", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  reservationRef: text("reservation_ref").notNull(),
  /** Empty array means "all passengers on the reservation" per the design. */
  passengerScope: text("passenger_scope").array().notNull().default([]),
  localeHint: text("locale_hint"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  supersededBy: uuid("superseded_by").references((): AnyPgColumn => accessLink.id),
  issueChannel: text("issue_channel").notNull(),
});

export const session = pgTable("session", {
  idHash: text("id_hash").primaryKey(),
  linkId: uuid("link_id")
    .notNull()
    .references(() => accessLink.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  locale: text("locale").notNull(),
  userAgentClass: text("user_agent_class"),
});

/**
 * Append-only consent log shared by `bff-api` and `bff-worker`. `link_id` is
 * the issuing access link's id kept as an audit reference WITHOUT a foreign
 * key: access links/sessions are still process-local in-memory stores, so no
 * `access_link` row exists to reference (the FK from task 3.3 was dropped when
 * the Postgres `ConsentStore` landed). `seq` is the total order "latest wins"
 * resolves by (`recorded_at` ties inside one clock tick).
 */
export const consentRecord = pgTable(
  "consent_record",
  {
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    id: uuid("id").primaryKey().defaultRandom(),
    linkId: uuid("link_id").notNull(),
    reservationRef: text("reservation_ref").notNull(),
    passengerRef: text("passenger_ref"),
    purpose: consentPurpose("purpose").notNull(),
    textVersion: text("text_version").notNull(),
    granted: boolean("granted").notNull(),
    /** Append-only: withdrawal is a new row with granted=false, not an update. */
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("consent_record_latest_idx").on(table.reservationRef, table.purpose, table.seq)],
);

export const featureFlag = pgTable("feature_flag", {
  key: text("key").primaryKey(),
  value: boolean("value").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Append-only audit log of every unwrap/handoff/purge of personal data, shared
 * by `bff-api` (consent-withdrawal cascade) and `bff-worker` (pre check-in,
 * push-subscription and pulse purge jobs). `seq` is the total order (`at` ties
 * inside one clock tick); a trigger (migration 0004) makes Postgres itself
 * reject UPDATE/DELETE, so append-only does not depend on the adapter alone.
 */
export const piiAccessAudit = pgTable(
  "pii_access_audit",
  {
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    id: uuid("id").primaryKey().defaultRandom(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("pii_access_audit_subject_idx").on(table.subjectType, table.subjectId, table.seq)],
);

/** Mirrors `WifiOrderStatusSchema` (contracts/src/wifi.ts); a closed set, so an enum like `consent_purpose`. */
export const wifiOrderStatus = pgEnum("wifi_order_status", [
  "CREATED",
  "PAYMENT_PENDING",
  "PAID",
  "ENTITLEMENT_ACTIVE",
  "PAYMENT_FAILED",
  "REFUND_PENDING",
  "REFUNDED",
]);

/**
 * `wifi_order` (design Data Model, task 10.1/10.3): shared by `bff-api` and
 * `bff-worker`. `idempotency_key` is unique (create() is idempotent per key);
 * `status` is indexed for the worker scans (`listByStatus`).
 */
export const wifiOrder = pgTable(
  "wifi_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reservationRef: text("reservation_ref").notNull(),
    passengerRef: text("passenger_ref").notNull(),
    packageId: text("package_id").notNull(),
    legRef: text("leg_ref").notNull().default(""),
    buyerEmail: text("buyer_email").notNull().default(""),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    status: wifiOrderStatus("status").notNull().default("CREATED"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    gatewaySessionRef: text("gateway_session_ref"),
    gatewayPaymentRef: text("gateway_payment_ref"),
    entitlementRef: text("entitlement_ref"),
    entitlementExpiresAt: timestamp("entitlement_expires_at", { withTimezone: true }),
    sirRegisteredAt: timestamp("sir_registered_at", { withTimezone: true }),
    sirSaleRef: text("sir_sale_ref"),
    sirRegistrationAttempts: integer("sir_registration_attempts").notNull().default(0),
    sirReconciliationRequired: boolean("sir_reconciliation_required").notNull().default(false),
    receiptIssuedAt: timestamp("receipt_issued_at", { withTimezone: true }),
    receiptRef: text("receipt_ref"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("wifi_order_status_idx").on(table.status)],
);

/** `wifi_order_event`: append-only audit trail of every `wifi_order` transition (`seq` gives a stable transition order). */
export const wifiOrderEvent = pgTable(
  "wifi_order_event",
  {
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => wifiOrder.id),
    fromStatus: wifiOrderStatus("from_status").notNull(),
    toStatus: wifiOrderStatus("to_status").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("wifi_order_event_order_id_idx").on(table.orderId, table.seq)],
);

/**
 * `analytics_event` (design Data Model, task 12.1): shared by `bff-api`
 * (writes) and `bff-worker` (forward job). Stores ONLY the pseudonymous
 * `trip_hash` (HMAC of the reservation reference) - there is deliberately no
 * reservation/passenger column, so a raw reference cannot be persisted.
 * `seq` is the insertion order; `forwarded_at` null = pending forward.
 */
export const analyticsEvent = pgTable(
  "analytics_event",
  {
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    id: uuid("id").primaryKey().defaultRandom(),
    tripHash: text("trip_hash").notNull(),
    name: text("name").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    props: jsonb("props").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
  },
  (table) => [
    index("analytics_event_pending_idx").on(table.seq).where(sql`${table.forwardedAt} is null`),
    index("analytics_event_trip_hash_idx").on(table.tripHash),
  ],
);

/**
 * `push_subscription` (design Data Model, task 11.1): written by `bff-api`
 * (subscribe, consent-withdrawal and link-reissue deletes), read/purged by
 * `bff-worker` (journey fan-out, retention purge). `link_id` and
 * `consent_record_id` are uuid audit references WITHOUT foreign keys: access
 * links are still process-local in-memory stores, so an FK to `access_link`
 * would reject every insert (same reason as `consent_record.link_id`).
 * `endpoint`/`p256dh`/`auth` are push secrets: stored as given, never logged.
 * `seq` is the insertion order; `expires_at` (= link expiry) drives the purge.
 */
export const pushSubscription = pgTable(
  "push_subscription",
  {
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity(),
    id: uuid("id").primaryKey().defaultRandom(),
    linkId: uuid("link_id").notNull(),
    reservationRef: text("reservation_ref").notNull(),
    /** Empty array means "all passengers on the reservation". */
    passengerScope: text("passenger_scope").array().notNull().default([]),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    locale: text("locale").notNull(),
    consentRecordId: uuid("consent_record_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("push_subscription_reservation_idx").on(table.reservationRef),
    index("push_subscription_link_idx").on(table.linkId),
    index("push_subscription_expires_at_idx").on(table.expiresAt),
  ],
);
