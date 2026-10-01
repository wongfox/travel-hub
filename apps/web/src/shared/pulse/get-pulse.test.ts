import { describe, expect, it, vi } from "vitest";
import { requestPulsePrompt, submitPulseResponse } from "./get-pulse.js";
import type { ApiClient } from "../api/client.js";

describe("submitPulseResponse", () => {
  it("POSTs to /api/pulse with the legId and score", async () => {
    const post = vi.fn().mockResolvedValue({ status: "received" });
    const apiClient = { post } as unknown as ApiClient;

    await submitPulseResponse(apiClient, { legId: "L1", score: 4 });

    expect(post).toHaveBeenCalledWith("/api/pulse", { legId: "L1", score: 4 });
  });
});

describe("requestPulsePrompt", () => {
  it("POSTs to /api/pulse/prompt with the legId", async () => {
    const post = vi.fn().mockResolvedValue({ status: "requested" });
    const apiClient = { post } as unknown as ApiClient;

    await requestPulsePrompt(apiClient, "L1");

    expect(post).toHaveBeenCalledWith("/api/pulse/prompt", { legId: "L1" });
  });
});
