/**
 * Entry point for the `api` process (HTTP).
 */
import { buildApp } from "./composition-root.js";
import { loadEnv } from "./config/env.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const app = buildApp({
    logger: true,
    ...(env.INTERNAL_LINKS_API_KEY
      ? { tripAccess: { internalApiKey: env.INTERNAL_LINKS_API_KEY } }
      : {}),
  });

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
