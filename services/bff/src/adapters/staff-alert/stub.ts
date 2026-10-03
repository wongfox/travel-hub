import { randomUUID } from "node:crypto";
import type { StaffAlertPayload } from "contracts";
import type { StaffAlertPort } from "../../modules/pulse/ports.js";

export interface StaffAlertStub extends StaffAlertPort {
  /** Every payload this stub instance has "sent", in call order. Stands in for the undefined receiving human team/channel (design's own open item). */
  readonly deliveries: StaffAlertPayload[];
  /** Test/dev-only: makes the next `send` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic, in-memory `StaffAlertPort` stub (design Decision 6, design
 * Decision 12's "Adapters: stub, log-only"): no receiving team, channel or
 * protocol is defined yet (D4a's own open item), so this stub only records
 * that a dispatch was attempted. Idempotent per `idempotencyKey` (the
 * `StaffAlertPort.send` contract): a retried send for an already-delivered
 * key returns the same `deliveryRef`, never a second recorded delivery —
 * same convention as `createPrecheckinHandoffStub`.
 */
export function createStaffAlertStub(): StaffAlertStub {
  const deliveries: StaffAlertPayload[] = [];
  const deliveryRefsByIdempotencyKey = new Map<string, string>();
  let failNext = false;

  return {
    deliveries,

    simulateFailureOnce() {
      failNext = true;
    },

    async send(payload: StaffAlertPayload, idempotencyKey: string) {
      if (failNext) {
        failNext = false;
        throw new Error("simulated StaffAlertPort delivery failure");
      }
      const existingDeliveryRef = deliveryRefsByIdempotencyKey.get(idempotencyKey);
      if (existingDeliveryRef) {
        return { deliveryRef: existingDeliveryRef };
      }
      deliveries.push(payload);
      const deliveryRef = randomUUID();
      deliveryRefsByIdempotencyKey.set(idempotencyKey, deliveryRef);
      return { deliveryRef };
    },
  };
}
