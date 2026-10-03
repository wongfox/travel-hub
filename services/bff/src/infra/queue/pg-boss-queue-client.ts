import { PgBoss, type Job } from "pg-boss";
import type { QueueClient, QueueHandler, QueueRetryPolicy } from "./queue-client.js";

/**
 * Real `QueueClient` adapter backed by pg-boss (design Decision 7).
 * Construction never opens a connection — pg-boss only dials the database
 * inside `start()` — so this can be built at composition-root time and
 * started/stopped explicitly by `main-worker.ts`.
 *
 * End-to-end verification against a live Postgres instance is an
 * environmental gap in this sandbox (no Docker available — same limitation
 * recorded for WU3's migration-apply step); the natural-key dedupe and
 * bounded-retry/dead-letter wiring itself is unit tested deterministically
 * against `createInMemoryQueueClient`, which models the same documented
 * pg-boss `singletonKey`/`retryLimit`/`deadLetter` semantics.
 */
export function createPgBossQueueClient(connectionString: string): QueueClient {
  const boss = new PgBoss(connectionString);

  return {
    async start() {
      await boss.start();
    },

    async stop() {
      await boss.stop();
    },

    async createQueue(name: string, policy: QueueRetryPolicy) {
      await boss.createQueue(name, {
        retryLimit: policy.retryLimit,
        retryBackoff: true,
        retryDelay: policy.retryBackoffSeconds,
        ...(policy.deadLetterQueue ? { deadLetter: policy.deadLetterQueue } : {}),
      });
    },

    async sendIdempotent<TPayload extends object>(
      queueName: string,
      naturalKey: string,
      payload: TPayload,
    ) {
      return boss.send(queueName, payload, { singletonKey: naturalKey });
    },

    async work<TPayload extends object>(queueName: string, handler: QueueHandler<TPayload>) {
      await boss.work<TPayload>(queueName, async (jobs: Job<TPayload>[]) => {
        for (const job of jobs) {
          await handler(job.data);
        }
      });
    },
  };
}
