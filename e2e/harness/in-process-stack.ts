import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, statSync, createReadStream } from "node:fs";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
// The BFF is consumed from its BUILT output (`pnpm --filter bff build`), the
// same artifact the production image runs. Nothing here adds a route or a
// production code path: the harness only uses the composition root's own
// injection options and the stub adapters' in-process inspection seams.
import { buildApp, startWorker } from "../../services/bff/dist/composition-root.js";
import { resolveFlags, type FlagKey } from "../../services/bff/dist/config/flags.js";
import { createInMemoryQueueClient } from "../../services/bff/dist/infra/queue/queue-client.js";
import { createLinkDeliveryStub } from "../../services/bff/dist/adapters/link-delivery/stub.js";
import { createStaffAlertStub } from "../../services/bff/dist/adapters/staff-alert/stub.js";
import { createPaymentGatewayStub } from "../../services/bff/dist/adapters/payment-gateway/stub.js";
import { createInMemoryRateLimiter } from "../../services/bff/dist/modules/trip-access/rate-limiter.js";
import { createInMemoryAccessLinkStore } from "../../services/bff/dist/modules/trip-access/access-link-store.js";
import { createInMemoryWifiOrderStore } from "../../services/bff/dist/modules/wifi-checkout/wifi-order-store.js";
import { createInMemoryPulseResponseStore } from "../../services/bff/dist/modules/pulse/pulse-response-store.js";
import { createInMemoryStaffAlertStore } from "../../services/bff/dist/modules/pulse/staff-alert-store.js";
import { createInMemoryPushSubscriptionStore } from "../../services/bff/dist/modules/notifications/push-subscription-store.js";
import { createInMemoryAnalyticsEventStore } from "../../services/bff/dist/modules/analytics/analytics-event-store.js";
import { WIFI_ENTITLEMENT_ACTIVATION_QUEUE, WIFI_SIR_RECEIPT_QUEUE } from "../../services/bff/dist/modules/wifi-checkout/wifi-order-jobs.js";
import { STAFF_ALERT_DISPATCH_QUEUE } from "../../services/bff/dist/modules/pulse/dispatch-staff-alerts-job.js";

export const E2E_INTERNAL_LINKS_API_KEY = "e2e-in-process-internal-links-key";

/** Flags the scenarios need; `precheckin.capture_ui` stays off (gap D: no web route exists for it). */
const E2E_FLAG_OVERRIDES: Partial<Record<FlagKey, boolean>> = {
  "wifi.checkout": true,
  "push.enabled": true,
  "pulse.capture": true,
  "pulse.staff_alerts": true,
  "menu.enabled": true,
  "destination.enabled": true,
};

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

export interface InProcessStack {
  /** Same-origin web URL (static bundle + proxied `/api`, `/webhooks`, `/healthz`), like the nginx front. */
  readonly webUrl: string;
  /** The BFF's own listening URL; `/internal/*` is reachable ONLY here, never via `webUrl`. */
  readonly apiUrl: string;
  readonly internalApiKey: string;
  /** Stub adapters shared by the in-process api and worker; read directly, never over HTTP. */
  readonly linkDelivery: ReturnType<typeof createLinkDeliveryStub>;
  readonly staffAlert: ReturnType<typeof createStaffAlertStub>;
  readonly paymentGateway: ReturnType<typeof createPaymentGatewayStub>;
  readonly wifiOrderStore: ReturnType<typeof createInMemoryWifiOrderStore>;
  /** Issues a request straight into the in-process Fastify app (no socket). */
  inject(opts: { method: "GET" | "POST"; url: string; headers?: Record<string, string>; payload?: unknown }): Promise<{
    statusCode: number;
    body: string;
    json<T = unknown>(): T;
  }>;
  /** Triggers every worker scan once and awaits it (what the periodic scheduler does in production). */
  runJobs(): Promise<void>;
  close(): Promise<void>;
}

export interface StartInProcessStackOptions {
  /** Directory holding the built web bundle. Defaults to `<repo>/apps/web/dist`. */
  webDist?: string;
  /** Background job-scan interval in ms (0 disables; `runJobs()` stays available). */
  jobIntervalMs?: number;
}

function defaultWebDist(): string {
  return fileURLToPath(new URL("../../apps/web/dist", import.meta.url));
}

function proxy(target: AddressInfo, req: IncomingMessage, res: ServerResponse): void {
  const upstream = httpRequest(
    {
      host: "127.0.0.1",
      port: target.port,
      method: req.method ?? "GET",
      path: req.url ?? "/",
      headers: {
        ...req.headers,
        "x-forwarded-for": req.socket.remoteAddress ?? "127.0.0.1",
        "x-forwarded-proto": "http",
      },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
      upstreamRes.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(upstream);
}

/**
 * Mirrors `apps/web/docker/nginx.conf`: `/api/`, `/webhooks/` and exactly
 * `/healthz` are proxied to the BFF; `/internal` is NOT proxied (falls through
 * to the SPA fallback like any other unmatched path); `/index.html` is
 * `no-cache`; `/assets/` is immutable; every other unmatched path serves
 * `index.html`.
 */
function createWebServer(webDist: string, bff: AddressInfo): Server {
  const root = resolve(webDist);
  return createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;
    if (path.startsWith("/api/") || path.startsWith("/webhooks/") || path === "/healthz") {
      proxy(bff, req, res);
      return;
    }
    const candidate = normalize(join(root, decodeURIComponent(path)));
    const insideRoot = candidate === root || candidate.startsWith(root + sep);
    const isFile = insideRoot && existsSync(candidate) && statSync(candidate).isFile();
    const file = isFile ? candidate : join(root, "index.html");
    const headers: Record<string, string> = {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
    };
    if (file.endsWith(`${sep}index.html`)) headers["cache-control"] = "no-cache";
    else if (path.startsWith("/assets/")) headers["cache-control"] = "public, max-age=31536000, immutable";
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  });
}

function listen(server: Server): Promise<AddressInfo> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveListen(server.address() as AddressInfo));
  });
}

/**
 * Starts the BFF api + worker IN ONE PROCESS, sharing every store the two
 * production processes cannot share today (gap C) and the same stub adapter
 * instances, with feature flags enabled through the composition root's own
 * options (gap B) and a non-production `nodeEnv`.
 */
export async function startInProcessStack(options: StartInProcessStackOptions = {}): Promise<InProcessStack> {
  const webDist = options.webDist ?? defaultWebDist();
  if (!existsSync(join(webDist, "index.html"))) {
    throw new Error(`Built web bundle not found at ${webDist}; run \`pnpm --filter web build\` first.`);
  }

  const flags = resolveFlags(E2E_FLAG_OVERRIDES);
  const nodeEnv = "test" as const;

  const queueClient = createInMemoryQueueClient();
  const linkDelivery = createLinkDeliveryStub();
  const staffAlert = createStaffAlertStub();
  const paymentGateway = createPaymentGatewayStub();
  const accessLinkStore = createInMemoryAccessLinkStore();
  const wifiOrderStore = createInMemoryWifiOrderStore();
  const staffAlertStore = createInMemoryStaffAlertStore();
  const pulseResponseStore = createInMemoryPulseResponseStore();
  const subscriptionStore = createInMemoryPushSubscriptionStore();
  const analyticsEventStore = createInMemoryAnalyticsEventStore();

  // Specs run many session exchanges from one client address; the production
  // limits would throttle the suite itself, not exercise anything.
  const generousLimiter = () => createInMemoryRateLimiter({ max: 10_000, windowMs: 60_000 });

  const app = buildApp({
    logger: false,
    tripAccess: {
      nodeEnv,
      internalApiKey: E2E_INTERNAL_LINKS_API_KEY,
      accessLinkStore,
      linkDelivery,
      sessionRateLimiter: generousLimiter(),
      reissueRateLimiter: generousLimiter(),
    },
    trip: { flags },
    content: { nodeEnv, flags },
    wifiCheckout: { nodeEnv, flags, orderStore: wifiOrderStore, paymentGateway },
    notifications: { nodeEnv, flags, subscriptionStore },
    pulse: { nodeEnv, flags, staffAlertStore, pulseResponseStore },
    analytics: { analyticsEventStore },
  });

  await startWorker({
    queueClient,
    wifiCheckout: { nodeEnv, flags, orderStore: wifiOrderStore },
    notifications: { nodeEnv, flags, accessLinkStore, subscriptionStore },
    pulse: { nodeEnv, flags, staffAlertStore, staffAlertPort: staffAlert, pulseResponseStore },
    analytics: { analyticsEventStore },
  });

  await app.listen({ port: 0, host: "127.0.0.1" });
  const bffAddress = app.server.address() as AddressInfo;
  const webServer = createWebServer(webDist, bffAddress);
  const webAddress = await listen(webServer);

  const scanQueues = [WIFI_ENTITLEMENT_ACTIVATION_QUEUE, WIFI_SIR_RECEIPT_QUEUE, STAFF_ALERT_DISPATCH_QUEUE];
  let running: Promise<void> | null = null;
  const runJobs = (): Promise<void> => {
    running ??= (async () => {
      try {
        for (const queue of scanQueues) {
          await queueClient.sendIdempotent(queue, "e2e-scan", {});
          await queueClient.runPendingOnce(queue);
        }
      } finally {
        running = null;
      }
    })();
    return running;
  };
  const interval =
    (options.jobIntervalMs ?? 250) > 0
      ? setInterval(() => void runJobs().catch(() => undefined), options.jobIntervalMs ?? 250)
      : null;

  return {
    webUrl: `http://127.0.0.1:${webAddress.port}`,
    apiUrl: `http://127.0.0.1:${bffAddress.port}`,
    internalApiKey: E2E_INTERNAL_LINKS_API_KEY,
    linkDelivery,
    staffAlert,
    paymentGateway,
    wifiOrderStore,
    async inject(opts) {
      const response = await app.inject({
        method: opts.method,
        url: opts.url,
        ...(opts.headers ? { headers: opts.headers } : {}),
        ...(opts.payload !== undefined ? { payload: opts.payload as string | object } : {}),
      });
      return {
        statusCode: response.statusCode,
        body: response.body,
        json: <T>() => response.json() as T,
      };
    },
    runJobs,
    async close() {
      if (interval) clearInterval(interval);
      await running?.catch(() => undefined);
      webServer.closeAllConnections();
      await new Promise<void>((done) => webServer.close(() => done()));
      await app.close();
      await queueClient.stop();
    },
  };
}
