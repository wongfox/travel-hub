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

    // Design Decision 13's go-live guard, wired to this module (task 8.5):
    // the worker refuses to boot its precheckin jobs if
    // `precheckin.production_collection` is enabled in production/staging
    // without its declared prerequisites (real handoff adapter, retention
    // policy/days, approved consent text version, a real KMS key).
    assertGoLiveGuard("precheckin.production_collection", flags["precheckin.production_collection"], {
      nodeEnv,
      adapters: { ...INERT_GO_LIVE_ADAPTERS, precheckinHandoff: p.adapterPrecheckinHandoff ?? "stub" },
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

  return { jobsRegistered };
}
