/**
 * Composition root: the single place where adapters are wired to ports and
 * the Fastify application is assembled. Constructor-injection convention
 * per design Decision 2 — no DI framework/container.
 *
 * At this stage (task 3.1) there are no outbound ports to wire yet; this
 * file exists as the wiring point future work units (3.4+) extend.
 */
import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  logger?: boolean;
}

/**
 * Builds and configures the Fastify HTTP application for the `api` process.
 * Does not call `.listen()` — that is main-api.ts's responsibility, so the
 * app can be built and exercised via `.inject()` in tests without binding
 * a real port.
 */
export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get("/healthz", async () => {
    return { status: "ok" as const };
  });

  return app;
}

export interface WorkerBootResult {
  /** Job names registered on the worker's queue. Empty until task 3.4 wires pg-boss. */
  jobsRegistered: string[];
}

/**
 * Boots the `worker` process's wiring. No queue exists yet (pg-boss lands in
 * task 3.4), so this currently resolves immediately with zero registered
 * jobs — main-worker.ts exits cleanly right after, per task 3.1's acceptance
 * criteria.
 */
export async function startWorker(): Promise<WorkerBootResult> {
  return { jobsRegistered: [] };
}
