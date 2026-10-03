# Feature: Pre check-in web route (Gap D)

## Objective
A passenger can reach and complete pre check-in in the web app: a `/trip/precheckin` page that composes the existing consent gate + capture flow (tasks 8.1/8.2) with passenger selection and the task 8.3 submission call, gated by the `precheckin.capture_ui` flag.

## Problem / why
`PrecheckinCaptureFlow` exists and is unit-tested but `apps/web/src/app/route-tree.tsx` registers no route and no `precheckin-page` container composes it, so no URL reaches pre check-in; E2E scenario 05 is `test.fixme()` (e2e/KNOWN-GAPS.md Gap D).

## Constraints
- Strict TDD (bff: `pnpm --filter bff exec vitest run --no-file-parallelism`; web: `pnpm --filter web exec vitest run`; contracts rebuild after export changes).
- Same container/presentational style as wifi/push/pulse pages; i18n in es/en/pt (parity test); any new consent/legal copy is provisional and marked `TODO(legal)`.
- Biometric data: never log or cache image bytes beyond what 8.x already specifies; the precheckin consent is never cached (existing wrapper rule).
- Do not change production defaults: `precheckin.capture_ui` stays default-off; go-live guards untouched. No TLS weakening, no sudo, no push/PR.
- Route: delegated direct, one writer.

## Tasks
- [x] T1 Read specs/tasks 8.1-8.5 + existing code; record the exact contract of the submission API and what the BFF exposes to the web (flag, consent text version, passenger list); expose any missing piece additively (Strict TDD).
- [x] T2 `PrecheckinPage` container + route, flag-gated, passenger selection, consent gate -> capture -> submit -> success/error states; i18n es/en/pt.
- [x] T3 Entry point from trip home (link/CTA) only when the flag is on.
- [x] T4 E2E scenario 05 un-fixme'd (fake media stream + file fallback) via the in-process harness; run in the Playwright container.
- [x] T5 Update KNOWN-GAPS.md / README; final turbo + E2E run.

## Acceptance
RED-first unit tests per task, turbo typecheck/lint/test green, E2E container run with honest counts, one commit per task.

## Progress / evidence
Resolved mode: Strict TDD (vitest; bff `--no-file-parallelism`, web, contracts); route: delegated direct, one writer (this agent).

Contract found (T1): `POST /api/precheckin/:passengerOrdinal` multipart (`photo`, `id_front` required, `id_back` optional, `docType` in DNI|PASSPORT|OTHER, `consentRecordId`); 403 `feature_disabled` unless `precheckin.production_collection`, 403 `consent_required`, 403 `out_of_scope`, 409 `already_submitted`, 201 `{passengerOrdinal,status}`. Per-passenger by ordinal. Web sources: `trip.features.precheckinCaptureUi`, `trip.passengers[].precheckinStatus`. Missing for the web (added additively): `consentTextVersions.precheckin` (from `PRECHECKIN_CONSENT_TEXT_VERSION`, omitted if unset) and `ConsentState.recordId` (the id the web echoes as `consentRecordId`).

- T1 de714d7 feat(bff): expose precheckin consent version + consent recordId. RED: contracts 2 failed, bff 4 failed; GREEN: contracts 104/104, bff 738/738, tsc ok, eslint ok.
- T2 60ed103 feat(web): PrecheckinPage + /trip/precheckin. RED: missing modules + 2 failing client/gate tests + 2 router tests; GREEN: web 358/358, tsc ok, eslint 0 errors.
- T3 779167c home CTA only when flag on AND consent version published. RED 1 failed -> GREEN web 359/359.
- Extra 45a22df fix(web): camera capture button enabled only after video `loadeddata` (E2E exposed a real race: early click -> 0x0 canvas, silent failure). RED 1 failed -> GREEN.
- T4 ec17826 e2e scenario 05 un-fixme'd, harness enables precheckin.capture_ui + production_collection (E2E only) + consent version + exposes submission store. Containerized chromium run: 2 passed.
- T5 d12cce2 KNOWN-GAPS/README. Final: turbo typecheck lint test (bff 738, web 359, contracts 104) green on rerun (first run: web load timeouts, 5 tests incl. unrelated; alone 359/359 pass); E2E full run in Playwright image: 20 passed, 0 skipped.

Decisions: per-passenger (API dictates); consent asked per passenger/visit, never cached; docType chosen by passenger (no default); id_back not collected; CTA requires flag && published consent version; harness-only enabling of production_collection.

Provisional copy (TODO(legal)): precheckin.page.* (heading, unavailable, choosePassenger, start, status.*, received, choose, statusOnly), precheckin.submit.* (docTypeLabel, docTypeChoose, docTypes.*, submit, submitting, error, unavailable), nav.precheckin; existing precheckin.consent.* unchanged. All in es/en/pt.
