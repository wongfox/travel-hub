import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client.js";
import { createPushSubscription, deletePushSubscription } from "./get-push.js";

function buildApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe("createPushSubscription", () => {
  it("POSTs to /api/push/subscriptions with the subscription body", async () => {
    const post = vi.fn().mockResolvedValue({ id: "sub-1", expiresAt: "2026-11-05T00:00:00.000Z" });
    const apiClient = buildApiClient({ post });

    const result = await createPushSubscription(apiClient, {
      endpoint: "https://push.example.com/endpoint-1",
      keys: { p256dh: "p1", auth: "a1" },
      locale: "es",
    });

    expect(post).toHaveBeenCalledWith("/api/push/subscriptions", {
      endpoint: "https://push.example.com/endpoint-1",
      keys: { p256dh: "p1", auth: "a1" },
      locale: "es",
    });
    expect(result).toEqual({ id: "sub-1", expiresAt: "2026-11-05T00:00:00.000Z" });
  });
});

describe("deletePushSubscription", () => {
  it("DELETEs /api/push/subscriptions/:id", async () => {
    const del = vi.fn().mockResolvedValue(undefined);
    const apiClient = buildApiClient({ delete: del });

    await deletePushSubscription(apiClient, "sub-1");

    expect(del).toHaveBeenCalledWith("/api/push/subscriptions/sub-1");
  });
});
