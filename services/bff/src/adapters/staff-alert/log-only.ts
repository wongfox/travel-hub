import { randomUUID } from "node:crypto";
import type { StaffAlertPayload } from "contracts";
import type { StaffAlertPort } from "../../modules/pulse/ports.js";

export interface StaffAlertLogOnlyDeps {
  /** Injected so this adapter never depends on a concrete logger implementation; the redacting logger (task 3.5) is the real caller. */
  log: (entry: { payload: StaffAlertPayload; idempotencyKey: string }) => void;
}

/**
 * `StaffAlertPort`'s other design-named adapter (design Decision 12:
 * "Adapters: stub, log-only"): logs the already-minimal `StaffAlertPayload`
 * (no name/email/phone/document/free text, enforced by the payload's own
 * `.strict()` schema) instead of recording it in memory, for an environment
 * where a real receiving-team integration still does not exist but a
 * durable, auditable record of every dispatch attempt is wanted.
 */
export function createStaffAlertLogOnlyAdapter(deps: StaffAlertLogOnlyDeps): StaffAlertPort {
  return {
    async send(payload: StaffAlertPayload, idempotencyKey: string) {
      deps.log({ payload, idempotencyKey });
      return { deliveryRef: randomUUID() };
    },
  };
}
