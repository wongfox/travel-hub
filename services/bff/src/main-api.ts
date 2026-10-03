/**
 * Entry point for the `api` process (HTTP).
 */
import { buildApp } from "./composition-root.js";
import { loadEnv } from "./config/env.js";
import { DEFAULT_ALERT_SOURCE_POLICY } from "./config/alert-source-policy.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = buildApp({
    logger: true,
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
