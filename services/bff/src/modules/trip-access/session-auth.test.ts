import { describe, expect, it } from "vitest";
import { resolveActiveSession } from "./session-auth.js";
import { createInMemoryAccessLinkStore, type AccessLinkStore } from "./access-link-store.js";
import { createInMemorySessionStore, type SessionStore } from "./session-store.js";
import { generateAccessToken, hashAccessToken } from "./token.js";

interface SeedOptions {
  accessLinkStore: AccessLinkStore;
  sessionStore: SessionStore;
  linkExpiresAt?: string;
  sessionExpiresAt?: string;
  revokeLink?: boolean;
}

async function seedSession(options: SeedOptions): Promise<{ rawSessionId: string; linkId: string }> {
  const link = await options.accessLinkStore.create({
    tokenHash: hashAccessToken(generateAccessToken()),
    reservationRef: "RES-1001",
    passengerScope: [],
    expiresAt: options.linkExpiresAt ?? "2027-01-01T00:00:00.000Z",
    issueChannel: "email",
  });
  if (options.revokeLink) {
    await options.accessLinkStore.revoke(link.id, "some-newer-link");
  }
  const rawSessionId = generateAccessToken();
  await options.sessionStore.create(hashAccessToken(rawSessionId), {
    linkId: link.id,
    expiresAt: options.sessionExpiresAt ?? "2027-01-01T00:00:00.000Z",
    locale: "es",
  });
  return { rawSessionId, linkId: link.id };
}

describe("resolveActiveSession", () => {
  it("returns null when no cookie value is given", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();

    const result = await resolveActiveSession(undefined, { accessLinkStore, sessionStore });

    expect(result).toBeNull();
  });

  it("returns null for an unknown session id", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();

    const result = await resolveActiveSession("never-issued", { accessLinkStore, sessionStore });

    expect(result).toBeNull();
  });

  it("returns null when the session has expired", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const now = new Date("2026-06-01T00:00:00.000Z");
    const { rawSessionId } = await seedSession({
      accessLinkStore,
      sessionStore,
      sessionExpiresAt: "2026-05-01T00:00:00.000Z",
    });

    const result = await resolveActiveSession(rawSessionId, {
      accessLinkStore,
      sessionStore,
      now: () => now,
    });

    expect(result).toBeNull();
  });

  it("returns null when the underlying access link has since been revoked", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const { rawSessionId } = await seedSession({ accessLinkStore, sessionStore, revokeLink: true });

    const result = await resolveActiveSession(rawSessionId, { accessLinkStore, sessionStore });

    expect(result).toBeNull();
  });

  it("resolves a valid, unexpired session to its access link and locale", async () => {
    const accessLinkStore = createInMemoryAccessLinkStore();
    const sessionStore = createInMemorySessionStore();
    const { rawSessionId, linkId } = await seedSession({ accessLinkStore, sessionStore });

    const result = await resolveActiveSession(rawSessionId, { accessLinkStore, sessionStore });

    expect(result?.accessLink.id).toBe(linkId);
    expect(result?.accessLink.reservationRef).toBe("RES-1001");
    expect(result?.locale).toBe("es");
  });
});
