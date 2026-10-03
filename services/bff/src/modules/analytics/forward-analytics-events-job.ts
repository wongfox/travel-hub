import type { QueueClient, QueueRetryPolicy } from "../../infra/queue/queue-client.js";
import type { ConsentStore } from "../privacy/consent-store.js";
import { computeTripHash } from "./trip-hash.js";
import type { AnalyticsEventStore, AnalyticsSinkPort, PseudonymousAnalyticsEvent } from "./ports.js";

/** Worker queue this module registers on (task 12.1), following `registerPurgeJob`/`registerStaffAlertDispatchJob`'s exact `registerXxxJob(queueClient, deps)` convention. */
export const ANALYTICS_FORWARD_QUEUE = "analytics-forward";
export const ANALYTICS_FORWARD_RETRY_POLICY: QueueRetryPolicy = { retryLimit: 5, retryBackoffSeconds: 30 };

export interface ForwardAnalyticsEventsJobDeps {
  analyticsEventStore: Pick<AnalyticsEventStore, "listPendingForward" | "markForwarded" | "deletePendingByTripHash">;
  analyticsSink: Pick<AnalyticsSinkPort, "forward">;
  /** Consent is re-checked at forward time: a row is only ever sent while its trip's latest `analytics` consent is granted. */
  consentStore: Pick<ConsentStore, "listLatestByPurpose">;
  /** `ANALYTICS_TRIP_HASH_SECRET`: maps each granted reservation to the `tripHash` its rows carry. */
  secret: string;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface ForwardAnalyticsEventsJobResult {
  forwarded: number;
}

function toPseudonymousPayload(record: {
  name: PseudonymousAnalyticsEvent["name"];
  tripHash: string;
  occurredAt: string;
  props?: Record<string, unknown>;
}): PseudonymousAnalyticsEvent {
  return {
    name: record.name,
    tripHash: record.tripHash,
    occurredAt: record.occurredAt,
    ...(record.props ? { props: record.props } : {}),
  };
}

/**
 * Analytics forward scan (task 12.1): sends every pending row to
 * `AnalyticsSinkPort.forward` as one batch, matching the port's own
 * batch-shaped signature (design-interfaces: `forward(events: PseudonymousEvent[])`)
 * — unlike `runStaffAlertDispatchJob`'s per-item loop, this is a single call
 * for the whole pending set, so this job provides all-or-nothing-per-run
 * semantics, not per-item isolation: if `forward` throws, NOTHING in this
 * run is marked forwarded (asserted below), so a retry resends the exact
 * same batch. `AnalyticsSinkPort` implementations must tolerate receiving
 * the same pseudonymous event more than once as a result.
 *
 * The payload handed to the sink (and nothing else) is checked by this
 * module's own tests to contain `tripHash`, never `reservationRef` (task
 * 12.1 acceptance).
 */
export async function runForwardAnalyticsEventsJob(
  deps: ForwardAnalyticsEventsJobDeps,
): Promise<ForwardAnalyticsEventsJobResult> {
  const allPending = await deps.analyticsEventStore.listPendingForward();
  if (allPending.length === 0) {
    return { forwarded: 0 };
  }

  // Fail closed: only trips whose latest analytics consent is granted may be
  // forwarded. Rows of a withdrawn (or unknown) trip are deleted, never sent.
  const grantedTripHashes = new Set(
    (await deps.consentStore.listLatestByPurpose("analytics"))
      .filter((entry) => entry.granted)
      .map((entry) => computeTripHash(entry.reservationRef, deps.secret)),
  );
  const unconsentedTripHashes = new Set(
    allPending.filter((record) => !grantedTripHashes.has(record.tripHash)).map((record) => record.tripHash),
  );
  for (const tripHash of unconsentedTripHashes) {
    await deps.analyticsEventStore.deletePendingByTripHash(tripHash);
  }
  const pending = allPending.filter((record) => grantedTripHashes.has(record.tripHash));
  if (pending.length === 0) {
    return { forwarded: 0 };
  }

  await deps.analyticsSink.forward(pending.map(toPseudonymousPayload));

  const forwardedAt = (deps.now ? deps.now() : new Date()).toISOString();
  await deps.analyticsEventStore.markForwarded(
    pending.map((record) => record.id),
    forwardedAt,
  );

  return { forwarded: pending.length };
}

/** Registers the analytics forward job on `queueClient`'s worker process (task 12.1). */
export async function registerForwardAnalyticsEventsJob(
  queueClient: QueueClient,
  deps: ForwardAnalyticsEventsJobDeps,
): Promise<void> {
  await queueClient.createQueue(ANALYTICS_FORWARD_QUEUE, ANALYTICS_FORWARD_RETRY_POLICY);
  await queueClient.work(ANALYTICS_FORWARD_QUEUE, async () => {
    await runForwardAnalyticsEventsJob(deps);
  });
}
