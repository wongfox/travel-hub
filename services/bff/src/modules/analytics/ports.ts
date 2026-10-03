import type { AnalyticsEventName } from "contracts";

/**
 * `usage-analytics` domain types + ports (design-interfaces `AnalyticsSinkPort`,
 * design Data Model's `analytics_event` table, tasks 12.1-12.2).
 *
 * `PseudonymousAnalyticsEvent` is deliberately the ONLY shape this module
 * persists or forwards: it structurally has no `reservationRef`/
 * `passengerRef` field at all, so a raw reservation reference cannot reach
 * either `AnalyticsEventStore` or `AnalyticsSinkPort` even by a future
 * caller's mistake — `tripHash` (task 12.1's `computeTripHash`) is the only
 * reservation-derived field either ever sees.
 */
export interface PseudonymousAnalyticsEvent {
  name: AnalyticsEventName;
  tripHash: string;
  occurredAt: string;
  props?: Record<string, unknown>;
}

export interface AnalyticsEventRecord extends PseudonymousAnalyticsEvent {
  id: string;
  createdAt: string;
  /** `null` until `ForwardAnalyticsEventsJob` successfully forwards this row to `AnalyticsSinkPort`. */
  forwardedAt: string | null;
}

export type CreateAnalyticsEventInput = PseudonymousAnalyticsEvent;

export interface AnalyticsEventStore {
  create(input: CreateAnalyticsEventInput): Promise<AnalyticsEventRecord>;
  /** Persists the whole batch or none of it: a failure must leave nothing behind, so a client retry of the same batch cannot duplicate events. */
  createMany(inputs: CreateAnalyticsEventInput[]): Promise<AnalyticsEventRecord[]>;
  /** Every row with `forwardedAt: null` (the forward job's own scan, task 12.1). */
  listPendingForward(): Promise<AnalyticsEventRecord[]>;
  markForwarded(ids: string[], forwardedAt: string): Promise<void>;
  /** Deletes every NOT-yet-forwarded row of one pseudonymous trip (consent-withdrawal cascade); returns how many rows were removed. */
  deletePendingByTripHash(tripHash: string): Promise<number>;
  /** Every recorded event, in insertion order (test/reporting introspection only). */
  list(): Promise<AnalyticsEventRecord[]>;
}

/** `AnalyticsSinkPort` per `sdd/travel-hub-mvp/design-interfaces`: `forward(events): Promise<void>`, pseudonymous payload only. */
export interface AnalyticsSinkPort {
  forward(events: PseudonymousAnalyticsEvent[]): Promise<void>;
}
