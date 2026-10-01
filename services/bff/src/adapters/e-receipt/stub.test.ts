import { describe, expect, it } from "vitest";
import { createEReceiptStub } from "./stub.js";

const ISSUE_INPUT = {
  orderId: "order-1",
  buyerEmail: "passenger@example.com",
  lines: [{ description: "WiFi 60 minutes", amountMinor: 1500 }],
  currency: "PEN" as const,
  idempotencyKey: "idem-1",
};

describe("createEReceiptStub", () => {
  it("issue returns a non-empty receiptRef", async () => {
    const stub = createEReceiptStub();

    const result = await stub.issue(ISSUE_INPUT);

    expect(result.receiptRef.length).toBeGreaterThan(0);
  });

  it("issue is idempotent per idempotencyKey: a repeated call returns the same receiptRef, not a second receipt", async () => {
    const stub = createEReceiptStub();

    const first = await stub.issue(ISSUE_INPUT);
    const second = await stub.issue(ISSUE_INPUT);

    expect(second.receiptRef).toBe(first.receiptRef);
    expect(stub.issueCalls).toHaveLength(2);
  });

  it("simulateFailureOnce makes the next issue call reject once, then succeed", async () => {
    const stub = createEReceiptStub();
    stub.simulateFailureOnce();

    await expect(stub.issue(ISSUE_INPUT)).rejects.toThrow(/simulated EReceiptPort failure/);
    const result = await stub.issue(ISSUE_INPUT);
    expect(result.receiptRef.length).toBeGreaterThan(0);
  });
});
