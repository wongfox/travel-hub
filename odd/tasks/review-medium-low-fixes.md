# Feature: Fix the medium/low code-review findings (PR #19, PR #22)

## Objective
Verify each remaining finding from the /code-review runs against the code, fix the true ones with a commit on the PR branch that owns the code, then restack the branches above.

## Findings (reviewer claims, to verify)
PR #19 (`feat/travel-hub-mvp-19-wifi-activation-web`):
- F1 medium: orders created with empty `legRef` / `buyerEmail` (`wifi-checkout/http.ts`); receipt job emits with empty email.
- F2 medium: SIR/receipt writes can undo REFUND_PENDING/REFUNDED (no compare-and-swap). ALREADY FIXED on branch 29 (CAS) — verify and only record, do not duplicate.
- F3 low: e-receipt line `description` is the internal `packageId`, not the package name.
- F4 low: wifi return-URL view shows the load-error when a refetch fails although data exists (`wifi-page.tsx`).
- F5 low: `formatPrice` hardcodes `es-PE` (`wifi-catalog.tsx`).
PR #22 (`feat/travel-hub-mvp-22-analytics-privacy`):
- F6 medium: `forward-analytics-events-job.ts` forwards pending rows without re-checking consent; nothing deletes them when `analytics` consent is withdrawn.
- F7 medium: web flush stalls forever on a failing/invalid batch (400/403) (`flush-analytics-queue.ts`).
- F8 medium: withdrawing analytics consent removes only the localStorage flag; queued IndexedDB events remain and are flushed later.
- F9 low: rows deleted when `sendBeacon` returns true (only means queued).
- F10 low: `wifi_package_selected`/`wifi_payment_attempted` re-recorded on idempotency-key replay (`create-wifi-order.ts`).
- F11 low: `resolveActiveSession` unguarded in TFE redirect (`outbound/http.ts`): store error -> 500.
- F12 low: `record-analytics-events.ts` non-atomic sequential save; retry duplicates events.
- F13 low: client-submittable analytics schema accepts server-only funnel names (`packages/contracts/src/analytics.ts`).

## Constraints
Strict TDD (RED first for each true finding); a false finding is reported with evidence, not "fixed"; privacy-sensitive choices (F6/F8/F9) pick the least-assumption behavior and are documented as decisions; no push/PR changes by the agent; backup refs before history rewrite; no TLS weakening, no sudo. Route: delegated direct, one writer.

## Tasks
- [x] T1 Verify all findings; record verdicts (see Verdicts).
- [x] T2 Fix true #19 findings on branch 19 (F1, F3, F4, F5).
- [x] T3 Fix true #22 findings on branch 22 (F6-F13).
- [x] T4 Restack branches above (20..30); verify suites, turbo, E2E (20 passed) on the tip.

## Verdicts (T1)
All TRUE except F2 (ALREADY FIXED). Evidence at branch 19/22 code before the fix:
- F1 TRUE: `wifi-checkout/http.ts` fell back to `legRef = ""` / `buyerEmail = ""` and still created the order; the receipt job then emitted with an empty email. Spec/design (engram `sdd/travel-hub-mvp/design-interfaces`) types `EReceiptPort.issue.buyerEmail` and `WifiEntitlementPort.grant.legRef` as required strings and is silent on the empty case.
- F2 ALREADY FIXED on branch 29: `wifi-order-jobs.ts` `recordProgress` does a same-status CAS `transition(id, status, status, patch)`; on a miss (null) it re-reads once and re-applies against the current status (status never overwritten); `ports.ts` documents the CAS-returns-null contract. No duplicate fix.
- F3 TRUE: `attemptReceiptIssuance` used `description: order.packageId`.
- F4 TRUE: `wifi-page.tsx` checked `isError` before `data` (RED test reproduced: refetch error rendered the load-error over a loaded order).
- F5 TRUE: `wifi-catalog.tsx` `formatPrice` hardcoded `es-PE` (RED: en rendered `S/`).
- F6 TRUE: forward job sent every pending row; nothing deleted rows on withdrawal.
- F7 TRUE: `flush-analytics-queue.ts` rethrew on any error and left the failing batch queued forever.
- F8 TRUE: `setAnalyticsConsentGranted(false)` only removed the localStorage flag; no UI calls it, so the clear was put inside the helper.
- F9 TRUE: rows removed when `sendBeacon` returned true.
- F10 TRUE: `createWifiOrder` recorded both funnel events on every call, including replays.
- F11 TRUE: `resolveActiveSession` unguarded in `outbound/http.ts` (RED: 500).
- F12 TRUE: `recordAnalyticsEvents` looped `create` per event.
- F13 TRUE: `AnalyticsEventSchema` accepted every name, including server-only funnel names (RED test).

## Decisions
- F1: reject creation with 422 `{code:"invalid_request"}` (existing error shape) when there is no upcoming leg or no email contact; spec silent, so reject (an order that can never be entitled/receipted is worse than a refusal). Replay of an existing key against such a reservation is also refused (simplest, least assumption).
- F3: receipt description = package `names.es` (boleta is es-PE), else first available name, else code, else packageId; missing package never blocks the receipt.
- F5: `es` -> `es-PE` (soles stay `S/`), other UI locales use their own language tag.
- F6 (privacy): (a) `recordConsent` withdrawing `analytics` deletes the reservation's not-yet-forwarded rows by `trip_hash` (HMAC recomputed from the reservationRef + secret) in the same call, audited like the push cascade; (b) the forward job re-checks consent at forward time via `ConsentStore.listLatestByPurpose("analytics")` and fails CLOSED: only trips whose latest consent is granted are forwarded; rows of withdrawn or unknown trips are deleted and not sent. The job now needs `consentStore` + `secret` (worker option `analytics.consentStore/secret`, main-worker passes `ANALYTICS_TRIP_HASH_SECRET`).
- F7: 4xx other than 408/429 (ApiError or UnparsableApiError status) => batch dropped, reported in `result.dropped` (console-free); 5xx/network/408/429 rethrow and keep the queue. 401 is also dropped per the instruction (documented tradeoff: a lapsed session loses queued analytics).
- F8: `setAnalyticsConsentGranted` is now async; withdrawal clears the IndexedDB queue. `flushAnalyticsQueue` re-checks consent before each batch and discards the queue if withdrawn (a previous test encoded the old "already-queued event survives withdrawal" behavior and was corrected).
- F9: dropped `navigator.sendBeacon` for deletion entirely (its `true` only means queued). Delivery uses `apiClient.post` with `keepalive: true`, rows deleted only after an observed response. `sendBeacon` dep removed from `FlushAnalyticsQueueDeps`.
- F10: replay detected via `findByIdempotencyKey` before `create`; events recorded only for a first-time order (a concurrent double first request can still double-record; analytics is best-effort).
- F11: `.catch(() => null)` around the optional session resolution.
- F12: `AnalyticsEventStore.createMany` (all-or-nothing); `recordAnalyticsEvents` uses one call.
- F13: `ClientAnalyticsEventNameSchema = ["screen_view"]` (the only event with no authoritative server call site; every funnel/click-out/push/pulse event is recorded server-side), `ServerAnalyticsEventNameSchema` for the rest, `AnalyticsEventNameSchema` = union (server recorder/store). Web types use `ClientAnalyticsEventName`.

## Progress / evidence
Pre-restack commits (T2/T3):
- #19: b5e3b22 F1, 8dcf85f F3, dd6870d F5, 56e5313 F4.
- #22: e6d2e90 F6, 9fe2b30 F7+F8+F9 (web), 077b608 F11, 77a4c71 F10, 0bf2c1c F12, 16885f9 F13.
Suites on branch 22 after fixes: bff 718, web 317, contracts 112 passed; tsc clean. RED observed for each fix before implementation (tests failed for the stated reason).
Pre-restack branch tips: 20 a2ac156, 21 8bed3da, 22(old) da1459e, 23 1f1a356, 24 c4d2d9d, 25 381ecc1, 26 f6c9e14, 27 6e0c614, 28 6596336, 29 71e7afb, 30 4bc557b.

## Restack (T4)
Backup: `backup/pre-restack2-20261003-085421` (old tip 4bc557b). Rebased 20..30 in order, each onto its updated parent.
Old -> new tips: 20 a2ac156 -> efeb8ef; 21 8bed3da -> 268f6a0; 22 16885f9 (with fixes, pre-restack) -> 375621a; 23 1f1a356 -> 2b3001c; 24 c4d2d9d -> 6aa14e9; 25 381ecc1 -> f426363; 26 f6c9e14 -> b9d67a7; 27 6e0c614 -> 94a48a9; 28 6596336 -> e05d36a; 29 71e7afb -> c8d2461 (includes fix-up); 30 4bc557b -> c7b1952 (+ this doc commit). Branch 19 tip 56e5313 (4 new commits, no rewrite).
Branch 22 fix commits after restack: 57b31da F6, e391073 F7+F8+F9, 489dfb3 F11, f58bd7c F10, fd14229 F12, 375621a F13.
Conflicts: only branch 29 (commit "add postgres wifi order store"): `create-wifi-order.ts` `CreateWifiOrderDeps.orderStore` Pick; resolved by keeping both sides (`create | findById | transition | findByIdempotencyKey`). `wifi-order-jobs.ts` auto-merged: F3 description change coexists with `recordProgress` CAS.
Fix-up on 29 (c8d2461): my F3 test used the pre-CAS 3-arg `transition`; adapted to `transition(id, "CREATED", "ENTITLEMENT_ACTIVE", patch)`.
Per-branch check (tsc contracts/bff/web + focused bff/web/contracts suites) for 20-28 green; 29/30 failed once on that fixed test, green after fix-up.
Tip verification: bff (TEST_DATABASE_URL set, incl. Postgres store) 812 passed; web 367; contracts 116; tsc bff/web/contracts/e2e clean; turbo typecheck+lint+test (bff, web, contracts, e2e) 13/13 successful; E2E container run 20 passed. `git diff backup HEAD --stat`: only finding-related files (38 files, +784/-156), no unrelated changes.
No harness/spec change needed: e2e uses an email contact + upcoming leg, and no spec runs the analytics forward scan.
Not done / notes: e2e harness worker still gets a fresh in-memory consent store (harmless: the harness never schedules the analytics forward queue); shared production consent/analytics stores remain in-memory per process (pre-existing documented gap), so the worker's fail-closed re-check forwards nothing until a shared store exists.
