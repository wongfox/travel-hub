import { describe, expect, it } from "vitest";
import { resolveAccessLinkByToken } from "./resolve-link.js";
import { createInMemoryAccessLinkStore } from "./access-link-store.js";

describe("resolveAccessLinkByToken", () => {
  it("returns null for a token that was never issued", async () => {
    const store = createInMemoryAccessLinkStore();

    const record = await resolveAccessLinkByToken("never-issued-token", store);

    expect(record).toBeNull();
  });
});
