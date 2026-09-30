import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../shared/api/client.js";
import { exchangeSession } from "./exchange-session.js";

function buildFakeApiClient(post: ApiClient["post"]): ApiClient {
  return {
    get: vi.fn(),
    post,
    delete: vi.fn(),
  };
}

describe("exchangeSession", () => {
  it("posts the token to /api/session and returns the parsed result", async () => {
    const post = vi.fn().mockResolvedValue({ expiresAt: "2026-11-05T00:00:00.000Z" });
    const apiClient = buildFakeApiClient(post);

    const result = await exchangeSession(apiClient, "raw-token-value");

    expect(post).toHaveBeenCalledWith("/api/session", { token: "raw-token-value" });
    expect(result).toEqual({ expiresAt: "2026-11-05T00:00:00.000Z" });
  });

  it("propagates a rejection from the API client (e.g. ApiError) unchanged", async () => {
    const failure = new Error("simulated ApiError");
    const post = vi.fn().mockRejectedValue(failure);
    const apiClient = buildFakeApiClient(post);

    await expect(exchangeSession(apiClient, "raw-token-value")).rejects.toBe(failure);
  });
});
