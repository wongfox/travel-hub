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
| B | Feature flags have no runtime override wiring | **Resolved for deployments.** `FEATURE_FLAG_OVERRIDES` (JSON object of known flag keys to booleans, e.g. `{"wifi.checkout":true}`) is parsed and validated by `loadEnv` (`config/env.ts`, `parseFlagOverrides` in `config/flags.ts`) and shared by `main-api.ts` and `main-worker.ts`; precedence is `FLAG_DEFAULTS` < overrides (defaults unchanged). Unknown keys, non-boolean values and malformed JSON fail at boot, and every override still passes the go-live guards (in production-like environments a flipped guarded flag with missing prerequisites fails boot in both processes). docker-compose forwards the variable (empty by default: `FEATURE_FLAG_OVERRIDES='{"wifi.checkout":true}' docker compose up -d --build`; from WSL with the Windows docker binary export `WSLENV=FEATURE_FLAG_OVERRIDES` too) and `infra/` plumbs `feature_flag_overrides`. The `feature_flag` table is not read (no reader; boot-time guards need synchronous config). Verified on compose: flag off `GET /api/wifi/packages` -> 403 `feature_disabled`; flag on -> 401 `link_expired` (module reachable, auth check). A full passenger flow on the compose stack is still blocked by gap A (no token-exposing route, deliberately). The harness still passes its own overrides in-process. |
| C | `bff-api` and `bff-worker` don't share in-memory stores | **Resolved for WiFi orders in the production topology**: both processes build the Postgres `WifiOrderStore` (`adapters/wifi-order-store/postgres.ts`, atomic compare-and-swap `transition`) from the same `DATABASE_URL`; compose runs a one-shot `bff-migrate` (`node dist/infra/db/migrate.js`) first (run the same command as a one-off task in production). Verified on the compose stack: an order created and paid through the API was activated, SIR-registered and receipted by the separate worker container. Resolved for E2E only for everything else (the harness shares in-memory store instances in one process). **Production still needs Drizzle-backed stores** for staff alerts, pulse responses, push subscriptions, analytics events and access links. |
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
