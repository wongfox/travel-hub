# Feature: Schedule the remaining worker scan jobs

## Objective
The worker periodically enqueues the remaining registered-but-unscheduled scan jobs (precheckin handoff, precheckin purge, push-subscription purge, pulse purge, staff-alert dispatch, journey poll — to be confirmed against the real queue list), reusing `scheduleQueueScans` (branch 32), each with a configurable interval and a stop on shutdown.

## Why
Only the wifi and analytics scans are scheduled. Every other job is registered on the worker but nothing enqueues it, so retention purges, handoff delivery, staff alerts and push polling never run on their own in production.

## Scope
- In: one scheduling call per confirmed unscheduled job via the existing helper; env-configurable intervals (validated, safe defaults); wiring only when the job is registered; shutdown stop; unit tests (RED first); docs/KNOWN-GAPS.
- Out: changing job semantics; fixing the remaining stubs (precheckin document/ciphertext store and handoff port, SIR polling adapter, web-push and staff-alert ports) and per-process rate limiters — documented per job. (The Postgres stores these jobs read were delivered by S1–S4 / branches 33–36.)

## Constraints
Strict TDD; natural-key dedupe via `sendIdempotent`; destructive jobs (purges) must keep their existing per-item isolation and `pii_access_audit` behavior untouched; no TLS weakening, no sudo; agent must not push or touch PRs. Route: delegated direct, one writer. Branch `feat/travel-hub-mvp-37-schedule-remaining-scans` (S5 of `shared-postgres-stores`, on top of 36; re-based after the stores became Postgres-backed).

## Tasks
- [x] T1 Inventory: list every queue the worker registers vs which are scheduled; for each unscheduled one record which stores it reads and whether they are shared (Postgres) or per-process in-memory.
- [x] T2 Schedule each confirmed job with the helper + env intervals + tests; wire shutdown stop.
- [x] T3 Real check on compose (worker boots, schedulers tick without errors, no crash on empty stores) + docs/KNOWN-GAPS with the per-job caveat.

## Progress / evidence
### T1 inventory (verified in composition-root.ts `startWorker` + each job module)
All six `queueClient.work(QUEUE, async () => { await runXxxJob(deps) })` handlers ignore the payload, so each is a genuine payload-free periodic scan.

| Queue | Const | Scheduled | Reads/writes | Store backing in worker (main-worker.ts, after S1-S4) | Still stubbed | Schedule |
|---|---|---|---|---|---|---|
| sample-job | SAMPLE_JOB_QUEUE | no | test fixture (noop executor) | none | n/a | NO (fixture) |
| wifi-entitlement-activation, wifi-sir-receipt | WIFI_* | branch 32 | wifi orders | Postgres | adapters per ADAPTER_* | already |
| analytics-forward | ANALYTICS_FORWARD_QUEUE | branch 32 | analytics events + consent | Postgres | sink adapter | already |
| precheckin-handoff | PRECHECKIN_HANDOFF_QUEUE | S5 | submissionStore.listPendingHandoff/markHandedOff, documentStore.get | submissions Postgres, pii audit Postgres | document (ciphertext) store is a per-process stub; handoff port stub | YES, 60s |
| precheckin-purge (destructive) | PRECHECKIN_PURGE_QUEUE | S5 | submissionStore.listPastPurgeAfter/markPurged, documentStore.delete, pii audit | submissions Postgres, pii audit Postgres | document store stub (delete is on the stub) | YES, 3600s |
| journey-poll (includes dispatch-journey-events) | JOURNEY_POLL_QUEUE | S5 | accessLinkStore.listActive (SIR polling adapter), notificationStore, subscriptionStore, webPush | access links, notifications, push subs: Postgres | SIR polling adapter and web-push port are stubs | YES, 60s |
| push-subscription-purge (destructive) | PUSH_SUBSCRIPTION_PURGE_QUEUE | S5 | subscriptionStore.listExpired/deleteById, pii audit | push subs + pii audit: Postgres | none | YES, 3600s |
| pulse-staff-alert-dispatch | STAFF_ALERT_DISPATCH_QUEUE | S5 | staffAlertStore.listPending/updateStatus, staffAlertPort | staff alerts: Postgres | staff-alert port is a stub | YES, 60s |
| pulse-purge (destructive) | PULSE_PURGE_QUEUE | S5 | pulseResponseStore + staffAlertStore listPastPurgeAfter/deleteById, pii audit | pulse responses, staff alerts, pii audit: Postgres | none | YES, 3600s |

Re-verified at S5 against `startWorker` and each job module: all six `queueClient.work(QUEUE, async () => { await runXxxJob(deps) })` handlers ignore the payload. Intervals come from `*_INTERVAL_SECONDS` env vars (zod positive integer). Per-process rate limiters are unchanged.

Content has no worker job. Registration is guarded by go-live guards inside `startWorker` (they throw at boot, before any scheduling).


### S5 evidence
- T1 commit f357321. T2 commits 0b2cbff (env vars), 4e786dd (6 schedule functions), a51cfb7 (`worker-schedulers.ts` + main-worker wiring). RED observed first: 8 failing tests (6 schedule fns + 2 env) with the draft implementations reverted, then GREEN (226 tests in the touched dirs); `worker-schedulers.test.ts` RED (module missing) then 3 GREEN. Full bff suite with TEST_DATABASE_URL: 136 files / 1103 tests passed; tsc and eslint clean; turbo typecheck/lint/test for bff, web, contracts, e2e: 13/13 tasks; E2E container: 20 passed.
- T3 compose (worker with 3s intervals via a temporary, deleted docker-compose.override.yml; no flags needed because the worker registers all 10 jobs regardless of flags; no manual enqueue): within the first 4s poll, the expired push subscription, pulse response and staff alert were purged, the past-due precheckin submission was `purged` with key material zeroed, the pending alert became `sent`; 4 `pii_access_audit` rows (push/pulse/staff_alert/precheckin purge); future rows kept; the precheckin-handoff job completed repeatedly while the future-due submission stayed `received` (stub document store, no handoff). Worker log had no errors. Rows cleaned (audit via `session_replication_role = replica`), default stack restored (no override, 0 INTERVAL vars).
- Not scheduled: sample-job (fixture). Not fixed (stubs): precheckin document/ciphertext store and handoff port, SIR polling adapter, web-push and staff-alert ports, per-process rate limiters, no purge job for expired sessions/access links.
