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
- [ ] T2 Wire in `main-worker.ts` (+ env interval, shutdown stop) and prove it on the compose stack: pending rows written to Postgres get `forwarded_at` set by the real worker without a manual enqueue.
- [ ] T3 Docs/KNOWN-GAPS update; final turbo + E2E runs.

## Progress / evidence
- T1: RED (missing schedule-queue-scans module, `scheduleAnalyticsForward is not a function`) then GREEN: infra/queue/schedule-queue-scans.ts generic helper; scheduleWifiOrderScans and new scheduleAnalyticsForward delegate to it. 11 files / 67 tests pass incl. unchanged wifi scheduler tests; tsc + eslint clean. Commit: T1_HASH
