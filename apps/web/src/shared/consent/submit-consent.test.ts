import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client.js";
import { submitConsent } from "./submit-consent.js";

function buildFakeApiClient(post: ApiClient["post"]): ApiClient {
  return {
    get: vi.fn(),
    post,
    delete: vi.fn(),
  };
}

describe("submitConsent", () => {
  it("posts the purpose/textVersion/granted body to /api/consents and returns the parsed state", async () => {
    const post = vi.fn().mockResolvedValue({
      purpose: "precheckin_biometric",
      granted: true,
      textVersion: "v1",
      recordedAt: "2026-09-30T12:00:00.000Z",
    });
    const apiClient = buildFakeApiClient(post);

    const result = await submitConsent(apiClient, {
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: true,
    });

    expect(post).toHaveBeenCalledWith("/api/consents", {
      purpose: "precheckin_biometric",
      textVersion: "v1",
      granted: true,
    });
    expect(result.granted).toBe(true);
  });

  it("propagates a rejection from the API client (e.g. ApiError) unchanged", async () => {
    const failure = new Error("simulated ApiError");
    const post = vi.fn().mockRejectedValue(failure);
    const apiClient = buildFakeApiClient(post);

    await expect(
      submitConsent(apiClient, { purpose: "pulse", textVersion: "v1", granted: false }),
    ).rejects.toBe(failure);
  });
});
