import { describe, expect, it } from "vitest";
import { createInMemoryAccessLinkStore } from "./access-link-store.js";
import { createInMemorySessionStore } from "./session-store.js";
import { generateAccessToken, hashAccessToken } from "./token.js";
import { exchangeAccessToken, SessionExchangeError } from "./exchange-token.js";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function issueRawLink(
  store: ReturnType<typeof createInMemoryAccessLinkStore>,
  overrides: { expiresAt: string; reservationRef?: string },
) {
  const token = generateAccessToken();
  const record = await store.create({
    tokenHash: hashAccessToken(token),
    reservationRef: overrides.reservationRef ?? "RES-1001",
    passengerScope: [],
    expiresAt: overrides.expiresAt,
    issueChannel: "email",
  });
  return { token, record };
}

describe("exchangeAccessToken", () => {
  it("creates a session capped by the link's own expiry when it is sooner than the sliding window", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const linkExpiresAt = "2026-01-02T00:00:00.000Z"; // sooner than now + 7 days
    const { token } = await issueRawLink(accessLinkStore, { expiresAt: linkExpiresAt });

    const result = await exchangeAccessToken(token, "en", {
      accessLinkStore,
      sessionStore,
      sessionSlidingMs: SEVEN_DAYS_MS,
      now: () => now,
    });

    expect(result.expiresAt).toBe(linkExpiresAt);
    expect(result.locale).toBe("en");
    expect(result.sessionId).toBeTruthy();

    const stored = await sessionStore.findByIdHash(hashAccessToken(result.sessionId));
    expect(stored?.linkId).toBe(result.linkId);
    expect(stored?.expiresAt).toBe(linkExpiresAt);
  });

  it("caps the session at the sliding window when the link's own expiry is later", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const { token } = await issueRawLink(accessLinkStore, { expiresAt: "2027-01-01T00:00:00.000Z" });

    const result = await exchangeAccessToken(token, "es", {
      accessLinkStore,
      sessionStore,
      sessionSlidingMs: SEVEN_DAYS_MS,
      now: () => now,
    });

    expect(result.expiresAt).toBe(new Date(now.getTime() + SEVEN_DAYS_MS).toISOString());
  });

  it("defaults locale to the source locale (es) when none is requested", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const { token } = await issueRawLink(accessLinkStore, { expiresAt: "2027-01-01T00:00:00.000Z" });

    const result = await exchangeAccessToken(token, undefined, {
      accessLinkStore,
      sessionStore,
      sessionSlidingMs: SEVEN_DAYS_MS,
    });

    expect(result.locale).toBe("es");
  });

  it("rejects an unknown/malformed token with link_expired (no enumeration signal)", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();

    await expect(
      exchangeAccessToken("this-token-was-never-issued", "es", {
        accessLinkStore,
        sessionStore,
        sessionSlidingMs: SEVEN_DAYS_MS,
      }),
    ).rejects.toMatchObject({ reason: "link_expired" });
  });

  it("rejects an expired token with link_expired and never creates a session", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const now = new Date("2026-06-01T00:00:00.000Z");
    const { token } = await issueRawLink(accessLinkStore, { expiresAt: "2026-05-01T00:00:00.000Z" });

    const error: unknown = await exchangeAccessToken(token, "es", {
      accessLinkStore,
      sessionStore,
      sessionSlidingMs: SEVEN_DAYS_MS,
      now: () => now,
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SessionExchangeError);
    expect((error as SessionExchangeError).reason).toBe("link_expired");
  });

  it("rejects a revoked token with link_revoked, distinct from link_expired", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const { token, record } = await issueRawLink(accessLinkStore, { expiresAt: "2027-01-01T00:00:00.000Z" });
    await accessLinkStore.revoke(record.id, "some-newer-link-id");

    await expect(
      exchangeAccessToken(token, "es", { accessLinkStore, sessionStore, sessionSlidingMs: SEVEN_DAYS_MS }),
    ).rejects.toMatchObject({ reason: "link_revoked" });
  });

  it("never persists the raw token anywhere in the created session record", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const { token } = await issueRawLink(accessLinkStore, { expiresAt: "2027-01-01T00:00:00.000Z" });

    const result = await exchangeAccessToken(token, "es", {
      accessLinkStore,
      sessionStore,
      sessionSlidingMs: SEVEN_DAYS_MS,
    });

    const stored = await sessionStore.findByIdHash(hashAccessToken(result.sessionId));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(JSON.stringify(stored)).not.toContain(result.sessionId);
  });
});
