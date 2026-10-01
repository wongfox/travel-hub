import type { AlertType, Locale } from "contracts";

/**
 * `push-notifications` domain types + ports (design-interfaces, design
 * Decision 11, tasks 11.1-11.2).
 */

/** Persisted shape of one `push_subscription` row (design Data Model). */
export interface PushSubscriptionRecord {
  id: string;
  /** The `access_link` this subscription is bound to (design Decision 11: "subscriptions bound to access_link + passenger scope"). */
  linkId: string;
  reservationRef: string;
  /** Mirrors the owning `access_link.passenger_scope` at creation time; empty means "all passengers on the reservation". */
  passengerScope: string[];
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: Locale;
  consentRecordId: string;
  createdAt: string;
  /** `= access_link.expires_at` at creation time (design Decision 11: "expires_at = link expiry"), so the subscription naturally expires with the trip without a separate computation. */
  expiresAt: string;
}

export interface CreatePushSubscriptionInput {
  linkId: string;
  reservationRef: string;
  passengerScope: string[];
  endpoint: string;
  p256dh: string;
  auth: string;
  locale: Locale;
  consentRecordId: string;
  expiresAt: string;
}

export interface PushSubscriptionStore {
  create(input: CreatePushSubscriptionInput): Promise<PushSubscriptionRecord>;
  findById(id: string): Promise<PushSubscriptionRecord | null>;
  /** Every subscription currently bound to one reservation (task 11.2's push fan-out). */
  findActiveByReservation(reservationRef: string): Promise<PushSubscriptionRecord[]>;
  deleteById(id: string): Promise<void>;
  /**
   * Deletes every subscription bound to one `access_link` (task 11.1's
   * reissue-invalidation acceptance: "reissuing a link invalidates the prior
   * subscription and requires a fresh opt-in"). Called by `reissueAccessLink`
   * for every link it revokes.
   */
  deleteByLinkId(linkId: string): Promise<void>;
  /**
   * Deletes every subscription bound to one reservation (task 12.3's
   * consent-withdrawal cascade: withdrawing `push` consent deletes the
   * subscription immediately — reservation-scoped, not link-scoped, since
   * consent itself is recorded at reservation scope, not per-link).
   */
  deleteByReservation(reservationRef: string): Promise<void>;
  /** Every subscription whose `expiresAt` has already passed (task 12.3's retention/purge scheduler scan). */
  listExpired(now: Date): Promise<PushSubscriptionRecord[]>;
}

/**
 * `send`'s `type` field accepts either a journey `AlertType` (routed through
 * `dispatchJourneyEvents`'s `AlertSourcePolicy`/dedupe pipeline) or
 * `"PULSE_PROMPT"` (task 11.6: `experience-pulse`'s own independent push
 * path, deliberately never routed through that pipeline or
 * `NotificationStore`'s `dedupe_key`). Additive, backward-compatible widening
 * of the original `AlertType`-only signature.
 */
export type PushPayloadType = AlertType | "PULSE_PROMPT";

/** `WebPushPort` per `sdd/travel-hub-mvp/design-interfaces`. */
export interface WebPushPort {
  send(
    subscription: PushSubscriptionRecord,
    payload: { type: PushPayloadType; titleKey: string; bodyKey: string; url: string; locale: Locale },
  ): Promise<"sent" | "gone" | "failed">;
}

/**
 * One journey event a `JourneyEventSourcePort` adapter reports (design Data
 * Flow: "Worker poll JourneyEventSourcePort -> AlertSourcePolicy ->
 * notification"). `sourceEventId` is whatever the adapter's own upstream
 * system uses to identify this exact occurrence — stable across repeated
 * polls of the same underlying event, so `dedupeKey` built from it is stable
 * too.
 */
export interface JourneyEvent {
  reservationRef: string;
  legRef: string;
  type: AlertType;
  sourceEventId: string;
  occurredAt: string;
}

/** `JourneyEventSourcePort` per `sdd/travel-hub-mvp/design-interfaces`. */
export interface JourneyEventSourcePort {
  pollActive(window: { from: Date; to: Date }): Promise<JourneyEvent[]>;
}

export type NotificationChannel = "banner" | "push";
export type NotificationStatus = "pending" | "sent" | "failed" | "skipped_policy";

/** Persisted shape of one `notification` row (design Data Model): `dedupeKey` carries the schema's `unique` constraint. */
export interface NotificationRecord {
  id: string;
  reservationRef: string;
  alertType: AlertType;
  sourceEventId: string;
  channel: NotificationChannel;
  dedupeKey: string;
  status: NotificationStatus;
  attempts: number;
  sentAt: string | null;
  createdAt: string;
}

export interface CreateNotificationInput {
  reservationRef: string;
  alertType: AlertType;
  sourceEventId: string;
  channel: NotificationChannel;
  dedupeKey: string;
  status: NotificationStatus;
}

/** Thrown by `NotificationStore.create` when `dedupeKey` already has a row (design Decision 11: "dedupe_key enforced by a unique index"). */
export class DuplicateNotificationError extends Error {
  public readonly dedupeKey: string;

  constructor(dedupeKey: string) {
    super(`A notification with dedupeKey "${dedupeKey}" already exists`);
    this.name = "DuplicateNotificationError";
    this.dedupeKey = dedupeKey;
  }
}

export interface NotificationStore {
  /** Throws `DuplicateNotificationError` if `input.dedupeKey` already has a row — never silently overwrites or returns the existing row. */
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  findByDedupeKey(dedupeKey: string): Promise<NotificationRecord | null>;
  updateStatus(id: string, status: NotificationStatus, sentAt?: string): Promise<void>;
}
