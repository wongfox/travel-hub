/**
 * Entry point for the `worker` process (sagas, dispatch, purges, polling).
 * No jobs are registered yet (pg-boss wiring lands in task 3.4), so this
 * process boots, logs the (empty) registration result, and exits cleanly —
 * it does not hang waiting on a queue that does not exist yet.
 */
import { startWorker } from "./composition-root.js";

async function main(): Promise<void> {
  const result = await startWorker();
  console.log(`worker booted with ${result.jobsRegistered.length} job(s) registered`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
