# Known gaps blocking real E2E execution (task 14.1)

Discovered by reading the actual application code while writing this suite
(WU24, `sdd/travel-hub-mvp/apply-progress`), independent of this sandbox
having no reachable Docker engine. These are real, pre-existing gaps in the
application and its deployment wiring, not sandbox artifacts — the next owner
needs to resolve them (or decide they're acceptable for a given release)
before any scenario below can genuinely pass against a live stack.

## Gap A — no black-box way to retrieve an issued link's token

`POST /internal/links` (`services/bff/src/modules/trip-access/http.ts`,
`issue-link.ts`) only ever returns `{ accessLinkId, expiresAt }`. The actual
token is generated, hashed for storage, and handed to `LinkDeliveryPort
.deliver(contact, linkUrl, locale)` — by design, the internal caller is never
supposed to see it (the passenger receives it via email/SMS/WhatsApp).

The stub adapter (`services/bff/src/adapters/link-delivery/stub.ts`) DOES
keep every delivery in an in-process `deliveries[]` array, which is how this
codebase's own Vitest integration tests read it — but that array lives
inside the `bff-api` container's own process memory. A real Playwright E2E
run is a separate OS process hitting the containers over HTTP; it has no way
to read that array.

**Impact**: blocks EVERY scenario below (01, 02, 03, 07, 08) — all of them
need to open a link before they can do anything else.

**Suggested fix** (not implemented in WU24 — out of this work unit's
assigned scope, and touches `trip-access`, a security-sensitive module with
its own threat-matrix RED tests, so it deserves its own reviewed task):
add a dev/non-production-only inspection route (e.g. `GET
/internal/links/:accessLinkId/delivered`, gated behind both the existing
`internalApiKey` check AND `nodeEnv !== "production"`) that reads the stub's
`deliveries[]`. `fixtures/internal-api.ts`'s `issueLink()` is written ready
to call such a route the moment it exists — it throws a clear, specific
error today instead of fabricating a token.

## Gap B — feature flags default off with no runtime override wiring

`FLAG_DEFAULTS` (`services/bff/src/config/flags.ts`) ships `wifi.checkout`,
`push.enabled`, `pulse.capture`, `pulse.staff_alerts`,
`precheckin.capture_ui`, `menu.enabled`, and `destination.enabled` all
`false`. `main-api.ts`/`main-worker.ts` never pass a `flags` option into
`buildApp`/`startWorker`, so every module falls back to `FLAG_DEFAULTS`.
`docker-compose.yml` sets no env var that reaches a flag override, and the
BFF exposes no `/internal/flags` (or equivalent) write route — the only
flag-mutation path in the codebase is the `feature_flag` DB table read at
`buildApp`/`startWorker` construction time, which nothing in the real
deployment ever writes to.

**Impact**: blocks scenarios 04 (WiFi), 05 (pre check-in), 06 (pulse), 07
(push), and narrows 08's locale smoke pass to exclude `/trip/menu` and
`/trip/destination`.

**Suggested fix**: either read flag overrides from env vars in
`main-api.ts`/`main-worker.ts` (e.g. a `FEATURE_FLAG_OVERRIDES` JSON env
var), or seed the `feature_flag` table from `docker-compose.yml`/a startup
script for local/E2E environments.

## Gap C — `bff-api` and `bff-worker` do not share in-memory store state

Every store `composition-root.ts` wires (`WifiOrderStore`,
`PulseResponseStore`, `StaffAlertStore`, `PushSubscriptionStore`,
`AccessLinkStore`, `AnalyticsEventStore`) defaults to a fresh
`createInMemoryXStore()` instance per `buildApp`/`startWorker` call when no
explicit instance is injected. `main-api.ts` and `main-worker.ts` are two
separate Node processes (two separate `docker-compose.yml` services,
`bff-api`/`bff-worker`) and neither passes a shared store instance to the
other — this is explicitly acknowledged in `main-worker.ts`'s own comment
("`analyticsEventStore` defaults to a fresh in-memory instance — same
documented gap as `notifications.accessLinkStore` above... pending a
Drizzle-backed adapter").

**Impact**: blocks the half of scenario 04 that depends on
`runWifiEntitlementActivationJob` (a WORKER job) reading an order the `api`
process wrote, and the half of scenario 06 that depends on
`dispatch-staff-alerts-job.ts` (also a WORKER job) reading a `staff_alert`
row the `api` process wrote. The passenger-visible, same-process halves of
both flows (order creation, webhook handling, pulse submission itself) are
NOT blocked by this gap.

**Suggested fix**: Drizzle-backed Postgres adapters for these stores (the
foundational tables from task 3.3 — `access_link`, `session`,
`consent_record`, `feature_flag`, `pii_access_audit` — already use Postgres;
these newer stores never got the equivalent treatment), wired identically
into both `main-api.ts` and `main-worker.ts` against the same
`DATABASE_URL`.

## Gap D — no `PrecheckinPage`/route exists in `apps/web`

`apps/web/src/features/precheckin/precheckin-capture-flow.tsx` (consent +
capture composition, tasks 8.1/8.2) exists and is unit-tested in isolation,
but `apps/web/src/app/route-tree.tsx` never registers a route for it, and no
`precheckin-page.tsx` composes it with navigation/passenger-ordinal
selection/the task 8.3 submission call the way `wifi-page.tsx`/
`push-page.tsx`/`pulse-page.tsx` do for their features. There is no URL a
passenger (or this suite) can navigate to reach pre check-in at all.

**Impact**: blocks scenario 05 independently of gaps A/B.

**Suggested fix**: a `PrecheckinPage` container + route, in the same style
as the other feature pages — out of WU24's scope (this is Phase 8 follow-up
work, not Phase 14).

## Summary table

| Scenario | Gap A (token) | Gap B (flags) | Gap C (cross-process) | Gap D (no route) |
|---|---|---|---|---|
| 01 link→trip | blocks | — | — | — |
| 02 offline boarding pass | blocks | — | — | — |
| 03 relocation on reload | blocks | — | — | — |
| 04 WiFi purchase | blocks | blocks (`wifi.checkout`) | blocks (entitlement job) | — |
| 05 pre check-in | blocks | blocks (`precheckin.capture_ui`) | — | blocks |
| 06 negative pulse | blocks | blocks (`pulse.capture`/`pulse.staff_alerts`) | blocks (dispatch job) | — |
| 07 push opt-in | blocks | blocks (`push.enabled`) | — | — |
| 08 locale smoke | blocks | narrows scope (menu/destination excluded) | — | — |

Every spec file in `tests/` is written as real, complete scenario logic —
not stubs — and is marked `test.fixme()`/skipped with a one-line pointer
back to this file wherever one of these gaps makes it unable to pass today.
