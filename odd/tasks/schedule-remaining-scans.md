# Feature: Schedule the remaining worker scan jobs

## Objective
The worker periodically enqueues the remaining registered-but-unscheduled scan jobs (precheckin handoff, precheckin purge, push-subscription purge, pulse purge, staff-alert dispatch, journey poll — to be confirmed against the real queue list), reusing `scheduleQueueScans` (branch 32), each with a configurable interval and a stop on shutdown.

## Why
Only the wifi and analytics scans are scheduled. Every other job is registered on the worker but nothing enqueues it, so retention purges, handoff delivery, staff alerts and push polling never run on their own in production.

## Scope
- In: one scheduling call per confirmed unscheduled job via the existing helper; env-configurable intervals (validated, safe defaults); wiring only when the job is registered; shutdown stop; unit tests (RED first); docs/KNOWN-GAPS.
- Out: Postgres adapters for the stores those jobs read (push subscriptions, pulse, staff alerts, precheckin submissions, access links remain in-memory per process — scheduling them is useful only once stores are shared; document this precisely per job); changing job semantics.

## Constraints
Strict TDD; natural-key dedupe via `sendIdempotent`; destructive jobs (purges) must keep their existing per-item isolation and `pii_access_audit` behavior untouched; no TLS weakening, no sudo; agent must not push or touch PRs. Route: delegated direct, one writer. Branch `feat/travel-hub-mvp-33-schedule-remaining-scans` (on top of 32).

## Tasks
- [x] T1 Inventory: list every queue the worker registers vs which are scheduled; for each unscheduled one record which stores it reads and whether they are shared (Postgres) or per-process in-memory.
- [ ] T2 Schedule each confirmed job with the helper + env intervals + tests; wire shutdown stop.
- [ ] T3 Real check on compose (worker boots, schedulers tick without errors, no crash on empty stores) + docs/KNOWN-GAPS with the per-job caveat.

## Progress / evidence
### T1 inventory (verified in composition-root.ts `startWorker` + each job module)
All six `queueClient.work(QUEUE, async () => { await runXxxJob(deps) })` handlers ignore the payload, so each is a genuine payload-free periodic scan.

| Queue | Const | Scheduled today | Reads/writes | Store backing in worker today | Schedule? |
|---|---|---|---|---|---|
| sample-job | SAMPLE_JOB_QUEUE | no | test fixture (noop executor) | none | NO (fixture) |
| wifi-entitlement-activation, wifi-sir-receipt | WIFI_* | yes (branch 32) | wifi orders | Postgres | already |
| analytics-forward | ANALYTICS_FORWARD_QUEUE | yes (branch 32) | analytics events + consent | Postgres | already |
| precheckin-handoff | PRECHECKIN_HANDOFF_QUEUE | no | submissionStore.listPendingHandoff/markHandedOff, documentStore.get | in-memory submission store (per process), doc store stub | YES, 60s |
| precheckin-purge (destructive) | PRECHECKIN_PURGE_QUEUE | no | submissionStore.listPastPurgeAfter/markPurged, documentStore.delete, pii audit | in-memory submission store, doc store stub, in-memory pii audit | YES, 3600s |
| journey-poll (includes dispatch-journey-events) | JOURNEY_POLL_QUEUE | no | accessLinkStore (via SIR polling adapter), notificationStore, subscriptionStore, webPush | in-memory access links, notifications, push subs; stub SIR/webPush | YES, 60s |
| push-subscription-purge (destructive) | PUSH_SUBSCRIPTION_PURGE_QUEUE | no | subscriptionStore.listExpired/deleteById, pii audit | in-memory push subs + pii audit | YES, 3600s |
| pulse-staff-alert-dispatch | STAFF_ALERT_DISPATCH_QUEUE | no | staffAlertStore.listPending/updateStatus, staffAlertPort | in-memory staff alerts; stub port | YES, 60s |
| pulse-purge (destructive) | PULSE_PURGE_QUEUE | no | pulseResponseStore + staffAlertStore listPastPurgeAfter/deleteById, pii audit | in-memory pulse responses + staff alerts + pii audit | YES, 3600s |

Content has no worker job. Registration is guarded by go-live guards inside `startWorker` (they throw at boot, before any scheduling).

