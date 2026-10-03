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
  registerPrivacyRoutes(app, {
    accessLinkStore,
    sessionStore,
    consentStore: sharedConsentStore,
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
  });

  const outboundOptions = options.outbound ?? {};
  registerOutboundRoutes(app, {
    tfeConfig: outboundOptions.tfeConfig ?? DEFAULT_TFE_REDIRECT_CONFIG,
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
      pulseStaffAlerts: {},
    });

    await registerWifiOrderJobs(options.queueClient, {
      orderStore: w.orderStore ?? createInMemoryWifiOrderStore(),
      packageStore: w.packageStore ?? createWifiPackageStub(),
      entitlement: w.entitlement ?? createWifiEntitlementStub(),
      sirPos: w.sirPos ?? createSirPosStub(),
      eReceipt: w.eReceipt ?? createEReceiptStub(),
      ...(w.now ? { now: w.now } : {}),
    });
    jobsRegistered.push(WIFI_ENTITLEMENT_ACTIVATION_QUEUE, WIFI_SIR_RECEIPT_QUEUE);
  }

  return { jobsRegistered };
}
