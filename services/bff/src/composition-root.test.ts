import { describe, expect, it } from "vitest";
import { buildApp, startWorker } from "./composition-root.js";

describe("buildApp", () => {
  it("responds 200 with an ok status on GET /healthz", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/healthz" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for an undefined route, proving the app does not blanket-match", async () => {
    const app = buildApp();

    const response = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(response.statusCode).toBe(404);
  });
});

describe("startWorker", () => {
  it("resolves with zero registered jobs (no queue wired yet — that lands in a later work unit)", async () => {
    const result = await startWorker();

    expect(result.jobsRegistered).toEqual([]);
  });
});
