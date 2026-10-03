# Known gaps behind the E2E suite (task 14.1)

The suite runs against an **in-process BFF** (`harness/in-process-stack.ts`,
see `README.md`), not the docker-compose stack: api and worker share one
process, one set of in-memory stores and the same stub adapters. Gaps A-C below
were found while writing the suite against the compose topology; they are
**resolved for E2E only** — the production wiring they describe is unchanged.
Last verified: Chromium, inside the Playwright image
(`e2e/scripts/run-in-docker.sh`): 20 passed, 0 skipped (scenario 5 now runs, gap D closed).

| Gap | What | Status |
|---|---|---|
| A | No black-box way to read an issued link's token | Resolved for E2E: the harness injects the stub `LinkDeliveryPort` and reads its `deliveries[]` in-process. A dev-only inspection route was explicitly rejected as a security risk; none exists. |
| B | Feature flags have no runtime override wiring | Resolved for E2E: the harness passes `flags` through `buildApp`/`startWorker` options. **Production still has no override path** (`main-api.ts`/`main-worker.ts` pass none). |
| C | `bff-api` and `bff-worker` don't share in-memory stores | Resolved for E2E: both are built in one process with shared store instances. **Production still needs Drizzle-backed stores** for wifi orders, staff alerts, pulse responses, push subscriptions, analytics events and access links. |
| D | No `PrecheckinPage`/route in `apps/web` | **Resolved.** `/trip/precheckin` (`PrecheckinPage`) is gated on `trip.features.precheckinCaptureUi` and the `consentTextVersions.precheckin` the BFF now publishes on `GET /api/trip` (from `PRECHECKIN_CONSENT_TEXT_VERSION`). It lists the reservation's passengers (pre check-in is per passenger, as the BFF API is), records the never-cached biometric consent, captures the photo and ID front (camera, or file fallback) and submits to `POST /api/precheckin/:passengerOrdinal`. The harness enables `precheckin.capture_ui` AND `precheckin.production_collection` (the BFF refuses submissions without it) for E2E only; production defaults and go-live guards are unchanged. The es/en/pt copy is provisional (`TODO(legal)`). |
| E | Push and pulse web flows never record their consent | **Resolved.** `PurposeConsentGate` (`apps/web/src/shared/consent`) records `push`/`pulse` consent through `POST /api/consents` before the browser permission prompt / first pulse prompt, using the text version the BFF now publishes on `GET /api/trip` (`consentTextVersions`). The es/en/pt consent copy is provisional (`TODO(legal)`). Scenario 7 uses the real UI. Scenario 6 still records pulse consent through the public route because `/trip/pulse` cannot render its gate (no seeded `COMPLETED` leg). |
| F | Offline deep-link reload (found and fixed by the suite) | Fixed in `apps/web`: the service worker had no navigation fallback, so reloading `/trip/documents` offline was a browser network error. Added `registerNavigationFallback`. |
| G | Datetime offsets crashed the web (found and fixed by the suite) | Fixed in `apps/web`: seeded SIR times carry `-05:00`; the web appended `Z` and threw `Invalid time value` on trip home/itinerary. |

Two observations that are not fixed: the offline fallback only appears after
TanStack Query's default retries give up (~7s of "Loading your trip…" while
offline, scenario 2 waits it out), and no seeded reservation has a `COMPLETED`
leg, so the web pulse prompt (`/trip/pulse`) always shows "no moment yet";
scenario 6 therefore drives `POST /api/pulse` from the page instead of the UI.

## Scenario status

| Scenario | Status |
|---|---|
| 00 harness sanity (nginx parity, `/internal` not exposed, token never in a response) | runs, passes |
| 01 link -> trip | runs, passes |
| 02 offline boarding pass | runs, passes (after fix F) |
| 03 relocation on reload | runs, passes (after fix G) |
| 04 WiFi purchase via stub webhook | runs, passes (gateway page is intercepted; webhook signed by the injected gateway stub) |
| 05 pre check-in (Chromium) | runs, passes: real page, fake media stream camera capture (Ana) and blocked-camera file fallback (Luis), submission recorded, status only exposed back |
| 06 negative pulse -> one staff alert | runs, passes (asserts the injected `StaffAlertStub.deliveries`; pulse consent still recorded through the public route, see gap E) |
| 07 push opt-in (Chromium) | runs, passes with `PushManager.subscribe` faked (no push service in the container) and the real push consent gate (accept, then enable) |
| 08 locale smoke ES/EN/PT | runs, passes. `/trip/menu` and `/trip/destination` are still not swept. |

The `firefox` project is configured but was not run.
