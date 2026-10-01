import { randomUUID } from "node:crypto";
import type { EReceiptPort } from "../../modules/wifi-checkout/ports.js";

interface ReceiptRecord {
  receiptRef: string;
}

export interface EReceiptStub extends EReceiptPort {
  /** Every `issue` call this stub instance has accepted, in call order. */
  readonly issueCalls: { idempotencyKey: string }[];
  /** Test/dev-only: makes the next `issue` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `EReceiptPort` stub (design Decision 6): `issue`
 * is idempotent per `idempotencyKey` — a retried e-receipt issuance for the
 * same key returns the same `receiptRef` instead of emailing a second
 * boleta electrónica, the same convention as `PaymentGatewayPort.refund`.
 */
export function createEReceiptStub(): EReceiptStub {
  const receiptByIdempotencyKey = new Map<string, ReceiptRecord>();
  const issueCalls: { idempotencyKey: string }[] = [];
  let failNext = false;

  function consumeFailureInjection(): void {
    if (failNext) {
      failNext = false;
      throw new Error("simulated EReceiptPort failure");
    }
  }

  return {
    issueCalls,

    simulateFailureOnce() {
      failNext = true;
    },

    async issue(input) {
      consumeFailureInjection();
      issueCalls.push({ idempotencyKey: input.idempotencyKey });

      const existing = receiptByIdempotencyKey.get(input.idempotencyKey);
      if (existing) return existing;

      const record: ReceiptRecord = { receiptRef: randomUUID() };
      receiptByIdempotencyKey.set(input.idempotencyKey, record);
      return record;
    },
  };
}
