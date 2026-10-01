import { randomUUID } from "node:crypto";
import type { PosSale, SirPosPort } from "../../modules/booking/ports.js";

interface SaleRecord {
  saleRef: string;
}

export interface SirPosStub extends SirPosPort {
  /** Every `registerSale` call this stub instance has accepted, in call order. */
  readonly registerCalls: { idempotencyKey: string }[];
  /** Every `voidSale` call this stub instance has accepted, in call order. */
  readonly voidCalls: { saleRef: string; reason: string }[];
  /** Test/dev-only: makes the next `registerSale` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `SirPosPort` stub (design Decision 6):
 * `registerSale` is idempotent per `idempotencyKey` — a retried SIR
 * registration for the same key returns the same `saleRef` instead of
 * writing a second POS-equivalent sale record, the same convention as
 * `PaymentGatewayPort.createHostedSession`/`refund`.
 */
export function createSirPosStub(): SirPosStub {
  const saleByIdempotencyKey = new Map<string, SaleRecord>();
  const registerCalls: { idempotencyKey: string }[] = [];
  const voidCalls: { saleRef: string; reason: string }[] = [];
  let failNext = false;

  function consumeFailureInjection(): void {
    if (failNext) {
      failNext = false;
      throw new Error("simulated SirPosPort failure");
    }
  }

  return {
    registerCalls,
    voidCalls,

    simulateFailureOnce() {
      failNext = true;
    },

    async registerSale(_sale: PosSale, idempotencyKey: string) {
      consumeFailureInjection();
      registerCalls.push({ idempotencyKey });

      const existing = saleByIdempotencyKey.get(idempotencyKey);
      if (existing) return existing;

      const record: SaleRecord = { saleRef: randomUUID() };
      saleByIdempotencyKey.set(idempotencyKey, record);
      return record;
    },

    async voidSale(saleRef: string, reason: string) {
      voidCalls.push({ saleRef, reason });
    },
  };
}
