/**
 * Job queue abstraction over pg-boss (design Decision 7: transactional
 * outbox on Postgres, one `worker` process). Modeled as a small port so the
 * natural-key dedupe and bounded-retry/dead-letter wiring can be unit
 * tested deterministically (`createInMemoryQueueClient`) without a live
 * Postgres instance, and swapped for the real adapter
 * (`createPgBossQueueClient`) at boot.
 */

export interface QueueRetryPolicy {
  /** How many times a failed job may be retried before it is exhausted. */
  retryLimit: number;
  /** Base delay (seconds) between retries; pg-boss applies exponential backoff on top of this. */
  retryBackoffSeconds: number;
  /** Queue name jobs are moved to once retries are exhausted. Omit to just fail terminally. */
  deadLetterQueue?: string;
}

export type QueueHandler<TPayload> = (payload: TPayload) => Promise<void>;

export interface QueueClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  createQueue(name: string, policy: QueueRetryPolicy): Promise<void>;
  /**
   * Enqueues a job idempotently: while a job sharing `naturalKey` is still
   * pending (queued, active, or awaiting retry) on `queueName`, a second
   * send returns `null` instead of creating a duplicate job.
   */
  sendIdempotent<TPayload extends object>(
    queueName: string,
    naturalKey: string,
    payload: TPayload,
  ): Promise<string | null>;
  work<TPayload extends object>(queueName: string, handler: QueueHandler<TPayload>): Promise<void>;
  /**
   * Task 13.3 (observability): number of jobs currently outstanding
   * (pending/active, not yet completed) on `queueName`. Returns `0` for a
   * queue name that was never created, rather than throwing — a metrics
   * endpoint must stay resilient to a queue that has not registered yet.
   */
  getQueueDepth(queueName: string): Promise<number>;
  /**
   * Task 13.3 (observability): number of jobs sitting in `deadLetterQueueName`
   * (a queue named via `QueueRetryPolicy.deadLetterQueue`). Returns `0` for a
   * dead-letter queue name that has never received a job, rather than
   * throwing.
   */
  getDeadLetterCount(deadLetterQueueName: string): Promise<number>;
}

interface PendingJob {
  payload: object;
  retryCount: number;
}

/**
 * Deterministic, in-memory `QueueClient` for tests and local development.
 * Reproduces pg-boss's documented `singletonKey` dedupe and
 * `retryLimit`/`deadLetter` semantics closely enough to unit test the
 * sample job's dedupe and bounded-retry behavior without a live Postgres
 * instance (see `sdd/travel-hub-mvp/apply-progress` for the environmental
 * gap this stands in for). It does not simulate pg-boss's internal polling
 * or timing — `runPendingOnce` drives processing explicitly and
 * synchronously for deterministic assertions.
 */
export interface InMemoryQueueClient extends QueueClient {
  /** Test-only: attempts every currently pending job on `queueName` once. */
  runPendingOnce(queueName: string): Promise<void>;
  /** Test-only: inspects payloads routed to a dead-letter queue. */
  peekDeadLetters(deadLetterQueueName: string): object[];
}

export function createInMemoryQueueClient(): InMemoryQueueClient {
  const policies = new Map<string, QueueRetryPolicy>();
  const handlers = new Map<string, QueueHandler<object>>();
  const pendingBySingletonKey = new Map<string, Map<string, PendingJob>>();
  const deadLetters = new Map<string, object[]>();
  let nextId = 0;

  return {
    async start() {},
    async stop() {},

    async createQueue(name, policy) {
      policies.set(name, policy);
      pendingBySingletonKey.set(name, new Map());
    },

    async sendIdempotent(queueName, naturalKey, payload) {
      const bucket = pendingBySingletonKey.get(queueName);
      if (!bucket) {
        throw new Error(`Queue "${queueName}" was not created before sending to it`);
      }
      if (bucket.has(naturalKey)) {
        return null;
      }
      bucket.set(naturalKey, { payload, retryCount: 0 });
      nextId += 1;
      return `job-${nextId}`;
    },

    async work(queueName, handler) {
      handlers.set(queueName, handler as QueueHandler<object>);
    },

    async runPendingOnce(queueName) {
      const bucket = pendingBySingletonKey.get(queueName);
      const handler = handlers.get(queueName);
      const policy = policies.get(queueName);
      if (!bucket || !handler || !policy) return;

      for (const [naturalKey, job] of [...bucket.entries()]) {
        try {
          await handler(job.payload);
          bucket.delete(naturalKey);
        } catch {
          job.retryCount += 1;
          if (job.retryCount > policy.retryLimit) {
            bucket.delete(naturalKey);
            if (policy.deadLetterQueue) {
              const existing = deadLetters.get(policy.deadLetterQueue) ?? [];
              existing.push(job.payload);
              deadLetters.set(policy.deadLetterQueue, existing);
            }
          }
        }
      }
    },

    peekDeadLetters(deadLetterQueueName) {
      return deadLetters.get(deadLetterQueueName) ?? [];
    },

    async getQueueDepth(queueName) {
      return pendingBySingletonKey.get(queueName)?.size ?? 0;
    },

    async getDeadLetterCount(deadLetterQueueName) {
      return (deadLetters.get(deadLetterQueueName) ?? []).length;
    },
  };
}
