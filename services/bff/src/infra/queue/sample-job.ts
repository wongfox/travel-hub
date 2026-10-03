import type { QueueClient, QueueRetryPolicy } from "./queue-client.js";

/**
 * The one sample idempotent job registered on the `worker` process per task
 * 3.4's acceptance criteria: it demonstrates natural-key dedupe (via
 * `QueueClient.sendIdempotent`) and bounded exponential-backoff retry with
 * dead-letter routing. Future work units' real jobs (WiFi saga steps,
 * e-receipt issuance, push fan-out, purge jobs, etc.) follow this same
 * registration pattern against their own queue names/policies.
 */
export const SAMPLE_JOB_QUEUE = "sample-job";
export const SAMPLE_JOB_DEAD_LETTER_QUEUE = "sample-job-dead-letter";

export const SAMPLE_JOB_RETRY_POLICY: QueueRetryPolicy = {
  retryLimit: 5,
  retryBackoffSeconds: 1,
  deadLetterQueue: SAMPLE_JOB_DEAD_LETTER_QUEUE,
};

export interface SampleJobPayload {
  message: string;
}

export interface SampleJobExecutor {
  execute(payload: SampleJobPayload): Promise<void>;
}

/**
 * Creates the sample job's queue (and its dead-letter queue) on
 * `queueClient` and registers `executor` as its worker handler.
 */
export async function registerSampleJob(
  queueClient: QueueClient,
  executor: SampleJobExecutor,
): Promise<void> {
  await queueClient.createQueue(SAMPLE_JOB_QUEUE, SAMPLE_JOB_RETRY_POLICY);
  await queueClient.createQueue(SAMPLE_JOB_DEAD_LETTER_QUEUE, {
    retryLimit: 0,
    retryBackoffSeconds: 0,
  });
  await queueClient.work<SampleJobPayload>(SAMPLE_JOB_QUEUE, (payload) => executor.execute(payload));
}
