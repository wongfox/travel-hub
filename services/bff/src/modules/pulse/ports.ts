import type { Locale, StaffAlertPayload } from "contracts";

/**
 * `experience-pulse` domain types + ports (design-interfaces, design
 * Decision 12, tasks 11.4-11.5).
 */

/** Persisted shape of one `pulse_response` row (design Data Model). */
export interface PulseResponseRecord {
  id: string;
  reservationRef: string;
  passengerRef: string;
  legRef: string;
  score: number;
  locale: Locale;
  answeredAt: string;
}

export interface CreatePulseResponseInput {
  reservationRef: string;
  passengerRef: string;
  legRef: string;
  score: number;
  locale: Locale;
}

/**
 * Thrown by `PulseResponseStore.create` when a response already exists for
 * `(reservationRef, passengerRef, legRef)` — the actual substitute for the
 * design's real Postgres `unique(reservation_ref, passenger_ref, leg_ref)`
 * index (same in-memory-port-first convention as
 * `DuplicateNotificationError`). Spec `experience-pulse` "One response per
 * passenger/leg": a second submission attempt is rejected, not
 * double-recorded.
 */
export class DuplicatePulseResponseError extends Error {
  public readonly reservationRef: string;
  public readonly passengerRef: string;
  public readonly legRef: string;

  constructor(reservationRef: string, passengerRef: string, legRef: string) {
    super(
      `A pulse response already exists for reservation "${reservationRef}", passenger "${passengerRef}", leg "${legRef}"`,
    );
    this.name = "DuplicatePulseResponseError";
    this.reservationRef = reservationRef;
    this.passengerRef = passengerRef;
    this.legRef = legRef;
  }
}

export interface PulseResponseStore {
  /** Throws `DuplicatePulseResponseError` on a second response for the same passenger/leg — never silently overwrites or double-records. */
  create(input: CreatePulseResponseInput): Promise<PulseResponseRecord>;
  findByComposite(reservationRef: string, passengerRef: string, legRef: string): Promise<PulseResponseRecord | null>;
  /** Every recorded response (task 11.4's reporting/export query). */
  list(): Promise<PulseResponseRecord[]>;
}

export type StaffAlertStatus = "pending" | "sent" | "failed" | "dead";

/** Persisted shape of one `staff_alert` row (design Data Model): `pulseResponseId` carries the schema's `unique` constraint. */
export interface StaffAlertRecord {
  id: string;
  pulseResponseId: string;
  payload: StaffAlertPayload;
  status: StaffAlertStatus;
  attempts: number;
  lastError: string | null;
  dispatchedAt: string | null;
  createdAt: string;
}

export interface CreateStaffAlertInput {
  pulseResponseId: string;
  payload: StaffAlertPayload;
}

/** Thrown by `StaffAlertStore.create` when `pulseResponseId` already has a row (design Decision 12: "unique on pulse_response_id"). */
export class DuplicateStaffAlertError extends Error {
  public readonly pulseResponseId: string;

  constructor(pulseResponseId: string) {
    super(`A staff alert already exists for pulse response "${pulseResponseId}"`);
    this.name = "DuplicateStaffAlertError";
    this.pulseResponseId = pulseResponseId;
  }
}

export interface StaffAlertStore {
  /** Throws `DuplicateStaffAlertError` if `input.pulseResponseId` already has a row — the idempotency guarantee itself (spec: "no second alert is dispatched for that same passenger/leg"). */
  create(input: CreateStaffAlertInput): Promise<StaffAlertRecord>;
  findByPulseResponseId(pulseResponseId: string): Promise<StaffAlertRecord | null>;
  /** Every `status === "pending"` row (the dispatch job's scan, task 11.5). */
  listPending(): Promise<StaffAlertRecord[]>;
  updateStatus(
    id: string,
    status: StaffAlertStatus,
    detail?: { attempts?: number; lastError?: string | null; dispatchedAt?: string | null },
  ): Promise<void>;
}

/** `StaffAlertPort` per `sdd/travel-hub-mvp/design-interfaces` (D4a, task 11.5). */
export interface StaffAlertPort {
  send(payload: StaffAlertPayload, idempotencyKey: string): Promise<{ deliveryRef: string }>;
}

/**
 * Thrown by `PulsePromptDeliveryStore.create` when a push prompt has already
 * been requested for `(reservationRef, legRef)` — keeps a repeated client
 * call to `POST /api/pulse/prompt` for the same trigger moment from spamming
 * push notifications. Deliberately a separate, pulse-module-owned store, not
 * `NotificationStore`'s `dedupe_key` (task 11.6: pulse prompts are not a
 * `DELAY`/`RELOCATION`/`INCIDENT` journey event and never go through that
 * pipeline).
 */
export class DuplicatePulsePromptDeliveryError extends Error {
  public readonly reservationRef: string;
  public readonly legRef: string;

  constructor(reservationRef: string, legRef: string) {
    super(`A pulse prompt has already been requested for reservation "${reservationRef}", leg "${legRef}"`);
    this.name = "DuplicatePulsePromptDeliveryError";
    this.reservationRef = reservationRef;
    this.legRef = legRef;
  }
}

export interface PulsePromptDeliveryStore {
  /** Throws `DuplicatePulsePromptDeliveryError` on a second request for the same reservation/leg. */
  create(reservationRef: string, legRef: string): Promise<void>;
}
