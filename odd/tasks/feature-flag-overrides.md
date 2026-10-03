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
- [ ] T2 Implement parsing/validation + wiring in `main-api.ts` and `main-worker.ts` (same source for both processes).
- [ ] T3 Prove the guards still bite with overrides on (tests per guarded flag) and that api and worker agree.
- [ ] T4 docker-compose (documented dev values, defaults unchanged) and infra env plumbing.
- [ ] T5 Real check: compose stack with `wifi.checkout` on serves `GET /api/wifi/packages` and an API-created order is advanced by the worker (no throwaway process); update KNOWN-GAPS/docs.

## Acceptance
RED-first tests per task, turbo typecheck/lint/test green, real compose evidence, E2E container run still 20 passed, one commit per task.

## Progress / evidence
### Decision (T1)
Mechanism: env var `FEATURE_FLAG_OVERRIDES` = JSON object of known flag keys to booleans, parsed once in `config/env.ts` (via `parseFlagOverrides` in `config/flags.ts`) so api and worker share one validated source; precedence `FLAG_DEFAULTS` < overrides (`resolveFlags`). Overrides feed the existing `flags` options (api: `trip.flags`, the root every module falls back to; worker: each module's `flags`), so every go-live guard runs unchanged on the resolved values.
Why not the `feature_flag` table: it has a schema but no reader/adapter/migration seeding; guards and route registration run synchronously at boot, so reading it would need async DB I/O in both processes plus a write path with guard checks (admin API is out of scope); an env var is deployable per environment (compose, ECS task env) with no new moving parts. Table remains reserved for future runtime kill switches.
Exploration findings: `FLAG_DEFAULTS` passed explicitly by main-worker (all 4 modules); main-api passed nothing; precheckin.production_collection is only guarded in the worker; `tier.theming`/`offline.content` have guard functions but no consumer in composition-root.
Route: delegated direct (single writer). TDD: enabled (strict), runner `pnpm --filter bff exec vitest run --no-file-parallelism`.


