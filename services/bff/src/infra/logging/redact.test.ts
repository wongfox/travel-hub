import { describe, expect, it } from "vitest";
import { redactLogPayload } from "./redact.js";

describe("redactLogPayload", () => {
  it("redacts every denylisted field pattern (tokens, cookies, images, emails, payment data, reservation refs) from a sample log payload", () => {
    const payload = {
      message: "session exchanged",
      linkToken: "abc123-should-not-appear",
      cookie: "__Host-th_sess=xyz",
      idFrontImage: "base64-blob-of-id-front",
      idBackImage: "base64-blob-of-id-back",
      contactEmail: "passenger@example.com",
      cardNumber: "4111111111111111",
      cvv: "123",
      reservationRef: "RES-98765",
      tripHash: "9f8e7d6c5b4a",
      requestId: "req-001",
    };

    const redacted = redactLogPayload(payload) as Record<string, unknown>;

    expect(redacted.linkToken).toBe("[REDACTED]");
    expect(redacted.cookie).toBe("[REDACTED]");
    expect(redacted.idFrontImage).toBe("[REDACTED]");
    expect(redacted.idBackImage).toBe("[REDACTED]");
    expect(redacted.contactEmail).toBe("[REDACTED]");
    expect(redacted.cardNumber).toBe("[REDACTED]");
    expect(redacted.cvv).toBe("[REDACTED]");
    expect(redacted.reservationRef).toBe("[REDACTED]");

    // Non-denylisted fields survive untouched — proves this is not blanket redaction.
    expect(redacted.tripHash).toBe("9f8e7d6c5b4a");
    expect(redacted.requestId).toBe("req-001");
    expect(redacted.message).toBe("session exchanged");
  });

  it("redacts nested objects and arrays, and catches an email-shaped value even under an unexpected key name", () => {
    const payload = {
      event: "webhook_received",
      details: {
        contact: "not-flagged-by-key-name@example.com",
        nested: { authorizationHeader: "Bearer secret-value" },
      },
      recipients: [{ email: "one@example.com" }, { email: "two@example.com" }],
    };

    const redacted = redactLogPayload(payload) as {
      details: { contact: string; nested: { authorizationHeader: string } };
      recipients: { email: string }[];
    };

    expect(redacted.details.contact).toBe("[REDACTED]");
    expect(redacted.details.nested.authorizationHeader).toBe("[REDACTED]");
    expect(redacted.recipients[0]?.email).toBe("[REDACTED]");
    expect(redacted.recipients[1]?.email).toBe("[REDACTED]");
  });

  it("does not stack-overflow on a circular reference (real Fastify request/response log objects can self-reference)", () => {
    const circular: Record<string, unknown> = { message: "incoming request" };
    circular.self = circular;

    expect(() => redactLogPayload(circular)).not.toThrow();
  });

  it("redacts a shared (non-circular) object referenced from two different keys, not just the first occurrence", () => {
    const shared = { token: "shared-secret-value" };
    const payload = { a: shared, b: shared };

    const redacted = redactLogPayload(payload) as { a: { token: string }; b: { token: string } };

    expect(redacted.a.token).toBe("[REDACTED]");
    expect(redacted.b.token).toBe("[REDACTED]");
  });

  it("leaves non-plain objects (class instances, Buffers) untouched instead of recursing into their internals", () => {
    class Socket {
      constructor(public remoteAddress: string) {}
    }
    const payload = {
      socket: new Socket("127.0.0.1"),
      buffer: Buffer.from("binary-data"),
    };

    const redacted = redactLogPayload(payload) as { socket: Socket; buffer: Buffer };

    expect(redacted.socket).toBe(payload.socket);
    expect(redacted.buffer).toBe(payload.buffer);
  });
});
