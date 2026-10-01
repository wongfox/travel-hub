/**
 * Entry point for the `api` process (HTTP).
 */
import { buildApp } from "./composition-root.js";
import { loadEnv } from "./config/env.js";
import { DEFAULT_ALERT_SOURCE_POLICY } from "./config/alert-source-policy.js";
import { createLogDestination, resolveLogSinkConfig } from "./infra/logging/log-sink.js";
import { createRedactingLogger } from "./infra/logging/redacting-logger.js";
import { createPgBossQueueClient } from "./infra/queue/pg-boss-queue-client.js";
import { createDeadLetterAlertLogOnlyAdapter } from "./adapters/dead-letter-alert/log-only.js";

async function main(): Promise<void> {
  const env = loadEnv();

  // Task 13.3 (observability): structured JSON logs to a configurable sink.
  // "stdout" (the default) needs no destination override — pino's own
  // default stream already satisfies "structured JSON logs", and shipping
  // them elsewhere is the deployment platform's job (see infra/'s ECS
  // `awslogs` driver / docker-compose's own log driver locally).
  const logSinkConfig = resolveLogSinkConfig(env);
  const logDestination = createLogDestination(logSinkConfig);
  // Always build a real logger instance (never `buildApp`'s `logger: true`
  // shortcut) so the SAME instance is also available below to log dead-letter
  // alerts, consistent with whatever sink was configured.
  const logger = createRedactingLogger({}, logDestination);

  // Task 13.3: a SEPARATE, read-only QueueClient for `GET /metrics` — never
  // used to send/work jobs (that stays the `worker` process's job per design
  // Decision 2) — pointed at the same Postgres database the worker's own
  // queueClient persists queue state to, so depth/dead-letter counts reflect
  // the worker's real job activity. `.start()` is required before pg-boss
  // will answer `getQueue` calls; this never calls `.work()`/`.sendIdempotent()`.
  const observabilityQueueClient = createPgBossQueueClient(env.DATABASE_URL);
  await observabilityQueueClient.start();

  const app = buildApp({
    logger,
    observability: {
      queueClient: observabilityQueueClient,
      // No alerting vendor is chosen (task 13.3's "alerting hook", same
      // "not chosen yet" pattern as ContentPort/AnalyticsSinkPort and the
      // pulse module's own D4a alert port) — log-only keeps a durable,
      // auditable record of every dead-letter event via the same
      // structured, redacted logger.
      deadLetterAlert: createDeadLetterAlertLogOnlyAdapter({
        log: (alert) => logger.warn({ ...alert }, "dead-letter jobs detected"),
      }),
    },
    tripAccess: {
      nodeEnv: env.NODE_ENV,
      ...(env.INTERNAL_LINKS_API_KEY ? { internalApiKey: env.INTERNAL_LINKS_API_KEY } : {}),
    },
    content: {
      // Task 9.1: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this api process's real boot-time configuration, not a stub.
      nodeEnv: env.NODE_ENV,
      adapterContent: env.ADAPTER_CONTENT,
    },
    wifiCheckout: {
      // Tasks 10.1/10.3: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this api process's real boot-time configuration, not a stub.
      nodeEnv: env.NODE_ENV,
      adapterPayment: env.ADAPTER_PAYMENT,
      adapterReceipt: env.ADAPTER_RECEIPT,
      adapterSirPos: env.ADAPTER_SIR_POS,
      adapterWifiEntitlement: env.ADAPTER_WIFI_ENTITLEMENT,
    },
    notifications: {
      // Task 11.1: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this api process's real boot-time configuration, not a stub.
      nodeEnv: env.NODE_ENV,
      adapterWebPush: env.ADAPTER_WEB_PUSH,
      vapidConfigured: Boolean(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY),
      alertSourcePolicy: DEFAULT_ALERT_SOURCE_POLICY,
      ...(env.PUSH_CONSENT_TEXT_VERSION ? { pushConsentTextVersion: env.PUSH_CONSENT_TEXT_VERSION } : {}),
    },
    pulse: {
      // Tasks 11.4-11.5: real env-sourced config, so the go-live guard
      // (config/go-live-guards.ts) actually enforces its prerequisites
      // against this api process's real boot-time configuration, not a stub.
      nodeEnv: env.NODE_ENV,
      adapterStaffAlert: env.ADAPTER_STAFF_ALERT,
      ...(env.PULSE_CONSENT_TEXT_VERSION ? { pulseConsentTextVersion: env.PULSE_CONSENT_TEXT_VERSION } : {}),
      ...(env.STAFF_ALERT_RECEIVER_ID ? { staffAlertReceiverId: env.STAFF_ALERT_RECEIVER_ID } : {}),
      ...(env.STAFF_ALERT_PROTOCOL_REF ? { staffAlertProtocolRef: env.STAFF_ALERT_PROTOCOL_REF } : {}),
      ...(env.STAFF_ALERT_RETENTION_DAYS ? { staffAlertRetentionDays: env.STAFF_ALERT_RETENTION_DAYS } : {}),
    },
    analytics: {
      // Task 12.1: real env-sourced secret, so `trip_hash` pseudonymization
      // is stable across this api process's restarts.
      secret: env.ANALYTICS_TRIP_HASH_SECRET ?? "dev-only-analytics-trip-hash-secret",
    },
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
