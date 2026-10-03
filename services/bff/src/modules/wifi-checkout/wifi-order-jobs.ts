import type { SirPosPort } from "../booking/ports.js";
import type { QueueClient, QueueRetryPolicy } from "../../infra/queue/queue-client.js";
import { activateWifiOrder } from "./activate-wifi-order.js";
import { WifiPackageNotFoundError } from "./errors.js";
import type { EReceiptPort, WifiEntitlementPort, WifiOrderRecord, WifiOrderStore, WifiPackageStore } from "./ports.js";

/**
 * Worker queues this module registers on (task 10.3), following the exact
 * `registerXxxJob(queueClient, deps)` convention of
 * `modules/precheckin/handoff-job.ts`. Entitlement activation and
 * SIR-registration/e-receipt-issuance are two independent scans (design
 * Decision 8: activation happens first and is a saga-state transition;
 * SIR/receipt are independently retried side effects that never block
 * `ENTITLEMENT_ACTIVE`), so each gets its own queue/retry policy.
 */
export const WIFI_ENTITLEMENT_ACTIVATION_QUEUE = "wifi-entitlement-activation";
export const WIFI_SIR_RECEIPT_QUEUE = "wifi-sir-receipt";
export const WIFI_JOB_RETRY_POLICY: QueueRetryPolicy = { retryLimit: 3, retryBackoffSeconds: 30 };

/**
 * Per-order SIR-registration retry cap (task 10.3's acceptance criterion).
 * This job scans every eligible order per invocation and catches each
 * order's failure independently so one order's outage never blocks another
 * (same convention as `runHandoffJob`) — which means a per-item retry count
 * cannot be read off the queue's own `QueueRetryPolicy` the way a
 * one-job-per-order queue could (the queue only sees "the scan succeeded",
 * never "this one order inside it failed"). `WifiOrderRecord.
 * sirRegistrationAttempts` is the documented, honest substitute: once it
 * exceeds this limit, the order is flagged `sirReconciliationRequired` and
 * excluded from further automatic attempts — never refunded from this job.
 */
export const SIR_REGISTRATION_RETRY_LIMIT = 3;

export interface WifiOrderJobsDeps {
  orderStore: Pick<WifiOrderStore, "listByStatus" | "transition" | "findById">;
  packageStore: Pick<WifiPackageStore, "findById">;
  entitlement: Pick<WifiEntitlementPort, "grant">;
  sirPos: Pick<SirPosPort, "registerSale">;
  eReceipt: Pick<EReceiptPort, "issue">;
  /** Injectable clock for deterministic tests; defaults to `Date.now`. */
  now?: () => Date;
}

export interface EntitlementActivationJobResult {
  processed: number;
  activated: number;
  failed: number;
}

/**
 * Entitlement-first activation scan (task 10.3): every order currently
 * `PAID` is activated via `activateWifiOrder`. One order's failure (a
 * `WifiEntitlementPort.grant` outage, an unresolvable package, etc.) is
 * caught and never blocks another order's activation — the same "one
 * failure never blocks another" convention as `runHandoffJob`. A failed
 * order stays `PAID` and is retried on the next scan.
 */
export async function runWifiEntitlementActivationJob(
  deps: WifiOrderJobsDeps,
): Promise<EntitlementActivationJobResult> {
  const paidOrders = await deps.orderStore.listByStatus("PAID");
  let activated = 0;
  let failed = 0;

  for (const order of paidOrders) {
    try {
      await activateWifiOrder(order.id, {
        orderStore: deps.orderStore,
        packageStore: deps.packageStore,
        entitlement: deps.entitlement,
        ...(deps.now ? { now: deps.now } : {}),
      });
      activated += 1;
    } catch {
      failed += 1;
    }
  }

  return { processed: paidOrders.length, activated, failed };
}

export interface SirAndReceiptJobResult {
  processed: number;
  sirRegistered: number;
  sirFailed: number;
  sirReconciliationFlagged: number;
  receiptsIssued: number;
  receiptsFailed: number;
}

async function attemptSirRegistration(
  order: WifiOrderRecord,
  deps: WifiOrderJobsDeps,
): Promise<"registered" | "already" | "skipped" | "failed" | "reconciliation"> {
  if (order.sirRegisteredAt) return "already";
  if (order.sirReconciliationRequired) return "skipped";

  try {
    const pkg = await deps.packageStore.findById(order.packageId);
    if (!pkg) {
      // An unresolvable package is exactly as unrecoverable-by-retry as a
      // SIR outage from this job's perspective — both MUST count toward
      // SIR_REGISTRATION_RETRY_LIMIT so the order can still reach the
      // sirReconciliationRequired escape hatch instead of retrying forever.
      throw new WifiPackageNotFoundError(order.packageId);
    }

    const { saleRef } = await deps.sirPos.registerSale(
      {
        reservationRef: order.reservationRef,
        passengerRef: order.passengerRef,
        packageCode: pkg.code,
        amountMinor: order.amountMinor,
        currency: order.currency,
      },
      order.id,
    );
    await deps.orderStore.transition(order.id, order.status, {
      sirRegisteredAt: (deps.now ? deps.now() : new Date()).toISOString(),
      sirSaleRef: saleRef,
    });
    return "registered";
  } catch {
    const attempts = order.sirRegistrationAttempts + 1;
    const reconciliationRequired = attempts > SIR_REGISTRATION_RETRY_LIMIT;
    await deps.orderStore.transition(order.id, order.status, {
      sirRegistrationAttempts: attempts,
      sirReconciliationRequired: reconciliationRequired,
    });
    return reconciliationRequired ? "reconciliation" : "failed";
  }
}

async function attemptReceiptIssuance(
  order: WifiOrderRecord,
  deps: WifiOrderJobsDeps,
): Promise<"issued" | "already" | "failed"> {
  if (order.receiptIssuedAt) return "already";

  try {
    // The boleta is issued in Spanish (es-PE fiscal document); an unresolvable
    // package must not block it, so the internal id is only the last resort.
    const pkg = await deps.packageStore.findById(order.packageId);
    const description = pkg?.names.es ?? Object.values(pkg?.names ?? {})[0] ?? pkg?.code ?? order.packageId;
    const { receiptRef } = await deps.eReceipt.issue({
      orderId: order.id,
      buyerEmail: order.buyerEmail,
      lines: [{ description, amountMinor: order.amountMinor }],
      currency: order.currency,
      // Stable across retries, same convention as `handoff-job.ts`'s
      // `idempotencyKey: submission.id`: protects against emailing a second
      // boleta if a later step in this same scan ever fails after issue()
      // already succeeded.
      idempotencyKey: order.id,
    });
    await deps.orderStore.transition(order.id, order.status, {
      receiptIssuedAt: (deps.now ? deps.now() : new Date()).toISOString(),
      receiptRef,
    });
    return "issued";
  } catch {
    return "failed";
  }
}

/**
 * SIR-registration + e-receipt-issuance scan (task 10.3): every order
 * currently `ENTITLEMENT_ACTIVE` gets both independent steps attempted
 * (design Decision 8 — neither blocks the other, and neither blocks another
 * order). SIR registration failures are retried by this scan's natural
 * daily cadence up to `SIR_REGISTRATION_RETRY_LIMIT` attempts; once
 * exhausted, the order is flagged `sirReconciliationRequired` and excluded
 * from further attempts — this job NEVER calls `PaymentGatewayPort.refund`.
 * E-receipt issuance has no reconciliation flag (an email delivery failure
 * is not a financial-integrity concern the way an unregistered SIR sale is)
 * and simply retries indefinitely on the next scan, same as `runHandoffJob`.
 */
export async function runSirAndReceiptJob(deps: WifiOrderJobsDeps): Promise<SirAndReceiptJobResult> {
  const activeOrders = await deps.orderStore.listByStatus("ENTITLEMENT_ACTIVE");
  let sirRegistered = 0;
  let sirFailed = 0;
  let sirReconciliationFlagged = 0;
  let receiptsIssued = 0;
  let receiptsFailed = 0;

  for (const order of activeOrders) {
    try {
      const sirOutcome = await attemptSirRegistration(order, deps);
      if (sirOutcome === "registered") sirRegistered += 1;
      else if (sirOutcome === "failed") sirFailed += 1;
      else if (sirOutcome === "reconciliation") sirReconciliationFlagged += 1;
    } catch {
      sirFailed += 1;
    }

    try {
      const receiptOutcome = await attemptReceiptIssuance(order, deps);
      if (receiptOutcome === "issued") receiptsIssued += 1;
      else if (receiptOutcome === "failed") receiptsFailed += 1;
    } catch {
      receiptsFailed += 1;
    }
  }

  return { processed: activeOrders.length, sirRegistered, sirFailed, sirReconciliationFlagged, receiptsIssued, receiptsFailed };
}

/**
 * Registers both jobs on `queueClient`'s worker process (task 10.3),
 * following `registerHandoffJob`'s exact pattern: one queue + handler per
 * job, each running its scan against `deps` whenever triggered.
 */
export async function registerWifiOrderJobs(queueClient: QueueClient, deps: WifiOrderJobsDeps): Promise<void> {
  await queueClient.createQueue(WIFI_ENTITLEMENT_ACTIVATION_QUEUE, WIFI_JOB_RETRY_POLICY);
  await queueClient.work(WIFI_ENTITLEMENT_ACTIVATION_QUEUE, async () => {
    await runWifiEntitlementActivationJob(deps);
  });

  await queueClient.createQueue(WIFI_SIR_RECEIPT_QUEUE, WIFI_JOB_RETRY_POLICY);
  await queueClient.work(WIFI_SIR_RECEIPT_QUEUE, async () => {
    await runSirAndReceiptJob(deps);
  });
}

/** Default cadence of the WiFi scans; both jobs are idempotent, so a short interval only bounds activation latency. */
export const WIFI_SCAN_INTERVAL_MS = 60_000;

/**
 * Periodically enqueues both WiFi scans (`PAID` -> `ENTITLEMENT_ACTIVE`, then
 * SIR registration + e-receipt) on the worker process. Nothing else triggers
 * them: the payment webhook only moves an order to `PAID`. Uses
 * `sendIdempotent` with a fixed natural key, so a slow scan is never stacked
 * (same convention as `handoff-job.ts`). A failed send is logged and the next
 * tick retries. Returns a function that stops the scheduler.
 */
export function scheduleWifiOrderScans(
  queueClient: Pick<QueueClient, "sendIdempotent">,
  options: { intervalMs?: number } = {},
): () => void {
  const timer = setInterval(() => {
    for (const queue of [WIFI_ENTITLEMENT_ACTIVATION_QUEUE, WIFI_SIR_RECEIPT_QUEUE]) {
      queueClient.sendIdempotent(queue, "scan", {}).catch((error: unknown) => {
        console.error(`failed to enqueue the ${queue} scan`, error);
      });
    }
  }, options.intervalMs ?? WIFI_SCAN_INTERVAL_MS);
  return () => clearInterval(timer);
}
