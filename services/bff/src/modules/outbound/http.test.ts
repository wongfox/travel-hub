import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";
import { registerOutboundRoutes } from "./http.js";
import type { TfeRedirectConfig } from "./resolve-tfe-redirect.js";

const CONFIG: TfeRedirectConfig = {
  baseUrl: "https://www.trainexperience.example",
  allowedPlacements: { home_banner: "/offers/machu-picchu-sunset" },
  attributionParams: { utm_source: "travel-hub-app" },
};

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify();
  registerOutboundRoutes(app, { tfeConfig: CONFIG });
  return app;
}

describe("GET /api/out/tfe", () => {
  it("redirects 302 to the configured TFE URL with attribution params for an allowlisted placement", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/out/tfe?placement=home_banner" });

    expect(response.statusCode).toBe(302);
    const location = response.headers.location as string;
    expect(location).toMatch(/^https:\/\/www\.trainexperience\.example\/offers\/machu-picchu-sunset\?/);
    expect(location).toContain("utm_source=travel-hub-app");
    expect(location).toContain("placement=home_banner");
  });

  it("rejects an unknown/arbitrary placement with 400, never redirecting anywhere (task 10.5's open-redirect-safety acceptance)", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/out/tfe?placement=arbitrary-attacker-value" });

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
    expect(response.json()).toMatchObject({ code: "invalid_request" });
  });

  it("rejects a placement value that looks like a URL, never redirecting to it (open-redirect-safety)", async () => {
    const app = await buildTestApp();

    const response = await app.inject({
      method: "GET",
      url: `/api/out/tfe?placement=${encodeURIComponent("https://evil.example")}`,
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers.location).toBeUndefined();
  });

  it("rejects a missing placement query param with 400", async () => {
    const app = await buildTestApp();

    const response = await app.inject({ method: "GET", url: "/api/out/tfe" });

    expect(response.statusCode).toBe(400);
  });
});
