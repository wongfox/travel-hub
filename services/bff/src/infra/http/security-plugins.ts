import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";

export interface SecurityPluginsOptions {
  /** Default global rate limit; individual routes may override via `config.rateLimit`. */
  rateLimit?: { max: number; timeWindowMs: number };
}

const DEFAULT_RATE_LIMIT = { max: 100, timeWindowMs: 60_000 };

/**
 * Registers the BFF's baseline HTTP security posture (design Security and
 * Privacy Design section): strict CSP, no-referrer, a locked-down
 * Permissions-Policy, global rate limiting, cookie parsing (for the
 * `__Host-th_sess` session cookie), and multipart parsing (for pre
 * check-in image uploads).
 */
export async function registerSecurityPlugins(
  app: FastifyInstance,
  options: SecurityPluginsOptions = {},
): Promise<void> {
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    referrerPolicy: { policy: "no-referrer" },
  });

  // Helmet does not set Permissions-Policy (dropped upstream); set it explicitly.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Permissions-Policy", "camera=(self)");
  });

  await app.register(cookie);
  await app.register(multipart);

  const resolvedRateLimit = options.rateLimit ?? DEFAULT_RATE_LIMIT;
  await app.register(rateLimit, {
    max: resolvedRateLimit.max,
    timeWindow: resolvedRateLimit.timeWindowMs,
  });
}
