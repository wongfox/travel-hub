# Program: Shared Postgres stores so the scheduled worker jobs actually work

## Objective
Every store read or written by a periodic worker scan job is Postgres-backed and shared by `bff-api` and `bff-worker` (same `DATABASE_URL`), so scheduling those jobs (final slice) has real effect in the production topology instead of running over per-process in-memory stores.

## Why
Branch 33's inventory (`odd/tasks/schedule-remaining-scans.md`, commit 941e122 on the scheduling branch) shows that precheckin handoff/purge, journey-poll, push-subscription purge, staff-alert dispatch and pulse purge read stores that are still in-memory per process. The user asked to make that work first, then schedule.

## Slices (one branch + one PR each, stacked in this order, all Strict TDD; same pattern as branches 29/31: drizzle schema + migration, Postgres adapter, shared conformance suite run against in-memory AND Postgres incl. a mutation check, wiring in `main-api.ts`/`main-worker.ts`, production guard like `assertSharedAnalyticsStores`, real compose check, KNOWN-GAPS update)
- [ ] S1 `feat/travel-hub-mvp-33-postgres-push-notification-audit-stores`: `pii_access_audit` store (table exists from task 3.3), push subscription store, notification store.
- [ ] S2 `feat/travel-hub-mvp-34-postgres-pulse-staff-alert-stores`: pulse response store, staff alert store.
- [ ] S3 `feat/travel-hub-mvp-35-postgres-precheckin-submission-store`: precheckin submission store (document/ciphertext store stays a stub: it is a vendor/object-storage integration, out of scope).
- [ ] S4 `feat/travel-hub-mvp-36-postgres-access-link-session-stores`: access link store + session store (trip-access); security-sensitive: only token HASH stored, TTL/rotation/`superseded_by` semantics preserved, existing threat-matrix tests stay green.
- [ ] S5 `feat/travel-hub-mvp-37-schedule-remaining-scans` (already has the inventory commit; WIP in a git stash): rebase on S4's tip, re-apply the stash, finish scheduling with the shared helper, remove the "in-memory per process" caveats from KNOWN-GAPS.

## Constraints
- No token-exposing route; no TLS weakening; no sudo; agents must not push or touch PRs; migrations must apply cleanly on top of the previous slices' (0001..0003).
- PII: stores must keep the existing minimal-PII shapes (`StaffAlertPayload.strict()`, no image bytes, no raw tokens); retention columns (`purge_after`, `expires_at`) indexed for the purge scans.
- Out of scope: real vendor adapters (object storage, web-push provider, staff-alert channel), changing job semantics.

## Progress / evidence

### S1 sub-tasks (route: delegated direct, single writer; Strict TDD, runner `pnpm --filter bff exec vitest run --no-file-parallelism` with `TEST_DATABASE_URL=postgres://travel_hub:travel_hub@localhost:5432/travel_hub_test`)
- [ ] S1-T1 contracts/conventions recorded (this section)
- [ ] S1-T2 `pii_access_audit` store (migration 0004 + adapter + conformance)
- [ ] S1-T3 push subscription store (migration + adapter + conformance)
- [ ] S1-T4 notification store (migration + adapter + conformance)
- [ ] S1-T5 wiring api + worker + production guards + compose
- [ ] S1-T6 real compose check + KNOWN-GAPS

### S1-T1 contracts (observed by reading the code)
- **PiiAccessAuditPort** (`infra/audit/pii-access-audit.ts`): `record({actor, action, subjectType, subjectId}) -> {..., id, at}`; append-only, no read API (in-memory exposes `entries` for tests). Writers: api privacy withdrawal cascade (`record-consent`), worker precheckin handoff/purge, push-subscription purge, pulse purge. Existing table `pii_access_audit(id, actor, action, subject_type, subject_id, at)` fits; no FK. Decision: add identity `seq` (total order; `at` ties inside a clock tick) + index `(subject_type, subject_id, seq)`, and a DB trigger that rejects UPDATE/DELETE (append-only enforced by Postgres, not just by the adapter having no update method).
- **PushSubscriptionStore** (`modules/notifications/ports.ts`): `create`, `findById`, `findActiveByReservation` (expires_at > clock), `deleteById`, `deleteByLinkId`, `deleteByReservation`, `listExpired(asOf)` (expires_at <= asOf). Record holds endpoint/p256dh/auth (sensitive: stored only, never logged). New table `push_subscription`: `link_id` and `consent_record_id` are uuid audit references WITHOUT foreign keys (access links are still in-memory until S4, so an FK to `access_link` would reject every insert, same as `consent_record.link_id` in branch 31; the consent FK is skipped to keep the stores decoupled). Identity `seq` for insertion order; indexes on `reservation_ref`, `link_id`, `expires_at` (purge scan).
- **NotificationStore**: `create` (rejects a repeated `dedupeKey` with `DuplicateNotificationError`, never overwrites), `findByDedupeKey`, `updateStatus(id, status, sentAt?)` (increments `attempts` on every call, sets `sentAt` only when given; unknown id is a no-op). New table `notification` with `UNIQUE(dedupe_key)`; Postgres enforces it via `ON CONFLICT DO NOTHING` (race-safe, no read-then-write); `channel`/`status` are closed sets -> pg enums.
- Conventions copied from branches 29/31: `createDb` handle shared by api/worker and closed on shutdown; `drizzle-kit generate` migrations; `adapters/<name>/postgres.ts` taking `Db` (+ clock); `*.conformance.ts` run by in-memory and Postgres (`skipIf(!TEST_DATABASE_URL)`, warning from `infra/db/test-database.ts`), each with a mutation check; production guard like `assertSharedAnalyticsStores`, only when the feature flag is on.
