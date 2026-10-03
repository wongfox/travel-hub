# Feature: Fix the two HIGH code-review findings (PR #19, PR #22)

## Objective
Verify and fix the two high-severity findings from the /code-review runs, each as a commit on its own PR branch, then restack the later branches.

## Findings (reviewer claims, to be verified against code)
- PR #19 (`feat/travel-hub-mvp-19-wifi-activation-web`): `main-worker.ts` passes no `orderStore`, so the worker's WiFi jobs read a separate in-memory store and never see API orders; nothing enqueues `wifi-entitlement-activation` / `wifi-sir-receipt`.
- PR #22 (`feat/travel-hub-mvp-22-analytics-privacy`): `main-api.ts` falls back to a hardcoded public HMAC secret for `trip_hash` when `ANALYTICS_TRIP_HASH_SECRET` is unset, including in production.

## Constraints
Strict TDD; no push/PR changes by the agent (user force-pushes with lease); backup refs before any history rewrite; no TLS weakening; no sudo.
Route: delegated direct, one writer.

## Tasks
- [x] T1 Verify the #22 finding; fix (production must fail fast without the secret; dev-only fallback stays) on the 22 branch.
- [x] T2 Verify the #19 finding; fix what is in scope (fail-fast guard for non-shared stores in production + job scheduling if confirmed); report the Postgres-adapter gap honestly if it cannot be closed in a small change.
- [x] T3 Restack branches above each fix; verify tree equality except the fixes and that suites pass on the tip.

## Progress / evidence
- TDD: strict. Runner: `pnpm --filter bff exec vitest run --no-file-parallelism`. Route: delegated direct (one writer).
- T1 verified TRUE (composition-root.ts and main-api.ts both fell back to the public dev secret). RED: 2 failing tests (prod/staging did not throw); GREEN after `analytics.nodeEnv` + `isProductionLike` guard. Commit da1459e (was 30899ca pre-restack) on branch 22. Branch 23 commit 1f1a356 injects the secret into the ECS api task and sets a dev value in docker-compose (compose runs NODE_ENV=development, so it was never at risk).
- T2 verified PARTLY TRUE: worker/api used separate in-memory order stores (true); nothing enqueued the wifi queues (true; all scan jobs deferred to an unbuilt scheduler). RED: 4 failing tests. GREEN: guard in buildApp/startWorker (191d38d) and `scheduleWifiOrderScans` wired in main-worker (25d73b2) on branch 19. NOT fixed: Postgres-backed WifiOrderStore (gap C), so a production deploy with wifi.checkout on now fails at boot instead of silently dropping orders.
- T3 restack: backup/pre-restack-20261003-003157; conflicts in main-worker.ts (imports, branch 20) and composition-root.test.ts (appended describes, branch 23), both resolved by keeping both sides. Tree diff vs backup shows only fix files.
- Verification on tip: turbo typecheck/lint/test for bff, web, contracts, e2e: 13/13 successful (bff 748 tests); E2E docker run: 20 passed.
- Other scan jobs (handoff, purges, push, pulse, analytics) remain unscheduled; only wifi is scheduled.
