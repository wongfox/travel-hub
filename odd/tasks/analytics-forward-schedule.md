# Feature: Schedule the analytics forward job in the worker

## Objective
The worker periodically enqueues the `analytics-forward` job so pending pseudonymous analytics events are forwarded without any external trigger, in production topology.

## Why
Branch 31 made consent and analytics events visible to the worker through Postgres, but nothing enqueues `analytics-forward` (the job is registered only). `scheduleWifiOrderScans` (branch 19) schedules only the two WiFi queues.

## Scope
- In: reuse or minimally generalize the existing scan-scheduler helper (do not duplicate its logic) to also enqueue `analytics-forward` on an interval; wire it in `main-worker.ts` only when the analytics forward job is registered; unit tests (RED first); stop function called on SIGTERM shutdown; docs/KNOWN-GAPS update.
- Out: scheduling the other unscheduled scans (handoff, purges, push, pulse); a real analytics sink; changing the forward job's semantics.

## Constraints
Strict TDD (`pnpm --filter bff exec vitest run --no-file-parallelism`, DB tests with `TEST_DATABASE_URL`); natural-key dedupe (`sendIdempotent`) so overlapping ticks never double-enqueue; interval configurable via env with a safe default; no TLS weakening, no sudo; agent must not push or touch PRs. Route: delegated direct, one writer. Branch `feat/travel-hub-mvp-32-analytics-forward-schedule` (on top of 31).

## Tasks
- [x] T1 Scheduler: generalize/reuse helper + tests for the analytics queue.
- [x] T2 Wire in `main-worker.ts` (+ env interval, shutdown stop) and prove it on the compose stack: pending rows written to Postgres get `forwarded_at` set by the real worker without a manual enqueue.
- [x] T3 Docs/KNOWN-GAPS update; final turbo + E2E runs.

## Progress / evidence
- T1: RED (missing schedule-queue-scans module, `scheduleAnalyticsForward is not a function`) then GREEN: infra/queue/schedule-queue-scans.ts generic helper; scheduleWifiOrderScans and new scheduleAnalyticsForward delegate to it. 11 files / 67 tests pass incl. unchanged wifi scheduler tests; tsc + eslint clean. Commit: 2a56b59

- T2 (24ffb6e): env tests RED (2 failing) then GREEN; main-worker starts `scheduleAnalyticsForward` only if `analytics-forward` is in `jobsRegistered`, interval = ANALYTICS_FORWARD_INTERVAL_SECONDS (default 60, positive int); stop functions for both wifi and analytics schedulers now called in SIGTERM/SIGINT shutdown (wifi stop was previously not called). Compose proof (interval 3s, temp compose edit reverted): consent granted + 3 pending rows for HMAC trip_hash of RES-SCHED-1 -> poll `14:50:44|3|0` then `14:50:46|0|3` (forwarded_at - created_at = 2.1s), no manual enqueue. Rows deleted (counts 0). Worker log shows "received SIGTERM, stopping". Compose restored to default (env unset -> 60s).
- T3 (9cab1c1): e2e/KNOWN-GAPS.md updated; handoff/purge/push/pulse scans listed as follow-ups.
- Final: turbo typecheck/lint/test (bff 824 passed, 32 DB tests skipped without TEST_DATABASE_URL) 13/13 OK; E2E container 20 passed.
