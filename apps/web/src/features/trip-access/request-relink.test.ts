import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../shared/api/client.js";
import { requestRelink } from "./request-relink.js";

function buildFakeApiClient(post: ApiClient["post"]): ApiClient {
  return { get: vi.fn(), post, delete: vi.fn() };
}

describe("requestRelink", () => {
  it("posts reservationRef, surname and locale to /api/links/reissue", async () => {
    const post = vi.fn().mockResolvedValue({ status: "accepted" });
    const apiClient = buildFakeApiClient(post);

    await requestRelink(apiClient, { reservationRef: "RES-1001", surname: "Torres", locale: "es" });

    expect(post).toHaveBeenCalledWith("/api/links/reissue", {
      reservationRef: "RES-1001",
      surname: "Torres",
      locale: "es",
    });
  });

  it("resolves even when the server's uniform response implies no match (never surfaces a match/no-match signal)", async () => {
    const post = vi.fn().mockResolvedValue({ status: "accepted" });
    const apiClient = buildFakeApiClient(post);

    await expect(
      requestRelink(apiClient, { reservationRef: "RES-1001", surname: "Nobody", locale: "es" }),
    ).resolves.toBeUndefined();
  });
});
