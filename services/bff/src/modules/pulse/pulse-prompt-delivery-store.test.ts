import { describe, expect, it } from "vitest";
import { createInMemoryPulsePromptDeliveryStore } from "./pulse-prompt-delivery-store.js";
import { DuplicatePulsePromptDeliveryError } from "./ports.js";

describe("createInMemoryPulsePromptDeliveryStore", () => {
  it("resolves on the first request for a given (reservationRef, legRef)", async () => {
    const store = createInMemoryPulsePromptDeliveryStore();

    await expect(store.create("RES-1001", "L1")).resolves.toBeUndefined();
  });

  it("REJECTS a second request for the same (reservationRef, legRef) — prevents repeated push spam for one trigger moment", async () => {
    const store = createInMemoryPulsePromptDeliveryStore();
    await store.create("RES-1001", "L1");

    await expect(store.create("RES-1001", "L1")).rejects.toThrow(DuplicatePulsePromptDeliveryError);
  });

  it("allows a different leg on the same reservation independently", async () => {
    const store = createInMemoryPulsePromptDeliveryStore();
    await store.create("RES-1001", "L1");

    await expect(store.create("RES-1001", "L2")).resolves.toBeUndefined();
  });
});
