# Feature: Postgres-backed ConsentStore and AnalyticsEventStore

## Objective
Postgres implementations of the consent store and the analytics event store, shared by `bff-api` and `bff-worker` through the same `DATABASE_URL`, so (a) consent recorded by the API is visible to the worker, and (b) analytics events written by the API are forwarded by the worker's forward job, which currently forwards nothing because each process has a private in-memory store.

## Why
Medium/low review fixes (branch 22) made the forward job fail closed: it only forwards rows whose reservation has a granted `analytics` consent, re-checked through `ConsentStore.listLatestByPurpose`. With per-process in-memory stores the worker sees no consent and no events. This feature removes that root cause. Same pattern as the WiFi order store (branch 29).

## Scope
- In: schema + migration for consent records and analytics events (reuse the foundational `consent_record` table from task 3.3 if it fits the port; otherwise extend it), Postgres adapters for `ConsentStore` and `AnalyticsEventStore` (incl. all-or-nothing `createMany`, withdrawal deletion by `tripHash`, pending listing for forwarding), a conformance suite run against in-memory AND Postgres, wiring in `main-api.ts` / `main-worker.ts`, docs/KNOWN-GAPS update, real api+worker check on the compose stack.
- Out: other in-memory stores (push subscriptions, pulse, staff alerts, access links, ...), changing consent semantics, scheduling the analytics forward job in production (report whether it is scheduled; do not invent a scheduler unless trivial and consistent with `scheduleWifiOrderScans`).

## Constraints
Strict TDD (bff: `pnpm --filter bff exec vitest run --no-file-parallelism`; DB tests with `TEST_DATABASE_URL`); follow the conventions introduced by branch 29 (drizzle client factory, migration runner, `bff-migrate` compose step, conformance-suite pattern); `analytics_event` stores only the pseudonymous `trip_hash` (never a reservation reference); consent records stay append-only, latest wins; no TLS weakening, no sudo; agent must not push or touch PRs. Route: delegated direct, one writer. Branch `feat/travel-hub-mvp-31-consent-analytics-store-postgres` (on top of 30).

## Tasks
- [x] T1 Explore: existing ports/in-memory stores/callers (privacy, analytics, record-consent cascade, forward job, record-analytics-events), schema from 3.3, branch-29 conventions; record exact contracts.
- [x] T2 Consent store: schema/migration (if needed) + Postgres adapter + conformance suite (in-memory and Postgres).
- [ ] T3 Analytics event store: schema/migration + Postgres adapter + conformance suite (in-memory and Postgres).
- [ ] T4 Wire both in `main-api.ts` and `main-worker.ts` (same DATABASE_URL; production guards unchanged; pools closed on shutdown).
- [ ] T5 Real check on the compose stack: consent + analytics written through the api path are read by the worker (forward job against the stub sink), plus docs/KNOWN-GAPS.

## Acceptance
RED-first tests per task, conformance suites green on both implementations, turbo typecheck/lint/test green, real compose evidence, E2E container run still 20 passed, one commit per task.

## Progress / evidence
### T1 contracts and conventions (observed by reading the code)

Route: delegated direct, single writer (this agent). TDD: strict (project setting), runner `pnpm --filter bff exec vitest run --no-file-parallelism` with `TEST_DATABASE_URL=postgres://travel_hub:travel_hub@localhost:5432/travel_hub_test`.

**ConsentStore port** (`modules/privacy/consent-store.ts`): `record(input)` appends (id uuid, `recordedAt` ISO string) and returns `ConsentRecordEntry {id, linkId, reservationRef, passengerRef|null, purpose, textVersion, granted, recordedAt}`; `findLatest(reservationRef, passengerRef|null, purpose)` -> latest or null (ties: last appended wins, in-memory uses `>=`); `listLatestByPurpose(purpose)` -> latest per reservation at reservation scope (`passengerRef null` only, granted or withdrawn). Append-only, never update/delete. Callers: `recordConsent` (cascade), `assertConsentGranted` (findLatest), analytics recorder/`recordAnalyticsEvents` (findLatest), forward job (listLatestByPurpose).

**AnalyticsEventStore port** (`modules/analytics/ports.ts`): `create`, `createMany` (all-or-nothing), `listPendingForward` (forwardedAt null, insertion order), `markForwarded(ids, iso)`, `deletePendingByTripHash(hash)` -> count (forwarded rows kept), `list()` (insertion order). Record: `{id, name, tripHash, occurredAt, props?, createdAt, forwardedAt|null}`; structurally no reservation reference. Forward job deletes pending rows of unconsented trips, forwards the granted ones in one batch, then `markForwarded`.

**Existing schema** (`infra/db/schema.ts`, migration 0000): `consent_record(id uuid pk, link_id uuid NOT NULL FK access_link.id, reservation_ref, passenger_ref null, purpose enum, text_version, granted, recorded_at timestamptz default now())`. Decisions: it fits the port columns, so it is REUSED, but two things block a shared Postgres store and need a migration: (1) the `link_id -> access_link(id)` FK cannot hold, because access links/sessions are still process-local in-memory stores (out of scope), so every consent insert would violate the FK; the column stays (uuid, audit reference) without the FK. (2) `recorded_at` has no total order inside one transaction/clock tick, so "latest wins" needs a monotonic `seq bigint GENERATED ALWAYS AS IDENTITY` (same device as `wifi_order_event.seq`) plus an index `(reservation_ref, purpose, seq)`. `analytics_event` does not exist yet: new table with only `trip_hash`.

**Branch-29 conventions to copy**: `createDb(DATABASE_URL)` handle (`infra/db/client.ts`) built in `main-api.ts` and `main-worker.ts`, closed on `app.onClose` / worker shutdown; migrations generated by `drizzle-kit generate` (`pnpm --filter bff db:generate`) and applied by `runMigrations` / compose `bff-migrate`; adapter `adapters/<name>/postgres.ts` taking `Db` (+ optional clock); conformance suite `modules/<m>/<name>.conformance.ts` exporting `describeXContract(name, harness, {skip})`, run by `<name>.test.ts` (in-memory) and `adapters/<name>/postgres.test.ts` (TRUNCATE in `make`, `describe.skipIf(!TEST_DATABASE_URL)`, warning from `infra/db/test-database.ts`); composition-root takes optional injected stores (E2E harness injects its own) and has a production guard for the wifi order store only.

**Forward job scheduling**: `registerForwardAnalyticsEventsJob` only registers a pg-boss worker on `analytics-forward`; nothing in `main-worker.ts` enqueues that queue (the wifi scan scheduler `scheduleWifiOrderScans` only covers the two wifi queues), so in production topology the job never runs. Decision deferred to T4/T5.

## Progress / evidence
- T1: contracts recorded above (commit: see git log).

- T2 (commit: see git log): REUSED `consent_record`; migration `0002_consent_record_shared_store` drops the `link_id -> access_link` FK (access links are in-memory, FK would reject every insert) and adds identity `seq` + index `consent_record_latest_idx(reservation_ref, purpose, seq)`. Adapter `adapters/consent-store/postgres.ts` (INSERT-only; findLatest ORDER BY seq DESC; listLatestByPurpose DISTINCT ON reservation_ref, passenger_ref IS NULL). Conformance `modules/privacy/consent-store.conformance.ts` (8 cases) run by in-memory and Postgres. RED: migration tests failed (2) and `postgres.test.ts` failed to import the missing adapter, before the schema/adapter existed. GREEN: 58 passed in privacy+adapters/consent-store+infra/db with TEST_DATABASE_URL. Mutation: flipping `findLatest` to ORDER BY seq ASC made 4 Postgres conformance cases fail (append-only/latest-wins/same-tick/concurrent); restored. tsc + eslint clean.
