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
import { isProductionLike } from "./config/go-live-guards.js";
import type { NodeEnvName } from "./config/env.js";
import { createRedactingLogger } from "./infra/logging/redacting-logger.js";
import { registerSecurityPlugins } from "./infra/http/security-plugins.js";
import type { QueueClient } from "./infra/queue/queue-client.js";
import { registerSampleJob, SAMPLE_JOB_QUEUE, type SampleJobExecutor } from "./infra/queue/sample-job.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "./modules/trip-access/access-link-store.js";
import { registerTripAccessRoutes } from "./modules/trip-access/http.js";
import type { LinkDeliveryPort } from "./modules/trip-access/ports.js";
import { createLinkDeliveryStub } from "./adapters/link-delivery/stub.js";

/**
 * Dev-only default: overridden in production by `INTERNAL_LINKS_API_KEY`
 * (env.ts). Design-interfaces leaves the exact service-auth mechanism open
 * ("mTLS or signed service token"); startup must never rely on this default
 * outside `development`/`test` (see main-api.ts).
 */
const DEFAULT_DEV_INTERNAL_LINKS_API_KEY = "dev-only-internal-links-key";
const DEFAULT_LINK_EXPIRY_MS = 72 * 60 * 60 * 1000; // 72h grace, per design Decision 4 (configurable)

export interface BuildAppOptions {
  /**
   * `true` builds a default redacting logger (task 3.5); pass a pre-built
   * logger (e.g. one pointed at a custom destination) to override it;
   * `false`/omitted disables logging.
   */
  logger?: boolean | Logger;
  /** `trip-link-access` issuance wiring (task 5.2). All fields default sensibly for dev/test. */
  tripAccess?: {
    accessLinkStore?: AccessLinkStore;
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
    buildLinkUrl?: (token: string) => string;
    now?: () => Date;
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
  registerTripAccessRoutes(app, {
    store: tripAccessOptions.accessLinkStore ?? createInMemoryAccessLinkStore(),
    linkDelivery: tripAccessOptions.linkDelivery ?? createLinkDeliveryStub(),
    internalApiKey: tripAccessOptions.internalApiKey ?? DEFAULT_DEV_INTERNAL_LINKS_API_KEY,
    linkExpiryMs: tripAccessOptions.linkExpiryMs ?? DEFAULT_LINK_EXPIRY_MS,
    buildLinkUrl:
      tripAccessOptions.buildLinkUrl ?? ((token: string) => `https://app.travel-hub.local/t#${token}`),
    ...(tripAccessOptions.now ? { now: tripAccessOptions.now } : {}),
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
}

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
  return { jobsRegistered: [SAMPLE_JOB_QUEUE] };
}
