# Feature: Runtime feature-flag overrides (Gap B)

## Objective
Operators can switch feature flags on per environment without a code change, so features like `wifi.checkout`, `push.enabled`, `pulse.*`, `precheckin.*`, `menu.enabled`, `destination.enabled` can be served by the real api/worker (docker compose and production), while every go-live guard keeps enforcing its prerequisites.

## Why
`FLAG_DEFAULTS` ships these flags off and `main-api.ts` / `main-worker.ts` never pass a `flags` option, so the deployed stack cannot serve them (e2e/KNOWN-GAPS.md Gap B). The only override path today is the E2E in-process harness.

## Scope
- In: a validated override source read at process start by BOTH api and worker (design to be chosen after exploration; KNOWN-GAPS suggests env-var JSON, e.g. `FEATURE_FLAG_OVERRIDES`), unknown keys / non-boolean values rejected at boot, docker-compose and infra wiring, docs.
- Out: a flag admin UI/API, per-passenger rollout, changing any default value, weakening or bypassing `config/go-live-guards.ts`.

## Constraints
Strict TDD (bff: `pnpm --filter bff exec vitest run --no-file-parallelism`); overrides must flow through the same go-live guards (an enabled flag with missing prerequisites must still fail boot); no secrets in overrides; no TLS weakening, no sudo; agent must not push or touch PRs. Route: delegated direct, one writer. Branch `feat/travel-hub-mvp-30-feature-flag-overrides` (on top of 29).

## Tasks
- [x] T1 Explore flags/guards/env conventions; choose and document the override mechanism and precedence (defaults < override).
- [x] T2 Implement parsing/validation + wiring in `main-api.ts` and `main-worker.ts` (same source for both processes).
- [x] T3 Prove the guards still bite with overrides on (tests per guarded flag) and that api and worker agree.
- [x] T4 docker-compose (documented dev values, defaults unchanged) and infra env plumbing.
- [x] T5 (partially provable, see evidence) Real check: compose stack with `wifi.checkout` on; update KNOWN-GAPS/docs. NOT done: authenticated 200 on packages and API-created order advanced by worker (blocked by Gap A, no token-exposing route by design).

## Acceptance
RED-first tests per task, turbo typecheck/lint/test green, real compose evidence, E2E container run still 20 passed, one commit per task.

## Progress / evidence
### Decision (T1)
Mechanism: env var `FEATURE_FLAG_OVERRIDES` = JSON object of known flag keys to booleans, parsed once in `config/env.ts` (via `parseFlagOverrides` in `config/flags.ts`) so api and worker share one validated source; precedence `FLAG_DEFAULTS` < overrides (`resolveFlags`). Overrides feed the existing `flags` options (api: `trip.flags`, the root every module falls back to; worker: each module's `flags`), so every go-live guard runs unchanged on the resolved values.
Why not the `feature_flag` table: it has a schema but no reader/adapter/migration seeding; guards and route registration run synchronously at boot, so reading it would need async DB I/O in both processes plus a write path with guard checks (admin API is out of scope); an env var is deployable per environment (compose, ECS task env) with no new moving parts. Table remains reserved for future runtime kill switches.
Exploration findings: `FLAG_DEFAULTS` passed explicitly by main-worker (all 4 modules); main-api passed nothing; precheckin.production_collection is only guarded in the worker; `tier.theming`/`offline.content` have guard functions but no consumer in composition-root.
Route: delegated direct (single writer). TDD: enabled (strict), runner `pnpm --filter bff exec vitest run --no-file-parallelism`.


### Evidence
- Route per task: delegated direct, one writer (this agent), inline edits; no SDD artifacts.
- T1 8cf2d6c (decision doc). T2 e2cf86a: RED = `vitest src/config/flags.test.ts env.test.ts` 10 failed (parseFlagOverrides not a function / FEATURE_FLAG_OVERRIDES undefined); GREEN = config suite 64 passed; tsc + eslint clean. main-api passes `trip: { flags }`, main-worker `flags` to all 4 modules from `resolveFlags(env.FEATURE_FLAG_OVERRIDES)`.
- T3 2c9e246: `config/flag-overrides-go-live.test.ts` (14 tests) pass; mutation check (evaluateGoLiveGuard forced allow) -> 10 failed, restored. api guarded: menu, destination, wifi, push, pulse.capture, pulse.staff_alerts; worker: precheckin.production_collection, wifi, push, pulse.staff_alerts. `tier.theming`/`offline.content` have guard fns but no composition consumer (untested at boot).
- T4 9158c15: compose `FEATURE_FLAG_OVERRIDES: ${FEATURE_FLAG_OVERRIDES:-}` in shared anchor; infra var `feature_flag_overrides` (default "", json validation) in both ECS tasks. terraform binary not available: not validated.
- T5 compose (Windows docker needs `WSLENV=FEATURE_FLAG_OVERRIDES`): flag on -> bff-api and bff-worker env `{"wifi.checkout":true}`; `GET :3000/api/wifi/packages` 401 link_expired (flag off: 403 feature_disabled), same via web :8080 after restarting web (stale nginx upstream after recreate). Boot failures verified in containers: unknown key, non-boolean, bad JSON -> exit 1 with clear error; NODE_ENV=production + wifi.checkout -> GoLiveGuardError in api and worker. `POST /internal/links` returns 201 with only accessLinkId/expiresAt (token only via stub delivery) -> no session, no order. Stack reset to default (var unset): 403 on both ports.
- Final: turbo typecheck/lint/test 13/13 successful (bff 785 passed, 14 DB skipped by turbo env); DB tests with TEST_DATABASE_URL: 33 passed; E2E container: 20 passed.
