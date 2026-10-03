# Feature: E2E suite with an in-process BFF

## Objective
Let the Playwright suite (`e2e/`) run real scenarios without exposing link tokens through any HTTP route, by starting its own BFF in-process with stub adapters injected and reading link deliveries directly.

## Problem / why
`e2e/KNOWN-GAPS.md` gaps A (no way to read an issued link's token), B (feature flags have no runtime override), C (api/worker don't share in-memory stores) leave most scenarios `test.fixme()`. A dev-only token-inspection route was rejected by the user as a security risk; the user chose the in-process BFF instead.

## Scope / constraints
- No new HTTP route that exposes tokens; production code paths of trip-access unchanged.
- Never weaken TLS (no `NODE_TLS_REJECT_UNAUTHORIZED=0`); no sudo; no push/PR.
- Gap D (no pre check-in route in web) stays out of scope; scenario 05 stays fixme.
- Browsers cannot launch in WSL (no libnspr4); run inside the Playwright Docker image via the Windows docker.exe.
- Strict TDD for any `services/bff` code change (runner: `pnpm --filter bff exec vitest run --no-file-parallelism`).
- Route: delegated direct, one writer. Trigger: 2+ non-trivial files and preparatory reading.

## Tasks
- [x] T1 In-process harness: Playwright globalSetup starts `buildApp` + `startWorker` sharing stores (stub adapters, feature flags enabled, non-production env) and a static server for the built web bundle proxying `/api`, `/webhooks`, `/healthz` to it.
- [x] T2 `fixtures/internal-api.ts` `issueLink()` reads the stub LinkDelivery deliveries in-process.
- [x] T3 Run everything inside the Playwright Docker image (script + docs), no network needed at runtime.
- [x] T4 Un-fixme the scenarios this unblocks (01-04, 06-08); run them for real and fix scenario-logic bugs.
- [x] T5 Update `e2e/KNOWN-GAPS.md` and docs with the new status (A, B, C resolved for E2E; D open).

## Acceptance (met)
Scenarios un-fixme'd pass in the container run; pass/fail/skip counts reported honestly; commit per task (Conventional Commits).

## Progress / evidence
Route: delegated direct, one writer (the 2+ non-trivial files and preparatory-reading triggers fired).
TDD: strict for the two web production fixes (RED observed, then GREEN); no services/bff change.

- T1 b4286af: `e2e/harness/in-process-stack.ts` + worker-scoped `fixtures/stack.ts` (buildApp + startWorker, shared stores, flags, nodeEnv test, job-scan driver, static+proxy server mirroring nginx.conf).
- T2 b4286af: `issueLink(stack, ...)` calls `/internal/links` in-process and reads `StubLinkDelivery.deliveries`. Sanity spec 00 proves `/internal` is not reachable via the web origin and the token is never in a response.
- T3 d828de8: `e2e/scripts/run-in-docker.sh` + `e2e/README.md`; context in git-ignored `e2e/.docker-ctx`, shipped as one tar (docker.exe rejects pnpm symlinks in a context), `pnpm deploy --prod --offline`.
- T4 f4861df: scenarios 01-04, 06-08 un-fixme'd; 05 stays fixme (gap D). Real app bugs found and fixed with TDD: 4f485bb (web crashed on `-05:00` datetimes), 346c2b0 (no SW navigation fallback, offline deep link failed).
- T5 (this commit): KNOWN-GAPS.md rewritten (A,B,C resolved for E2E; D open; E consent gap found; F,G fixed).
- Evidence: `e2e/scripts/run-in-docker.sh` (Chromium, container): 18 passed, 2 skipped (scenario 5), run twice. turbo typecheck lint test (bff, web, contracts, e2e): 13/13 tasks green; bff 732 tests, web 315, contracts 100.
- Review: not run (RDD native review not requested in this delegation).
