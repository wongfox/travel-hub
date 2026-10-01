/**
 * Composition root: the single place where adapters are wired to ports and
 * the Fastify application/worker are assembled. Constructor-injection
 * convention per design Decision 2 — no DI framework/container.
 *
 * Capability-module ports (SirBookingPort, PaymentGatewayPort, etc.) still
 * land in later work units; this file currently wires the shared
 * infrastructure (HTTP app, job queue) those modules will extend.
 */
import Fastify, { type FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { assertGoLiveGuard, isProductionLike, type GoLiveContext } from "./config/go-live-guards.js";
import type { NodeEnvName } from "./config/env.js";
import { createRedactingLogger } from "./infra/logging/redacting-logger.js";
import { registerSecurityPlugins } from "./infra/http/security-plugins.js";
import type { QueueClient } from "./infra/queue/queue-client.js";
import { registerSampleJob, SAMPLE_JOB_QUEUE, type SampleJobExecutor } from "./infra/queue/sample-job.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "./modules/trip-access/access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "./modules/trip-access/session-store.js";
import { createInMemoryRateLimiter, type RateLimiter } from "./modules/trip-access/rate-limiter.js";
import { registerTripAccessRoutes } from "./modules/trip-access/http.js";
import type { LinkDeliveryPort } from "./modules/trip-access/ports.js";
import { createLinkDeliveryStub } from "./adapters/link-delivery/stub.js";
import type { SirBookingPort } from "./modules/booking/ports.js";
import { createSirBookingStub } from "./adapters/sir-booking/stub.js";
import { registerTripRoutes } from "./modules/trip/http.js";
import type { TicketDocumentPort } from "./modules/trip/ports.js";
import { createTicketDocumentStub } from "./adapters/ticket-document/stub.js";
import { FLAG_DEFAULTS, type FlagKey } from "./config/flags.js";
import { registerPrivacyRoutes } from "./modules/privacy/http.js";
import { createInMemoryConsentStore, type ConsentStore } from "./modules/privacy/consent-store.js";
import { registerPrecheckinRoutes } from "./modules/precheckin/http.js";
import { createInMemorySubmissionStore } from "./modules/precheckin/submission-store.js";
import type {
  PrecheckinDocumentStorePort,
  PrecheckinHandoffPort,
  PrecheckinSubmissionStore,
} from "./modules/precheckin/ports.js";
import { createPrecheckinDocumentStoreStub } from "./adapters/precheckin-document-store/stub.js";
import { createPrecheckinHandoffStub } from "./adapters/precheckin-handoff/stub.js";
import { createKmsStub } from "./infra/crypto/kms-stub.js";
import type { KeyManagementPort } from "./infra/crypto/key-management-port.js";
import { createInMemoryPiiAccessAudit, type PiiAccessAuditPort } from "./infra/audit/pii-access-audit.js";
import { registerHandoffJob, PRECHECKIN_HANDOFF_QUEUE } from "./modules/precheckin/handoff-job.js";
import { registerPurgeJob, PRECHECKIN_PURGE_QUEUE } from "./modules/precheckin/purge-job.js";
import { resolveRetentionConfig, type RetentionConfig } from "./modules/precheckin/retention.js";
import { registerContentRoutes } from "./modules/content/http.js";
import type { ContentPort } from "./modules/content/ports.js";
import { createContentStub } from "./adapters/content/stub.js";
import { registerWifiCheckoutRoutes } from "./modules/wifi-checkout/http.js";
import type {
  EReceiptPort,
  PaymentGatewayPort,
  WifiEntitlementPort,
  WifiOrderStore,
  WifiPackageStore,
} from "./modules/wifi-checkout/ports.js";
import { createInMemoryWifiOrderStore } from "./modules/wifi-checkout/wifi-order-store.js";
import { createWifiPackageStub } from "./adapters/wifi-package/stub.js";
import { createPaymentGatewayStub } from "./adapters/payment-gateway/stub.js";
import { createWifiEntitlementStub } from "./adapters/wifi-entitlement/stub.js";
import { createSirPosStub } from "./adapters/sir-pos/stub.js";
import { createEReceiptStub } from "./adapters/e-receipt/stub.js";
import {
  registerWifiOrderJobs,
  WIFI_ENTITLEMENT_ACTIVATION_QUEUE,
  WIFI_SIR_RECEIPT_QUEUE,
} from "./modules/wifi-checkout/wifi-order-jobs.js";
import type { SirPosPort } from "./modules/booking/ports.js";
import { registerOutboundRoutes } from "./modules/outbound/http.js";
import type { TfeRedirectConfig } from "./modules/outbound/resolve-tfe-redirect.js";
import { registerNotificationRoutes } from "./modules/notifications/http.js";
import { createInMemoryPushSubscriptionStore } from "./modules/notifications/push-subscription-store.js";
import { createInMemoryNotificationStore } from "./modules/notifications/notification-store.js";
import type {
  JourneyEventSourcePort,
  NotificationStore,
  PushSubscriptionStore,
  WebPushPort,
} from "./modules/notifications/ports.js";
import { createWebPushStub } from "./adapters/web-push/stub.js";
import { createSirPollingJourneyEventAdapter } from "./adapters/journey-event-source/sir-polling.js";
import { registerJourneyPollJob, JOURNEY_POLL_QUEUE } from "./modules/notifications/journey-poll-job.js";
import { DEFAULT_ALERT_SOURCE_POLICY, isAlertSourcePolicyComplete } from "./config/alert-source-policy.js";
import type { AlertSourcePolicy } from "contracts";
import { registerPulseRoutes } from "./modules/pulse/http.js";
import { createInMemoryPulseResponseStore } from "./modules/pulse/pulse-response-store.js";
import { createInMemoryStaffAlertStore } from "./modules/pulse/staff-alert-store.js";
import { createInMemoryPulsePromptDeliveryStore } from "./modules/pulse/pulse-prompt-delivery-store.js";
import { DEFAULT_NEGATIVE_PULSE_RULE, type NegativePulseRule } from "./modules/pulse/negative-pulse-rule.js";
import type { PulseResponseStore, StaffAlertPort, StaffAlertStore } from "./modules/pulse/ports.js";
import { createStaffAlertStub } from "./adapters/staff-alert/stub.js";
import {
  registerStaffAlertDispatchJob,
  STAFF_ALERT_DISPATCH_QUEUE,
} from "./modules/pulse/dispatch-staff-alerts-job.js";
import { registerPushSubscriptionPurgeJob, PUSH_SUBSCRIPTION_PURGE_QUEUE } from "./modules/notifications/purge-job.js";
import { registerPulsePurgeJob, PULSE_PURGE_QUEUE } from "./modules/pulse/purge-job.js";
import { resolvePulseRetentionConfig } from "./modules/pulse/retention.js";
import { registerAnalyticsRoutes } from "./modules/analytics/http.js";
import { createInMemoryAnalyticsEventStore } from "./modules/analytics/analytics-event-store.js";
import { createAnalyticsRecorder, type AnalyticsRecorder } from "./modules/analytics/analytics-recorder.js";
import type { AnalyticsEventStore, AnalyticsSinkPort } from "./modules/analytics/ports.js";
import { createAnalyticsSinkStub } from "./adapters/analytics-sink/stub.js";
import {
  registerForwardAnalyticsEventsJob,
  ANALYTICS_FORWARD_QUEUE,
} from "./modules/analytics/forward-analytics-events-job.js";

/**
 * Dev-only default: overridden in production by `INTERNAL_LINKS_API_KEY`
 * (env.ts). Design-interfaces leaves the exact service-auth mechanism open
 * ("mTLS or signed service token"); startup must never rely on this default
 * outside `development`/`test` (see main-api.ts).
 */
const DEFAULT_DEV_INTERNAL_LINKS_API_KEY = "dev-only-internal-links-key";
const DEFAULT_LINK_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72h grace, per design Decision 4 (configurable)
const DEFAULT_SESSION_SLIDING_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, per design Decision 4 (configurable)
const DEFAULT_SESSION_RATE_LIMIT = { max: 10, windowMs: 60_000 };
const DEFAULT_REISSUE_RATE_LIMIT = { max: 5, windowMs: 60_000 };
/** Dev-only default; a real deployment names its production KMS key via config (design Decision 13's KMS key prerequisite). */
const DEFAULT_PRECHECKIN_KEY_ID = "dev-only-precheckin-key";
/**
 * Dev-only default (task 10.5): the real TFE base URL, allowlisted
 * placements, and attribution parameters are business/marketing
 * configuration, not yet chosen (design's own "TFE" partner site is
 * unnamed) — same "documented dev-only default" convention as
 * `DEFAULT_DEV_INTERNAL_LINKS_API_KEY` above.
 */
/** Dev-only default; a real deployment names a real secret via `ANALYTICS_TRIP_HASH_SECRET` (env.ts). */
const DEFAULT_DEV_ANALYTICS_TRIP_HASH_SECRET = "dev-only-analytics-trip-hash-secret";
const DEFAULT_TFE_REDIRECT_CONFIG: TfeRedirectConfig = {
  baseUrl: "https://www.trainexperience.local",
  allowedPlacements: {
    home_banner: "/offers/machu-picchu-sunset",
    menu_upsell: "/offers/private-tour",
  },
  attributionParams: { utm_source: "travel-hub-app", utm_medium: "in-app" },
};

export interface BuildAppOptions {
  /**
   * `true` builds a default redacting logger (task 3.5); pass a pre-built
   * logger (e.g. one pointed at a custom destination) to override it;
   * `false`/omitted disables logging.
   */
  logger?: boolean | Logger;
  /**
   * `trip-link-access` issuance (task 5.2), session-exchange (task 5.3) and
   * reissue (task 5.4) wiring. All fields default sensibly for dev/test.
   */
  tripAccess?: {
    accessLinkStore?: AccessLinkStore;
    sessionStore?: SessionStore;
    sirBooking?: Pick<SirBookingPort, "getContactForLinkDelivery">;
    linkDelivery?: LinkDeliveryPort;
    internalApiKey?: string;
    /**
     * The running environment, used only to decide whether a missing
     * `internalApiKey` is a startup error (production-like) or an
     * acceptable dev/test default. Defaults to `"development"` so existing
     * callers that never pass it keep the dev-only fallback.
     */
    nodeEnv?: NodeEnvName;
    linkExpiryMs?: number;
    sessionSlidingMs?: number;
    buildLinkUrl?: (token: string) => string;
    sessionRateLimiter?: RateLimiter;
    reissueRateLimiter?: RateLimiter;
    now?: () => Date;
  };
  /**
   * `trip` overview wiring (task 6.2). Shares `tripAccess`'s
   * `accessLinkStore`/`sessionStore` by default (a session created via
   * `POST /api/session` must be resolvable here) — only override them
   * through `tripAccess` unless a test genuinely needs divergent stores.
   */
  trip?: {
    sirBooking?: Pick<SirBookingPort, "getReservation" | "getRelocations">;
    flags?: Record<FlagKey, boolean>;
    ticketDocument?: TicketDocumentPort;
  };
  /**
   * `personal-data-protection` consent capture wiring (task 8.1). Shares
   * `tripAccess`'s `accessLinkStore`/`sessionStore` by default — a session
   * created via `POST /api/session` must be resolvable here too.
   */
  privacy?: {
    consentStore?: ConsentStore;
    /** Consent-withdrawal cascade's `pii_access_audit` write point (task 12.3); defaults to a fresh in-memory instance. */
    piiAccessAudit?: PiiAccessAuditPort;
  };
  /**
   * `pre-check-in` submission/status wiring (tasks 8.3-8.4). Shares
   * `tripAccess`'s stores and `trip`'s `sirBooking`/`flags` by default — the
   * same session and flag table already resolved for `GET /api/trip` govern
   * the pre check-in routes too.
   */
  precheckin?: {
    submissionStore?: PrecheckinSubmissionStore;
    documentStore?: Pick<PrecheckinDocumentStorePort, "put" | "delete">;
    kms?: KeyManagementPort;
    keyId?: string;
    /** `purge_after` computation config (task 8.5); defaults to the dev/non-production fallback when omitted. */
    retention?: RetentionConfig;
  };
  /**
   * `content` module wiring (tasks 9.1-9.4: help-center, onboard-menu,
   * destination-content). Shares `trip`'s `flags`/`sirBooking` by default —
   * `menu.enabled`'s tier resolution needs the same reservation `trip`
   * already reads.
   */
  content?: {
    contentPort?: ContentPort;
    flags?: Record<FlagKey, boolean>;
    /** The running environment, passed to the go-live guard. Defaults to `trip-access`'s `nodeEnv`, then `"development"`. */
    nodeEnv?: NodeEnvName;
    /** `ADAPTER_CONTENT` (env.ts); defaults to `"stub"`. The go-live guard refuses `menu.enabled`/`destination.enabled: true` in production/staging while this stays `"stub"`. */
    adapterContent?: string;
  };
  /**
   * `wifi-package-checkout` wiring (tasks 10.1-10.2: saga core + payment
   * webhook). Shares `trip`'s `flags`/`sirBooking` by default, the same
   * pattern as `content` above.
   */
  wifiCheckout?: {
    orderStore?: WifiOrderStore;
    packageStore?: Pick<WifiPackageStore, "listActive" | "findById">;
    paymentGateway?: PaymentGatewayPort;
    flags?: Record<FlagKey, boolean>;
    /** The running environment, passed to the go-live guard. Defaults to `content`'s/`trip-access`'s `nodeEnv`, then `"development"`. */
    nodeEnv?: NodeEnvName;
    /**
     * `ADAPTER_PAYMENT` (env.ts); defaults to `"stub"`. The go-live guard
     * refuses `wifi.checkout: true` in production/staging while this stays
     * `"stub"` — it also requires non-stub receipt/SIR-POS/entitlement
     * adapters (`adapterReceipt`/`adapterSirPos`/`adapterWifiEntitlement`
     * below, task 10.3), so all four must be declared non-stub together
     * before this flag can go live in production.
     */
    adapterPayment?: string;
    /** `ADAPTER_RECEIPT` (env.ts, task 10.3); defaults to `"stub"`. See `adapterPayment`. */
    adapterReceipt?: string;
    /** `ADAPTER_SIR_POS` (env.ts, task 10.3); defaults to `"stub"`. See `adapterPayment`. */
    adapterSirPos?: string;
    /** `ADAPTER_WIFI_ENTITLEMENT` (env.ts, task 10.3); defaults to `"stub"`. See `adapterPayment`. */
    adapterWifiEntitlement?: string;
    buildReturnUrl?: (idempotencyKey: string) => string;
  };
  /**
   * `complementary-services-redirect` wiring (task 10.5): no flag, no
   * session — a self-contained allowlisted redirect. Defaults to a dev-only
   * placeholder allowlist/base URL (business configuration not yet chosen).
   */
  outbound?: {
    tfeConfig?: TfeRedirectConfig;
  };
  /**
   * `push-notifications` subscription-lifecycle wiring (task 11.1). Shares
   * `trip-access`'s `accessLinkStore`/`sessionStore` and `privacy`'s
   * `consentStore` by default — a session created via `POST /api/session`
   * and a consent recorded via `POST /api/consents` must both be visible
   * here too. The resolved `subscriptionStore` is also threaded into
   * `trip-access`'s reissue flow, so `POST /api/links/reissue` invalidates
   * every subscription bound to a link it revokes (task 11.1 acceptance).
   */
  notifications?: {
    subscriptionStore?: PushSubscriptionStore;
    flags?: Record<FlagKey, boolean>;
    /** The running environment, passed to the go-live guard. Defaults to `wifiCheckout`'s/`content`'s/`trip-access`'s `nodeEnv`, then `"development"`. */
    nodeEnv?: NodeEnvName;
    /** `ADAPTER_WEB_PUSH` (env.ts); defaults to `"stub"`. */
    adapterWebPush?: string;
    /** `push.enabled` go-live prerequisite: whether real VAPID keys are configured (env.ts's `PUSH_VAPID_PUBLIC_KEY`/`PUSH_VAPID_PRIVATE_KEY`). */
    vapidConfigured?: boolean;
    /** `push.enabled` go-live prerequisite: `AlertSourcePolicy` must declare every alert type. Defaults to `DEFAULT_ALERT_SOURCE_POLICY` (config/alert-source-policy.ts). */
    alertSourcePolicy?: AlertSourcePolicy;
    /** `push.enabled` go-live prerequisite: approved consent text version (env.ts's `PUSH_CONSENT_TEXT_VERSION`). */
    pushConsentTextVersion?: string;
  };
  /**
   * `experience-pulse` capture + D4a alerting wiring (tasks 11.4-11.6).
   * Shares `trip-access`'s `accessLinkStore`/`sessionStore`, `privacy`'s
   * `consentStore`, and `notifications`'s `subscriptionStore`/`webPush` by
   * default — a session created via `POST /api/session`, a consent recorded
   * via `POST /api/consents`, and a push subscription created via `POST
   * /api/push/subscriptions` must all be visible here too.
   */
  pulse?: {
    pulseResponseStore?: Pick<PulseResponseStore, "create">;
    staffAlertStore?: Pick<StaffAlertStore, "create">;
    negativePulseRule?: NegativePulseRule;
    flags?: Record<FlagKey, boolean>;
    /** The running environment, passed to the go-live guard. Defaults to `notifications`'s/`wifiCheckout`'s/`trip-access`'s `nodeEnv`, then `"development"`. */
    nodeEnv?: NodeEnvName;
    /** `ADAPTER_STAFF_ALERT` (env.ts); defaults to `"stub"`. The go-live guard refuses `pulse.staff_alerts: true` in production/staging while this stays `"stub"`. */
    adapterStaffAlert?: string;
    /** `pulse.capture` go-live prerequisite: approved consent text version (env.ts's `PULSE_CONSENT_TEXT_VERSION`). */
    pulseConsentTextVersion?: string;
    /** `pulse.staff_alerts` go-live prerequisite (env.ts's `STAFF_ALERT_RECEIVER_ID`). */
    staffAlertReceiverId?: string;
    /** `pulse.staff_alerts` go-live prerequisite (env.ts's `STAFF_ALERT_PROTOCOL_REF`). */
    staffAlertProtocolRef?: string;
    /** `pulse.staff_alerts` go-live prerequisite (env.ts's `STAFF_ALERT_RETENTION_DAYS`). */
    staffAlertRetentionDays?: number;
    /** `WebPushPort` for the independent pulse-prompt delivery path (task 11.6); defaults to a fresh stub. Not shared with `notifications`'s own worker-only push sending — see `http.ts`'s doc comment on why this stays a separate path. */
    webPush?: WebPushPort;
    pulsePromptDeliveryStore?: Pick<ReturnType<typeof createInMemoryPulsePromptDeliveryStore>, "create">;
  };
  /**
   * `usage-analytics` core wiring (task 12.1): `POST /api/events` plus the
   * `AnalyticsRecorder` shared by every task 12.2 funnel-event call site
   * (wifi-checkout, notifications, pulse, outbound) below. Shares `privacy`'s
   * `consentStore` by default — a consent recorded via `POST /api/consents`
   * must be visible to `POST /api/events`'s own `assertConsentGranted` check
   * too.
   */
  analytics?: {
    analyticsEventStore?: AnalyticsEventStore;
    /** `ANALYTICS_TRIP_HASH_SECRET` (env.ts); defaults to a dev-only secret. */
    secret?: string;
  };
}

/**
 * Builds and configures the Fastify HTTP application for the `api` process.
 * Does not call `.listen()` — that is main-api.ts's responsibility, so the
 * app can be built and exercised via `.inject()` in tests without binding
 * a real port.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const loggerInstance =
    options.logger === true
      ? createRedactingLogger()
      : options.logger === false || options.logger === undefined
        ? undefined
        : options.logger;
  // Cast away Fastify's logger-instance generic: `FastifyInstance`'s default
  // logger type parameter (`FastifyBaseLogger`) is intentionally looser than
  // pino's own `Logger`, and this function's public return type stays the
  // plain `FastifyInstance` regardless of which logger variant was used.
  const app = (
    loggerInstance ? Fastify({ loggerInstance }) : Fastify({ logger: false })
  ) as FastifyInstance;

  // `.register()` enqueues synchronously; Fastify's own boot sequencing
  // (avvio) resolves every registered plugin before `.ready()`/`.listen()`/
  // `.inject()` complete, so this does not need to be awaited here.
  void registerSecurityPlugins(app);

  app.get("/healthz", async () => {
    return { status: "ok" as const };
  });

  const tripAccessOptions = options.tripAccess ?? {};
  if (!tripAccessOptions.internalApiKey && isProductionLike(tripAccessOptions.nodeEnv ?? "development")) {
    throw new Error(
      "INTERNAL_LINKS_API_KEY is required in a production-like environment (production/staging); " +
        "refusing to start with the dev-only default internal API key.",
    );
  }
  // Shared by both `trip-access` and `trip` below: a session created via
  // `POST /api/session` (trip-access) must resolve via the exact same store
  // instances when `GET /api/trip` (trip) looks it up.
  const accessLinkStore = tripAccessOptions.accessLinkStore ?? createInMemoryAccessLinkStore();
  const sessionStore = tripAccessOptions.sessionStore ?? createInMemorySessionStore();
  const sharedSirBookingStub = createSirBookingStub();
  // Shared with `registerNotificationRoutes` below (task 11.1): reissuing a
  // link must invalidate every subscription bound to the link(s) it
  // revokes, which only works if both routes share the exact same store
  // instance — same convention as `sharedConsentStore`/`sharedSubmissionStore`.
  const notificationsOptions = options.notifications ?? {};
  const sharedPushSubscriptionStore = notificationsOptions.subscriptionStore ?? createInMemoryPushSubscriptionStore();

  registerTripAccessRoutes(app, {
    store: accessLinkStore,
    sessionStore,
    sirBooking: tripAccessOptions.sirBooking ?? sharedSirBookingStub,
    linkDelivery: tripAccessOptions.linkDelivery ?? createLinkDeliveryStub(),
    internalApiKey: tripAccessOptions.internalApiKey ?? DEFAULT_DEV_INTERNAL_LINKS_API_KEY,
    linkExpiryMs: tripAccessOptions.linkExpiryMs ?? DEFAULT_LINK_EXPIRY_MS,
    sessionSlidingMs: tripAccessOptions.sessionSlidingMs ?? DEFAULT_SESSION_SLIDING_MS,
    buildLinkUrl:
      tripAccessOptions.buildLinkUrl ?? ((token: string) => `https://app.travel-hub.local/t#${token}`),
    sessionRateLimiter:
      tripAccessOptions.sessionRateLimiter ?? createInMemoryRateLimiter(DEFAULT_SESSION_RATE_LIMIT),
    reissueRateLimiter:
      tripAccessOptions.reissueRateLimiter ?? createInMemoryRateLimiter(DEFAULT_REISSUE_RATE_LIMIT),
    pushSubscriptionStore: sharedPushSubscriptionStore,
    ...(tripAccessOptions.now ? { now: tripAccessOptions.now } : {}),
  });

  const precheckinOptions = options.precheckin ?? {};
  const sharedSubmissionStore = precheckinOptions.submissionStore ?? createInMemorySubmissionStore();

  const tripOptions = options.trip ?? {};
  registerTripRoutes(app, {
    accessLinkStore,
    sessionStore,
    sirBooking: tripOptions.sirBooking ?? sharedSirBookingStub,
    ticketDocument: tripOptions.ticketDocument ?? createTicketDocumentStub(),
    // `TripDTO.passengers[].precheckinStatus` (task 8.4) always reflects this
    // same submission store, so a passenger who just completed pre check-in
    // sees it on their very next `GET /api/trip`.
    precheckinSubmissionStore: sharedSubmissionStore,
    ...(tripOptions.flags ? { flags: tripOptions.flags } : {}),
    ...(tripAccessOptions.now ? { now: tripAccessOptions.now } : {}),
  });

  const privacyOptions = options.privacy ?? {};
  // Shared with `registerPrecheckinRoutes` below: a consent granted via
  // `POST /api/consents` must be visible to pre check-in's own
  // `assertConsentGranted` check — they MUST be the same store instance.
  const sharedConsentStore = privacyOptions.consentStore ?? createInMemoryConsentStore();
  const sharedPrivacyPiiAccessAudit = privacyOptions.piiAccessAudit ?? createInMemoryPiiAccessAudit();
  registerPrivacyRoutes(app, {
    accessLinkStore,
    sessionStore,
    consentStore: sharedConsentStore,
    // Consent-withdrawal cascade (task 12.3): shares the exact same
    // `sharedPushSubscriptionStore` instance `registerNotificationRoutes`
    // below writes to, so withdrawing `push` consent here is visible to
    // every other route reading that store too.
    pushSubscriptionStore: sharedPushSubscriptionStore,
    piiAccessAudit: sharedPrivacyPiiAccessAudit,
  });

  // `usage-analytics` (task 12.1): the shared store + recorder every task
  // 12.2 funnel-event call site below is threaded `analytics` from. Created
  // early so every later module registration can share the exact same
  // `analyticsRecorder` instance (same "shared store instance" convention as
  // `sharedConsentStore`/`sharedPushSubscriptionStore`).
  const analyticsOptions = options.analytics ?? {};
  const sharedAnalyticsEventStore = analyticsOptions.analyticsEventStore ?? createInMemoryAnalyticsEventStore();
  const analyticsSecret = analyticsOptions.secret ?? DEFAULT_DEV_ANALYTICS_TRIP_HASH_SECRET;
  const analyticsRecorder: AnalyticsRecorder = createAnalyticsRecorder({
    analyticsEventStore: sharedAnalyticsEventStore,
    consentStore: sharedConsentStore,
    secret: analyticsSecret,
  });
  registerAnalyticsRoutes(app, {
    accessLinkStore,
    sessionStore,
    consentStore: sharedConsentStore,
    analyticsEventStore: sharedAnalyticsEventStore,
    secret: analyticsSecret,
  });

  registerPrecheckinRoutes(app, {
    accessLinkStore,
    sessionStore,
    sirBooking: tripOptions.sirBooking ?? sharedSirBookingStub,
    consentStore: sharedConsentStore,
    submissionStore: sharedSubmissionStore,
    documentStore: precheckinOptions.documentStore ?? createPrecheckinDocumentStoreStub(),
    kms: precheckinOptions.kms ?? createKmsStub(),
    keyId: precheckinOptions.keyId ?? DEFAULT_PRECHECKIN_KEY_ID,
    retention: precheckinOptions.retention ?? resolveRetentionConfig({}),
    ...(tripOptions.flags ? { flags: tripOptions.flags } : {}),
  });

  const contentOptions = options.content ?? {};
  const contentFlags = contentOptions.flags ?? tripOptions.flags ?? FLAG_DEFAULTS;
  const contentNodeEnv = contentOptions.nodeEnv ?? tripAccessOptions.nodeEnv ?? "development";
  const adapterContent = contentOptions.adapterContent ?? "stub";

  // Design Decision 13's go-live guard, wired to this module (task 9.1): the
  // api process refuses to serve real menu/destination content in
  // production/staging while only a stub ContentPort adapter is declared,
  // the same pattern as `startWorker`'s precheckin guard above.
  const contentGoLiveContext: GoLiveContext = {
    nodeEnv: contentNodeEnv,
    adapters: { ...INERT_GO_LIVE_ADAPTERS, content: adapterContent },
    precheckin: { kmsKeyConfigured: false },
    push: { vapidConfigured: false, alertSourcePolicyComplete: false },
    pulseCapture: {},
    pulseStaffAlerts: {},
  };
  assertGoLiveGuard("menu.enabled", contentFlags["menu.enabled"], contentGoLiveContext);
  assertGoLiveGuard("destination.enabled", contentFlags["destination.enabled"], contentGoLiveContext);

  registerContentRoutes(app, {
    accessLinkStore,
    sessionStore,
    sirBooking: tripOptions.sirBooking ?? sharedSirBookingStub,
    content: contentOptions.contentPort ?? createContentStub(),
    flags: contentFlags,
  });

  const wifiCheckoutOptions = options.wifiCheckout ?? {};
  const wifiCheckoutFlags = wifiCheckoutOptions.flags ?? tripOptions.flags ?? FLAG_DEFAULTS;
  const wifiCheckoutNodeEnv = wifiCheckoutOptions.nodeEnv ?? contentNodeEnv;
  const adapterPayment = wifiCheckoutOptions.adapterPayment ?? "stub";
  const adapterReceipt = wifiCheckoutOptions.adapterReceipt ?? "stub";
  const adapterSirPos = wifiCheckoutOptions.adapterSirPos ?? "stub";
  const adapterWifiEntitlement = wifiCheckoutOptions.adapterWifiEntitlement ?? "stub";

  // Design Decision 13's go-live guard, wired to this module (tasks
  // 10.1/10.3): the api process refuses to allow real WiFi checkout in
  // production/staging unless every one of payment/receipt/SIR-POS/
  // entitlement is declared non-stub — the same pattern as the content guard
  // above.
  assertGoLiveGuard("wifi.checkout", wifiCheckoutFlags["wifi.checkout"], {
    nodeEnv: wifiCheckoutNodeEnv,
    adapters: {
      ...INERT_GO_LIVE_ADAPTERS,
      payment: adapterPayment,
      receipt: adapterReceipt,
      sirPos: adapterSirPos,
      wifiEntitlement: adapterWifiEntitlement,
    },
    precheckin: { kmsKeyConfigured: false },
    push: { vapidConfigured: false, alertSourcePolicyComplete: false },
    pulseCapture: {},
    pulseStaffAlerts: {},
  });

  registerWifiCheckoutRoutes(app, {
    accessLinkStore,
    sessionStore,
    sirBooking: tripOptions.sirBooking ?? sharedSirBookingStub,
    orderStore: wifiCheckoutOptions.orderStore ?? createInMemoryWifiOrderStore(),
    packageStore: wifiCheckoutOptions.packageStore ?? createWifiPackageStub(),
    paymentGateway: wifiCheckoutOptions.paymentGateway ?? createPaymentGatewayStub(),
    flags: wifiCheckoutFlags,
    ...(wifiCheckoutOptions.buildReturnUrl ? { buildReturnUrl: wifiCheckoutOptions.buildReturnUrl } : {}),
    analytics: analyticsRecorder,
  });

  const outboundOptions = options.outbound ?? {};
  registerOutboundRoutes(app, {
    tfeConfig: outboundOptions.tfeConfig ?? DEFAULT_TFE_REDIRECT_CONFIG,
    accessLinkStore,
    sessionStore,
    analytics: analyticsRecorder,
  });

  const notificationsFlags = notificationsOptions.flags ?? wifiCheckoutFlags;
  const notificationsNodeEnv = notificationsOptions.nodeEnv ?? wifiCheckoutNodeEnv;
  const adapterWebPush = notificationsOptions.adapterWebPush ?? "stub";
  const alertSourcePolicy = notificationsOptions.alertSourcePolicy ?? DEFAULT_ALERT_SOURCE_POLICY;

  // Design Decision 13's go-live guard, wired to this module (task 11.1):
  // the api process refuses to enable real push notifications in
  // production/staging unless VAPID keys, a complete AlertSourcePolicy, and
  // an approved consent text version are all declared — the same pattern as
  // the content/wifi-checkout guards above.
  assertGoLiveGuard("push.enabled", notificationsFlags["push.enabled"], {
    nodeEnv: notificationsNodeEnv,
    adapters: { ...INERT_GO_LIVE_ADAPTERS, webPush: adapterWebPush },
    precheckin: { kmsKeyConfigured: false },
    push: {
      vapidConfigured: notificationsOptions.vapidConfigured ?? false,
      alertSourcePolicyComplete: isAlertSourcePolicyComplete(alertSourcePolicy),
      ...(notificationsOptions.pushConsentTextVersion
        ? { consentTextVersion: notificationsOptions.pushConsentTextVersion }
        : {}),
    },
    pulseCapture: {},
    pulseStaffAlerts: {},
  });

  registerNotificationRoutes(app, {
    accessLinkStore,
    sessionStore,
    consentStore: sharedConsentStore,
    subscriptionStore: sharedPushSubscriptionStore,
    flags: notificationsFlags,
    analytics: analyticsRecorder,
  });

  const pulseOptions = options.pulse ?? {};
  const pulseFlags = pulseOptions.flags ?? notificationsFlags;
  const pulseNodeEnv = pulseOptions.nodeEnv ?? notificationsNodeEnv;
  const adapterStaffAlert = pulseOptions.adapterStaffAlert ?? "stub";

  // Design Decision 13's go-live guard (tasks 11.4-11.5): `pulse.capture` and
  // `pulse.staff_alerts` are independent flags with independent prerequisites
  // (design's own table) — each is asserted on its own value, so capture can
  // go live in production without alerting ever being enabled there.
  const pulseGoLiveContext: GoLiveContext = {
    nodeEnv: pulseNodeEnv,
    adapters: { ...INERT_GO_LIVE_ADAPTERS, staffAlert: adapterStaffAlert },
    precheckin: { kmsKeyConfigured: false },
    push: { vapidConfigured: false, alertSourcePolicyComplete: false },
    pulseCapture: { ...(pulseOptions.pulseConsentTextVersion ? { consentTextVersion: pulseOptions.pulseConsentTextVersion } : {}) },
    pulseStaffAlerts: {
      ...(pulseOptions.staffAlertReceiverId ? { receiverId: pulseOptions.staffAlertReceiverId } : {}),
      ...(pulseOptions.staffAlertProtocolRef ? { protocolRef: pulseOptions.staffAlertProtocolRef } : {}),
      ...(pulseOptions.staffAlertRetentionDays ? { retentionDays: pulseOptions.staffAlertRetentionDays } : {}),
    },
  };
  assertGoLiveGuard("pulse.capture", pulseFlags["pulse.capture"], pulseGoLiveContext);
  assertGoLiveGuard("pulse.staff_alerts", pulseFlags["pulse.staff_alerts"], pulseGoLiveContext);

  // Threaded into the default stores below (R3-002) so a configured
  // STAFF_ALERT_RETENTION_DAYS actually reaches the purgeAfter computed at
  // `POST /api/pulse` creation time, not just the go-live guard check above.
  const pulseRetention = resolvePulseRetentionConfig({
    ...(pulseOptions.staffAlertRetentionDays !== undefined
      ? { STAFF_ALERT_RETENTION_DAYS: pulseOptions.staffAlertRetentionDays }
      : {}),
  });

  registerPulseRoutes(app, {
    accessLinkStore,
    sessionStore,
    sirBooking: tripOptions.sirBooking ?? sharedSirBookingStub,
    consentStore: sharedConsentStore,
    pulseResponseStore: pulseOptions.pulseResponseStore ?? createInMemoryPulseResponseStore(undefined, pulseRetention),
    staffAlertStore: pulseOptions.staffAlertStore ?? createInMemoryStaffAlertStore(undefined, pulseRetention),
    pulsePromptDeliveryStore: pulseOptions.pulsePromptDeliveryStore ?? createInMemoryPulsePromptDeliveryStore(),
    subscriptionStore: sharedPushSubscriptionStore,
    webPush: pulseOptions.webPush ?? createWebPushStub(),
    negativePulseRule: pulseOptions.negativePulseRule ?? DEFAULT_NEGATIVE_PULSE_RULE,
    flags: pulseFlags,
    analytics: analyticsRecorder,
  });

  return app;
}

export interface WorkerBootResult {
  /** Job names registered on the worker's queue. */
  jobsRegistered: string[];
}

export interface StartWorkerOptions {
  /** Queue client to start and register jobs on (real pg-boss adapter in production, fake in tests). */
  queueClient: QueueClient;
  /** Executor for the sample job (task 3.4). Defaults to a no-op — later work units' real jobs bring their own executors and registration calls. */
  sampleJobExecutor?: SampleJobExecutor;
  /**
   * Pre check-in handoff/purge job wiring (task 8.5). Registering these jobs
   * is opt-in via this option (omitted entirely, `startWorker` behaves
   * exactly as before this task); `main-worker.ts` always passes it so the
   * real worker process always runs the go-live guard and registers both
   * jobs.
   */
  precheckin?: {
    submissionStore?: PrecheckinSubmissionStore;
    documentStore?: Pick<PrecheckinDocumentStorePort, "get" | "delete">;
    kms?: KeyManagementPort;
    keyId?: string;
    handoffPort?: PrecheckinHandoffPort;
    piiAccessAudit?: PiiAccessAuditPort;
    retention?: RetentionConfig;
    /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
    flags?: Record<FlagKey, boolean>;
    /** The running environment, passed to the go-live guard (config/go-live-guards.ts). Defaults to `"development"`. */
    nodeEnv?: NodeEnvName;
    /** `ADAPTER_PRECHECKIN_HANDOFF` (env.ts); defaults to `"stub"`. The go-live guard refuses `precheckin.production_collection: true` in production/staging while this stays `"stub"`. */
    adapterPrecheckinHandoff?: string;
    retentionPolicyId?: string;
    consentTextVersion?: string;
    kmsKeyConfigured?: boolean;
    now?: () => Date;
  };
  /**
   * WiFi entitlement-activation + SIR-registration/e-receipt-issuance job
   * wiring (task 10.3). Same opt-in convention as `precheckin` above:
   * omitted entirely, `startWorker` registers neither job; `main-worker.ts`
   * always passes it so the real worker process always runs the go-live
   * guard and registers both jobs.
   */
  wifiCheckout?: {
    orderStore?: WifiOrderStore;
    packageStore?: Pick<WifiPackageStore, "findById">;
    entitlement?: Pick<WifiEntitlementPort, "grant">;
    sirPos?: Pick<SirPosPort, "registerSale">;
    eReceipt?: Pick<EReceiptPort, "issue">;
    /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
    flags?: Record<FlagKey, boolean>;
    /** The running environment, passed to the go-live guard. Defaults to `"development"`. */
    nodeEnv?: NodeEnvName;
    /** `ADAPTER_PAYMENT` (env.ts); defaults to `"stub"`. See `BuildAppOptions.wifiCheckout.adapterPayment`. */
    adapterPayment?: string;
    /** `ADAPTER_RECEIPT` (env.ts); defaults to `"stub"`. */
    adapterReceipt?: string;
    /** `ADAPTER_SIR_POS` (env.ts); defaults to `"stub"`. */
    adapterSirPos?: string;
    /** `ADAPTER_WIFI_ENTITLEMENT` (env.ts); defaults to `"stub"`. */
    adapterWifiEntitlement?: string;
    now?: () => Date;
    /** `usage-analytics` funnel instrumentation (task 12.2) for the entitlement-activated event, recorded from this worker's own activation scan. */
    analytics?: Pick<AnalyticsRecorder, "record">;
  };
  /**
   * Journey-poll job wiring (task 11.2). Same opt-in convention as
   * `precheckin`/`wifiCheckout` above: omitted entirely, `startWorker`
   * registers no journey-poll job; `main-worker.ts` always passes it so the
   * real worker process always runs the go-live guard and registers the job.
   */
  notifications?: {
    /** Overrides `accessLinkStore`/`sirBooking`-driven polling entirely; mainly for tests. */
    journeyEventSource?: JourneyEventSourcePort;
    /** Used to build the default `sir-polling` adapter when `journeyEventSource` is not given. Defaults to a fresh in-memory store (documented gap: a real deployment needs this to be the same store the `api` process writes to, pending a Drizzle-backed `access_link` adapter — see `sdd/travel-hub-mvp/apply-progress`). */
    accessLinkStore?: Pick<AccessLinkStore, "listActive">;
    sirBooking?: Pick<SirBookingPort, "getReservation" | "getRelocations">;
    notificationStore?: NotificationStore;
    subscriptionStore?: PushSubscriptionStore;
    webPush?: WebPushPort;
    alertSourcePolicy?: AlertSourcePolicy;
    /** "Near-term departures" window width in hours (design Decision 11). Defaults to 48. */
    pollWindowHours?: number;
    /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
    flags?: Record<FlagKey, boolean>;
    /** The running environment, passed to the go-live guard. Defaults to `"development"`. */
    nodeEnv?: NodeEnvName;
    /** `ADAPTER_WEB_PUSH` (env.ts); defaults to `"stub"`. */
    adapterWebPush?: string;
    vapidConfigured?: boolean;
    pushConsentTextVersion?: string;
    now?: () => Date;
    /** Push-subscription retention/purge scheduler wiring (task 12.3); shares `piiAccessAudit` with `precheckin`'s own purge job when both are configured. Defaults to a fresh in-memory audit instance. */
    piiAccessAudit?: PiiAccessAuditPort;
  };
  /**
   * D4a staff-alert dispatch job wiring (task 11.5). Same opt-in convention
   * as `precheckin`/`wifiCheckout`/`notifications` above: omitted entirely,
   * `startWorker` registers no dispatch job; `main-worker.ts` always passes
   * it so the real worker process always runs the go-live guard and
   * registers the job.
   */
  pulse?: {
    staffAlertStore?: StaffAlertStore;
    staffAlertPort?: Pick<StaffAlertPort, "send">;
    /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
    flags?: Record<FlagKey, boolean>;
    /** The running environment, passed to the go-live guard. Defaults to `"development"`. */
    nodeEnv?: NodeEnvName;
    /** `ADAPTER_STAFF_ALERT` (env.ts); defaults to `"stub"`. */
    adapterStaffAlert?: string;
    staffAlertReceiverId?: string;
    staffAlertProtocolRef?: string;
    staffAlertRetentionDays?: number;
    now?: () => Date;
    /** `pulse_response`/`staff_alert` retention/purge scheduler wiring (task 12.3). Should be the SAME `pulseResponseStore` instance `buildApp({ pulse })`'s `POST /api/pulse` route writes to, in a real deployment. */
    pulseResponseStore?: Pick<PulseResponseStore, "listPastPurgeAfter" | "deleteById">;
    piiAccessAudit?: PiiAccessAuditPort;
  };
  /**
   * `usage-analytics` forward-job wiring (task 12.1). Same opt-in convention
   * as `precheckin`/`wifiCheckout`/`notifications`/`pulse` above: omitted
   * entirely, `startWorker` registers no analytics forward job. When given,
   * `analyticsEventStore` should be the SAME instance the `api` process's
   * `buildApp({ analytics })` was given, so events recorded via `POST
   * /api/events` or any task 12.2 funnel call site are visible to this job.
   */
  analytics?: {
    analyticsEventStore?: AnalyticsEventStore;
    analyticsSink?: Pick<AnalyticsSinkPort, "forward">;
    /** `ADAPTER_ANALYTICS_SINK` (env.ts); defaults to `"stub"`. Not go-live-guarded (task 12.1: `usage-analytics` is not a `GuardedFlagKey`). */
    adapterAnalyticsSink?: string;
    now?: () => Date;
  };
}

const INERT_GO_LIVE_ADAPTERS: GoLiveContext["adapters"] = {
  precheckinHandoff: "stub",
  webPush: "stub",
  staffAlert: "stub",
  payment: "stub",
  receipt: "stub",
  sirPos: "stub",
  wifiEntitlement: "stub",
  content: "stub",
};

const noopSampleJobExecutor: SampleJobExecutor = {
  async execute() {
    // No real downstream side effect yet — the sample job exists to prove
    // the queue's natural-key dedupe and bounded-retry/dead-letter wiring
    // (task 3.4's acceptance criteria), not to perform real work.
  },
};

/**
 * Boots the `worker` process's wiring: starts the given queue client and
 * registers every worker-owned job on it. Currently registers the task 3.4
 * sample job; later work units' capability modules register their own jobs
 * here as they land.
 */
export async function startWorker(options: StartWorkerOptions): Promise<WorkerBootResult> {
  await options.queueClient.start();
  await registerSampleJob(options.queueClient, options.sampleJobExecutor ?? noopSampleJobExecutor);
  const jobsRegistered: string[] = [SAMPLE_JOB_QUEUE];

  if (options.precheckin) {
    const p = options.precheckin;
    const flags = p.flags ?? FLAG_DEFAULTS;
    const nodeEnv = p.nodeEnv ?? "development";
    const adapterPrecheckinHandoff = p.adapterPrecheckinHandoff ?? "stub";

    // The go-live guard below only checks the adapter *name*; without this
    // check, declaring a non-stub ADAPTER_PRECHECKIN_HANDOFF without also
    // wiring a real `handoffPort` would let the guard pass while
    // `registerHandoffJob` below silently falls back to
    // `createPrecheckinHandoffStub()`, so pre-check-in PII would never
    // actually reach the declared adapter.
    if (adapterPrecheckinHandoff !== "stub" && !p.handoffPort) {
      throw new Error(
        `ADAPTER_PRECHECKIN_HANDOFF="${adapterPrecheckinHandoff}" has no real adapter wired in; ` +
          "startWorker's precheckin.handoffPort must be provided, or ADAPTER_PRECHECKIN_HANDOFF must stay \"stub\".",
      );
    }

    // Design Decision 13's go-live guard, wired to this module (task 8.5):
    // the worker refuses to boot its precheckin jobs if
    // `precheckin.production_collection` is enabled in production/staging
    // without its declared prerequisites (real handoff adapter, retention
    // policy/days, approved consent text version, a real KMS key).
    assertGoLiveGuard("precheckin.production_collection", flags["precheckin.production_collection"], {
      nodeEnv,
      adapters: { ...INERT_GO_LIVE_ADAPTERS, precheckinHandoff: adapterPrecheckinHandoff },
      precheckin: {
        ...(p.retentionPolicyId ? { retentionPolicyId: p.retentionPolicyId } : {}),
        ...(p.retention?.retentionDays ? { retentionDays: p.retention.retentionDays } : {}),
        ...(p.consentTextVersion ? { consentTextVersion: p.consentTextVersion } : {}),
        kmsKeyConfigured: p.kmsKeyConfigured ?? false,
      },
      push: { vapidConfigured: false, alertSourcePolicyComplete: false },
    pulseCapture: {},
    pulseStaffAlerts: {},
    });

    const jobDeps = {
      submissionStore: p.submissionStore ?? createInMemorySubmissionStore(),
      documentStore: p.documentStore ?? createPrecheckinDocumentStoreStub(),
      kms: p.kms ?? createKmsStub(),
      keyId: p.keyId ?? DEFAULT_PRECHECKIN_KEY_ID,
      piiAccessAudit: p.piiAccessAudit ?? createInMemoryPiiAccessAudit(),
      retention: p.retention ?? resolveRetentionConfig({}),
      ...(p.now ? { now: p.now } : {}),
    };

    await registerHandoffJob(options.queueClient, {
      ...jobDeps,
      handoffPort: p.handoffPort ?? createPrecheckinHandoffStub(),
    });
    await registerPurgeJob(options.queueClient, jobDeps);
    jobsRegistered.push(PRECHECKIN_HANDOFF_QUEUE, PRECHECKIN_PURGE_QUEUE);
  }

  if (options.wifiCheckout) {
    const w = options.wifiCheckout;
    const flags = w.flags ?? FLAG_DEFAULTS;
    const nodeEnv = w.nodeEnv ?? "development";
    const adapterPayment = w.adapterPayment ?? "stub";
    const adapterReceipt = w.adapterReceipt ?? "stub";
    const adapterSirPos = w.adapterSirPos ?? "stub";
    const adapterWifiEntitlement = w.adapterWifiEntitlement ?? "stub";

    // Same defense-in-depth check as precheckin's `handoffPort` guard above:
    // without it, declaring a non-stub adapter name without wiring in its
    // real port would let the go-live guard pass while `registerWifiOrderJobs`
    // below silently falls back to the stub, so the declared adapter would
    // never actually run.
    if (adapterWifiEntitlement !== "stub" && !w.entitlement) {
      throw new Error(
        `ADAPTER_WIFI_ENTITLEMENT="${adapterWifiEntitlement}" has no real adapter wired in; ` +
          'startWorker\'s wifiCheckout.entitlement must be provided, or ADAPTER_WIFI_ENTITLEMENT must stay "stub".',
      );
    }
    if (adapterSirPos !== "stub" && !w.sirPos) {
      throw new Error(
        `ADAPTER_SIR_POS="${adapterSirPos}" has no real adapter wired in; ` +
          'startWorker\'s wifiCheckout.sirPos must be provided, or ADAPTER_SIR_POS must stay "stub".',
      );
    }
    if (adapterReceipt !== "stub" && !w.eReceipt) {
      throw new Error(
        `ADAPTER_RECEIPT="${adapterReceipt}" has no real adapter wired in; ` +
          'startWorker\'s wifiCheckout.eReceipt must be provided, or ADAPTER_RECEIPT must stay "stub".',
      );
    }

    // Design Decision 13's go-live guard, wired to this module (task 10.3):
    // the worker refuses to register real entitlement/SIR/receipt jobs
    // against production/staging unless every one of
    // payment/receipt/SIR-POS/entitlement is declared non-stub — the same
    // full `checkWifiCheckout` check `buildApp()` runs for the api process,
    // defense-in-depth against the worker process being booted with a
    // production flag directly.
    assertGoLiveGuard("wifi.checkout", flags["wifi.checkout"], {
      nodeEnv,
      adapters: {
        ...INERT_GO_LIVE_ADAPTERS,
        payment: adapterPayment,
        receipt: adapterReceipt,
        sirPos: adapterSirPos,
        wifiEntitlement: adapterWifiEntitlement,
      },
      precheckin: { kmsKeyConfigured: false },
      push: { vapidConfigured: false, alertSourcePolicyComplete: false },
    pulseCapture: {},
    pulseStaffAlerts: {},
    });

    await registerWifiOrderJobs(options.queueClient, {
      orderStore: w.orderStore ?? createInMemoryWifiOrderStore(),
      packageStore: w.packageStore ?? createWifiPackageStub(),
      entitlement: w.entitlement ?? createWifiEntitlementStub(),
      sirPos: w.sirPos ?? createSirPosStub(),
      eReceipt: w.eReceipt ?? createEReceiptStub(),
      ...(w.now ? { now: w.now } : {}),
      ...(w.analytics ? { analytics: w.analytics } : {}),
    });
    jobsRegistered.push(WIFI_ENTITLEMENT_ACTIVATION_QUEUE, WIFI_SIR_RECEIPT_QUEUE);
  }

  if (options.notifications) {
    const n = options.notifications;
    const flags = n.flags ?? FLAG_DEFAULTS;
    const nodeEnv = n.nodeEnv ?? "development";
    const adapterWebPush = n.adapterWebPush ?? "stub";
    const alertSourcePolicy = n.alertSourcePolicy ?? DEFAULT_ALERT_SOURCE_POLICY;

    // Same defense-in-depth check as precheckin's `handoffPort`/wifiCheckout's
    // adapter guards above: without it, declaring a non-stub
    // ADAPTER_WEB_PUSH without also wiring a real `webPush` port would let
    // the go-live guard pass while `registerJourneyPollJob` below silently
    // falls back to `createWebPushStub()`, so no push notification would
    // ever actually reach the declared adapter.
    if (adapterWebPush !== "stub" && !n.webPush) {
      throw new Error(
        `ADAPTER_WEB_PUSH="${adapterWebPush}" has no real adapter wired in; ` +
          'startWorker\'s notifications.webPush must be provided, or ADAPTER_WEB_PUSH must stay "stub".',
      );
    }

    // Design Decision 13's go-live guard, wired to this module (task 11.2):
    // the worker refuses to register the real journey-poll job against
    // production/staging unless VAPID keys, a complete AlertSourcePolicy,
    // and an approved consent text version are all declared — the same full
    // `checkPushEnabled` check `buildApp()` runs for the api process,
    // defense-in-depth against the worker process being booted with a
    // production flag directly.
    assertGoLiveGuard("push.enabled", flags["push.enabled"], {
      nodeEnv,
      adapters: { ...INERT_GO_LIVE_ADAPTERS, webPush: adapterWebPush },
      precheckin: { kmsKeyConfigured: false },
      push: {
        vapidConfigured: n.vapidConfigured ?? false,
        alertSourcePolicyComplete: isAlertSourcePolicyComplete(alertSourcePolicy),
        ...(n.pushConsentTextVersion ? { consentTextVersion: n.pushConsentTextVersion } : {}),
      },
    pulseCapture: {},
    pulseStaffAlerts: {},
    });

    const journeyEventSource =
      n.journeyEventSource ??
      createSirPollingJourneyEventAdapter({
        accessLinkStore: n.accessLinkStore ?? createInMemoryAccessLinkStore(),
        sirBooking: n.sirBooking ?? createSirBookingStub(),
      });

    await registerJourneyPollJob(options.queueClient, {
      journeyEventSource,
      notificationStore: n.notificationStore ?? createInMemoryNotificationStore(),
      subscriptionStore: n.subscriptionStore ?? createInMemoryPushSubscriptionStore(),
      webPush: n.webPush ?? createWebPushStub(),
      alertSourcePolicy,
      pollWindowHours: n.pollWindowHours ?? 48,
      ...(n.now ? { now: n.now } : {}),
    });
    jobsRegistered.push(JOURNEY_POLL_QUEUE);

    // Push-subscription retention/purge scheduler (task 12.3): registered
    // alongside the journey-poll job since both share this same
    // `notifications` options block and its `subscriptionStore`.
    await registerPushSubscriptionPurgeJob(options.queueClient, {
      subscriptionStore: n.subscriptionStore ?? createInMemoryPushSubscriptionStore(),
      piiAccessAudit: n.piiAccessAudit ?? createInMemoryPiiAccessAudit(),
      ...(n.now ? { now: n.now } : {}),
    });
    jobsRegistered.push(PUSH_SUBSCRIPTION_PURGE_QUEUE);
  }

  if (options.pulse) {
    const p = options.pulse;
    const flags = p.flags ?? FLAG_DEFAULTS;
    const nodeEnv = p.nodeEnv ?? "development";
    const adapterStaffAlert = p.adapterStaffAlert ?? "stub";
    // Threaded into every default pulse_response/staff_alert store below so
    // a configured STAFF_ALERT_RETENTION_DAYS actually reaches purgeAfter,
    // not just the go-live guard check further down.
    const pulseRetention = resolvePulseRetentionConfig({
      ...(p.staffAlertRetentionDays !== undefined ? { STAFF_ALERT_RETENTION_DAYS: p.staffAlertRetentionDays } : {}),
    });
    const pulseNow = p.now ?? (() => new Date());

    // Same defense-in-depth check as precheckin's `handoffPort`/wifiCheckout's/
    // notifications' adapter guards above: without it, declaring a non-stub
    // ADAPTER_STAFF_ALERT without also wiring a real `staffAlertPort` would
    // let the go-live guard pass while `registerStaffAlertDispatchJob` below
    // silently falls back to `createStaffAlertStub()`, so no D4a alert would
    // ever actually reach the declared adapter.
    if (adapterStaffAlert !== "stub" && !p.staffAlertPort) {
      throw new Error(
        `ADAPTER_STAFF_ALERT="${adapterStaffAlert}" has no real adapter wired in; ` +
          'startWorker\'s pulse.staffAlertPort must be provided, or ADAPTER_STAFF_ALERT must stay "stub".',
      );
    }

    // Design Decision 13's go-live guard, wired to this module (task 11.5):
    // the worker refuses to register the real D4a dispatch job against
    // production/staging unless a non-stub StaffAlertPort and the receiver/
    // protocol/retention config are all declared — the same full
    // `checkPulseStaffAlerts` check `buildApp()` runs for the api process,
    // defense-in-depth against the worker process being booted with a
    // production flag directly.
    assertGoLiveGuard("pulse.staff_alerts", flags["pulse.staff_alerts"], {
      nodeEnv,
      adapters: { ...INERT_GO_LIVE_ADAPTERS, staffAlert: adapterStaffAlert },
      precheckin: { kmsKeyConfigured: false },
      push: { vapidConfigured: false, alertSourcePolicyComplete: false },
      pulseCapture: {},
      pulseStaffAlerts: {
        ...(p.staffAlertReceiverId ? { receiverId: p.staffAlertReceiverId } : {}),
        ...(p.staffAlertProtocolRef ? { protocolRef: p.staffAlertProtocolRef } : {}),
        ...(p.staffAlertRetentionDays ? { retentionDays: p.staffAlertRetentionDays } : {}),
      },
    });

    const sharedStaffAlertStore = p.staffAlertStore ?? createInMemoryStaffAlertStore(pulseNow, pulseRetention);
    const sharedPulseResponseStore = p.pulseResponseStore ?? createInMemoryPulseResponseStore(pulseNow, pulseRetention);

    await registerStaffAlertDispatchJob(options.queueClient, {
      staffAlertStore: sharedStaffAlertStore,
      staffAlertPort: p.staffAlertPort ?? createStaffAlertStub(),
      ...(p.now ? { now: p.now } : {}),
    });
    jobsRegistered.push(STAFF_ALERT_DISPATCH_QUEUE);

    // `pulse_response`/`staff_alert` retention/purge scheduler (task 12.3):
    // registered alongside the D4a dispatch job since both share this same
    // `pulse` options block.
    await registerPulsePurgeJob(options.queueClient, {
      pulseResponseStore: sharedPulseResponseStore,
      staffAlertStore: sharedStaffAlertStore,
      piiAccessAudit: p.piiAccessAudit ?? createInMemoryPiiAccessAudit(),
      ...(p.now ? { now: p.now } : {}),
    });
    jobsRegistered.push(PULSE_PURGE_QUEUE);
  }

  if (options.analytics) {
    const a = options.analytics;
    const adapterAnalyticsSink = a.adapterAnalyticsSink ?? "stub";

    // Same defense-in-depth check as every other adapter above: without it,
    // declaring a non-stub ADAPTER_ANALYTICS_SINK without also wiring a real
    // `analyticsSink` would let this job silently fall back to
    // `createAnalyticsSinkStub()`, so no event would ever actually reach the
    // declared adapter. Not go-live-guarded (task 12.1: `usage-analytics` is
    // not a `GuardedFlagKey`), but still fails loudly on a misconfiguration.
    if (adapterAnalyticsSink !== "stub" && !a.analyticsSink) {
      throw new Error(
        `ADAPTER_ANALYTICS_SINK="${adapterAnalyticsSink}" has no real adapter wired in; ` +
          'startWorker\'s analytics.analyticsSink must be provided, or ADAPTER_ANALYTICS_SINK must stay "stub".',
      );
    }
    // A fresh default `analyticsEventStore` here is a separate process's
    // in-memory map from the `api` process's — with a real sink configured,
    // that split would make this job silently forward nothing, forever,
    // with no error (the exact failure the queue's own success signal would
    // otherwise mask). Only safe to default when the sink is also the stub.
    if (adapterAnalyticsSink !== "stub" && !a.analyticsEventStore) {
      throw new Error(
        `ADAPTER_ANALYTICS_SINK="${adapterAnalyticsSink}" has no shared analyticsEventStore wired in; ` +
          "startWorker's analytics.analyticsEventStore must be the SAME instance the api process's " +
          'buildApp({ analytics }) was given, or ADAPTER_ANALYTICS_SINK must stay "stub".',
      );
    }

    await registerForwardAnalyticsEventsJob(options.queueClient, {
      analyticsEventStore: a.analyticsEventStore ?? createInMemoryAnalyticsEventStore(),
      analyticsSink: a.analyticsSink ?? createAnalyticsSinkStub(),
      ...(a.now ? { now: a.now } : {}),
    });
    jobsRegistered.push(ANALYTICS_FORWARD_QUEUE);
  }

  return { jobsRegistered };
}
