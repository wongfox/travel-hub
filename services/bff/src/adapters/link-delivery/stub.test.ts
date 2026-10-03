import { describe, expect, it } from "vitest";
import { createLinkDeliveryStub } from "./stub.js";

describe("createLinkDeliveryStub", () => {
  it("records every delivered link deterministically", async () => {
    const stub = createLinkDeliveryStub();

    await stub.deliver({ kind: "email", address: "passenger@example.com" }, "https://app/t#tok1", "es");

    expect(stub.deliveries).toEqual([
      { to: { kind: "email", address: "passenger@example.com" }, linkUrl: "https://app/t#tok1", locale: "es" },
    ]);
  });

  it("records a second, different delivery independently, proving it is not a fixed single-call fake", async () => {
    const stub = createLinkDeliveryStub();

    await stub.deliver({ kind: "sms", address: "+51999999999" }, "https://app/t#tok2", "en");
    await stub.deliver({ kind: "whatsapp", address: "+51888888888" }, "https://app/t#tok3", "pt");

    expect(stub.deliveries).toHaveLength(2);
    expect(stub.deliveries[0]?.to.kind).toBe("sms");
    expect(stub.deliveries[1]?.to.kind).toBe("whatsapp");
  });

  it("supports failure injection per design Decision 6's stub requirements", async () => {
    const stub = createLinkDeliveryStub();
    stub.simulateFailureOnce();

    await expect(
      stub.deliver({ kind: "email", address: "a@b.com" }, "https://app/t#tok4", "es"),
    ).rejects.toThrow(/simulated/i);

    // One-shot: the next call succeeds and is recorded normally.
    await stub.deliver({ kind: "email", address: "a@b.com" }, "https://app/t#tok5", "es");
    expect(stub.deliveries).toHaveLength(1);
  });
});
