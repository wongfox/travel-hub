/**
 * Entry point for the `worker` process (sagas, dispatch, purges, polling).
 */
import { startWorker } from "./composition-root.js";
import { loadEnv } from "./config/env.js";
import { createPgBossQueueClient } from "./infra/queue/pg-boss-queue-client.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const queueClient = createPgBossQueueClient(env.DATABASE_URL);
  const result = await startWorker({ queueClient });
  console.log(`worker booted with ${result.jobsRegistered.length} job(s) registered`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
