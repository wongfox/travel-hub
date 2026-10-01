/**
 * Entry point for the `api` process (HTTP).
 */
import { buildApp } from "./composition-root.js";
import { loadEnv } from "./config/env.js";

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
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
