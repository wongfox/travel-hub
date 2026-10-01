/**
 * Task 13.3 (observability): "alerting hook for dead-letter jobs". No
 * alerting vendor/channel is chosen (consistent with every other
 * not-yet-chosen integration in this codebase — `ContentPort`'s CMS,
 * `AnalyticsSinkPort`'s platform, the pulse module's own D4a alert
 * receiving team), so this follows the same port + `stub`/`log-only`
 * adapter convention used there (design Decision 12).
 */
export interface DeadLetterAlert {
  queueName: string;
  deadLetterQueueName: string;
  /** Number of jobs currently sitting in `deadLetterQueueName`, at the moment this alert was raised. */
  count: number;
  detectedAt: string;
}

export interface DeadLetterAlertPort {
  notify(alert: DeadLetterAlert): Promise<void>;
}
