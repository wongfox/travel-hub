import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerSecurityPlugins } from "./security-plugins.js";

describe("registerSecurityPlugins", () => {
  it("sets the CSP, Referrer-Policy, and Permissions-Policy headers on every response", async () => {
    const app = Fastify();
    await registerSecurityPlugins(app);
    app.get("/probe", async () => ({ ok: true }));

    const response = await app.inject({ method: "GET", url: "/probe" });

    expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["permissions-policy"]).toBe("camera=(self)");
  });

  it("sets the same security headers on a different route, proving they are not route-specific", async () => {
    const app = Fastify();
    await registerSecurityPlugins(app);
    app.get("/other-route", async () => ({ ok: true }));

    const response = await app.inject({ method: "GET", url: "/other-route" });

    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["permissions-policy"]).toBe("camera=(self)");
  });

  it("returns 429 once a route decorated with the rate-limit plugin exceeds its configured threshold", async () => {
    const app = Fastify();
    await registerSecurityPlugins(app);
    app.get(
      "/limited",
      { config: { rateLimit: { max: 2, timeWindow: 60_000 } } },
      async () => ({ ok: true }),
    );
    await app.ready();

    const first = await app.inject({ method: "GET", url: "/limited" });
    const second = await app.inject({ method: "GET", url: "/limited" });
    const third = await app.inject({ method: "GET", url: "/limited" });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(third.statusCode).toBe(429);
  });
});
