# Feature: Push and pulse consent UI (Gap E)

## Objective
The web records `push` and `pulse` consent through `POST /api/consents` before those flows call the BFF, so the 403 `consent_required` no longer blocks real passengers.

## Problem / why
`PushOptIn` and `PulsePage` call APIs that require a recorded consent, but the web has no consent UI for them and no source for the consent text version. Scenarios 06/07 work around it with `grantConsent()` (e2e/fixtures/passenger-api.ts).

## Decisions (user-approved)
- Provisional es/en/pt copy marked `TODO(legal)`; legal replaces it before production.
- Text version comes from the BFF (env `PUSH_CONSENT_TEXT_VERSION` / `PULSE_CONSENT_TEXT_VERSION`), not hard-coded in the web.
- Out of scope: `analytics` consent, withdrawal UI, a GET consent endpoint (reload persistence = localStorage cache of granted purpose+version).

## Constraints
Strict TDD (bff: `pnpm --filter bff exec vitest run --no-file-parallelism`; web: `pnpm --filter web exec vitest run`; contracts need `pnpm --filter contracts build` after export changes). No TLS weakening, no sudo, no push/PR. Gap D stays open. Route: delegated direct, one writer.

## Tasks
- [x] T1 BFF+contracts: expose consent text versions to the web (additive, no PII).
- [x] T2 Shared purpose consent gate generalizing the pre check-in gate (pre check-in stays a thin wrapper with its tests green); provisional i18n es/en/pt.
- [x] T3 Push: gate before the browser permission prompt; 403 `consent_required` re-shows the gate.
- [x] T4 Pulse: gate before the first prompt request; 403 handled.
- [x] T5 E2E: use the real UI for scenario 07 (and 06 where feasible), drop `grantConsent` workarounds, update KNOWN-GAPS; run in the Playwright container.

## Acceptance
Unit tests per task (RED first), turbo typecheck/lint/test green, E2E container run with honest counts, one commit per task.

## Progress / evidence
- T1 done, commit 2a5b110: optional `consentTextVersions {push?, pulse?}` on TripDTO (GET /api/trip). RED observed (contracts 2 failed, bff 2 failed), GREEN: contracts 102 tests, bff 736 tests, tsc ok. Route: delegated direct (one writer).
- T2 done, commit c9f44a1: `shared/consent/{consent-cache,purpose-consent-screen,purpose-consent-gate,submit-consent}`; PrecheckinConsentGate/ConsentScreen are thin wrappers (no cacheScope, so biometric consent is never cached). RED observed (module not found), GREEN: web 330 tests, tsc, eslint ok.
- Provisional copy needing legal review (`TODO(legal)`; JSON has no comments, marked in purpose-consent-screen.tsx/gate): `consent.push.{title,body,accept,decline,declined,error}` and `consent.pulse.{title,body,accept,decline,declined,error}` in es/en/pt common.json.
- T3 done, commit 78541e7: PushOptIn renders the consent gate before the enable button and `subscribeToBrowserPush`; 403 `consent_required` (ApiError.code) re-shows the gate; PushPage needs `consentTextVersions.push` else shows unavailable. RED observed (8 failed), GREEN: push 14 tests.
- T4 done, commit 1b6f467: PulsePage gates PulsePrompt, the `/api/pulse/prompt` nudge and answer submission behind the gate; 403 on submit/prompt re-shows the gate; no version -> unavailable; declined -> calm message. RED observed (5 failed), GREEN: pulse 13 tests; web 341 tests.
- T5 done (commit below): harness publishes `e2e-push-1`/`e2e-pulse-1` versions; scenario 07 uses the real UI (accept, then enable), no `grantConsent`. Scenario 06 keeps `grantConsent("pulse")`: no seeded reservation has a COMPLETED leg, so `/trip/pulse` cannot render its gate. First container run found one failing locator in 07 (two matching headings), fixed; final run: 18 passed, 2 skipped (scenario 5, gap D), 0 failed. Route: delegated direct, one writer.
- Final: `turbo run typecheck lint test --filter=bff --filter=web --filter=contracts --filter=e2e` 13/13 successful (contracts 102, bff 736, web 341 tests).
