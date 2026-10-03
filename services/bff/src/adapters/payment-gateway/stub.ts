import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { PaymentEventSchema, type Currency, type PaymentEvent, type PaymentEventType } from "contracts";
import { InvalidWebhookSignatureError } from "../../modules/wifi-checkout/errors.js";
import type { PaymentGatewayPort } from "../../modules/wifi-checkout/ports.js";

/** Dev-only stub signing secret; a real adapter verifies against the vendor's own documented webhook secret instead. */
const STUB_WEBHOOK_SECRET = "dev-only-stub-payment-webhook-secret";
export const STUB_WEBHOOK_SIGNATURE_HEADER = "x-stub-signature";

function sign(rawBody: Buffer): string {
  return createHmac("sha256", STUB_WEBHOOK_SECRET).update(rawBody).digest("hex");
}

function isValidSignature(rawBody: Buffer, providedHex: string | undefined): boolean {
  if (!providedHex) return false;
  let provided: Buffer;
  try {
    provided = Buffer.from(providedHex, "hex");
  } catch {
    return false;
  }
  const expected = Buffer.from(sign(rawBody), "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

interface HostedSessionRecord {
  sessionRef: string;
  redirectUrl: string;
}

export interface BuildWebhookRequestInput {
  type: PaymentEventType;
  providerRef: string;
  orderIdempotencyKey: string | null;
  amountMinor: number;
  currency: Currency;
  occurredAt?: string;
  /** Test-only: flips one hex character of a correctly computed signature, producing a payload `parseWebhook` MUST reject. */
  tamperSignature?: boolean;
  /** Test-only: omits the signature header entirely. */
  omitSignature?: boolean;
}

export interface PaymentGatewayStub extends PaymentGatewayPort {
  /** Every `createHostedSession` call this stub instance has accepted, in call order. */
  readonly createdSessions: { orderId: string; idempotencyKey: string }[];
  /** Every `refund` call this stub instance has accepted, in call order. */
  readonly refundCalls: { paymentRef: string; amountMinor: number; idempotencyKey: string }[];
  /** Test/dev-only: makes the next `createHostedSession`/`refund` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
  /**
   * Test helper: builds the raw body + headers a real gateway would POST to
   * `/webhooks/payments/:provider` for a given event, correctly signed so
   * `parseWebhook` accepts it (unless `tamperSignature`/`omitSignature` is set).
   */
  buildWebhookRequest(input: BuildWebhookRequestInput): { rawBody: Buffer; headers: Record<string, string> };
}

/**
 * Deterministic, in-memory `PaymentGatewayPort` stub (design Decision 6).
 * `createHostedSession` and `refund` are both idempotent per their
 * `idempotencyKey` (each returns the same result on replay, matching how a
 * real gateway's own idempotency key works — a retried refund after an
 * ambiguous/lost response must never issue a second refund). `parseWebhook`
 * verifies an HMAC-SHA256 signature
 * over the exact raw bytes and throws `InvalidWebhookSignatureError`
 * otherwise — the same "verifies signature or throws" contract
 * design-interfaces documents for the real port.
 */
interface RefundRecord {
  refundRef: string;
}

export function createPaymentGatewayStub(): PaymentGatewayStub {
  const sessionsByIdempotencyKey = new Map<string, HostedSessionRecord>();
  const refundsByIdempotencyKey = new Map<string, RefundRecord>();
  const createdSessions: { orderId: string; idempotencyKey: string }[] = [];
  const refundCalls: { paymentRef: string; amountMinor: number; idempotencyKey: string }[] = [];
  let failNext = false;

  function consumeFailureInjection(): void {
    if (failNext) {
      failNext = false;
      throw new Error("simulated PaymentGatewayPort failure");
    }
  }

  return {
    createdSessions,
    refundCalls,

    simulateFailureOnce() {
      failNext = true;
    },

    async createHostedSession(input) {
      consumeFailureInjection();
      createdSessions.push({ orderId: input.orderId, idempotencyKey: input.idempotencyKey });

      const existing = sessionsByIdempotencyKey.get(input.idempotencyKey);
      if (existing) return existing;

      const sessionRef = randomUUID();
      const record: HostedSessionRecord = {
        sessionRef,
        redirectUrl: `https://stub-gateway.local/pay/${sessionRef}`,
      };
      sessionsByIdempotencyKey.set(input.idempotencyKey, record);
      return record;
    },

    async parseWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<PaymentEvent> {
      const signature = headers[STUB_WEBHOOK_SIGNATURE_HEADER];
      if (!isValidSignature(rawBody, signature)) {
        throw new InvalidWebhookSignatureError();
      }
      const parsed: unknown = JSON.parse(rawBody.toString("utf8"));
      return PaymentEventSchema.parse(parsed);
    },

    async refund(paymentRef: string, amountMinor: number, idempotencyKey: string) {
      consumeFailureInjection();
      refundCalls.push({ paymentRef, amountMinor, idempotencyKey });

      const existing = refundsByIdempotencyKey.get(idempotencyKey);
      if (existing) return existing;

      const record: RefundRecord = { refundRef: randomUUID() };
      refundsByIdempotencyKey.set(idempotencyKey, record);
      return record;
    },

    buildWebhookRequest({
      type,
      providerRef,
      orderIdempotencyKey,
      amountMinor,
      currency,
      occurredAt,
      tamperSignature,
      omitSignature,
    }) {
      const event: PaymentEvent = {
        type,
        providerRef,
        orderIdempotencyKey,
        amountMinor,
        currency,
        occurredAt: occurredAt ?? new Date().toISOString(),
      };
      const rawBody = Buffer.from(JSON.stringify(event), "utf8");
      const headers: Record<string, string> = {};
      if (!omitSignature) {
        const signatureHex = sign(rawBody);
        headers[STUB_WEBHOOK_SIGNATURE_HEADER] = tamperSignature
          ? signatureHex.slice(0, -1) + (signatureHex.endsWith("0") ? "1" : "0")
          : signatureHex;
      }
      return { rawBody, headers };
    },
  };
}
