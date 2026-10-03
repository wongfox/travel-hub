import { describe, expect, it } from "vitest";
import { issueAccessLink } from "./issue-link.js";
import { resolveAccessLinkByToken } from "./resolve-link.js";
import { createInMemoryAccessLinkStore } from "./access-link-store.js";
import { createLinkDeliveryStub } from "../../adapters/link-delivery/stub.js";
import { createSirBookingStub } from "../../adapters/sir-booking/stub.js";

const ONE_HOUR_MS = 60 * 60 * 1000;

function buildDeps() {
  const store = createInMemoryAccessLinkStore();
  const linkDelivery = createLinkDeliveryStub();
  return {
    store,
    linkDelivery,
    linkExpiryMs: 72 * ONE_HOUR_MS,
    buildLinkUrl: (token: string) => `https://app.travel-hub.local/t#${token}`,
  };
}

describe("issueAccessLink", () => {
  it("issues a link bound to exactly one reservation, storing only the token's hash, never the raw token", async () => {
    const deps = buildDeps();

    const result = await issueAccessLink(
      { reservationRef: "RES-1001", contact: { kind: "email", address: "ana@example.com" }, locale: "es" },
      deps,
    );

    expect(result.accessLinkId).toBeTruthy();
    const [delivery] = deps.linkDelivery.deliveries;
    expect(delivery?.linkUrl).toContain("#");
    const deliveredToken = delivery!.linkUrl.split("#")[1]!;
    const record = await resolveAccessLinkByToken(deliveredToken, deps.store);
    expect(record?.reservationRef).toBe("RES-1001");
    // The persisted record's tokenHash must never equal the raw token itself.
    expect(record?.tokenHash).not.toBe(deliveredToken);
  });

  it("delivers the issued link via LinkDeliveryPort to the given contact, in the given locale", async () => {
    const deps = buildDeps();

    await issueAccessLink(
      { reservationRef: "RES-1001", contact: { kind: "email", address: "ana@example.com" }, locale: "es" },
      deps,
    );

    expect(deps.linkDelivery.deliveries).toHaveLength(1);
    expect(deps.linkDelivery.deliveries[0]?.to).toEqual({ kind: "email", address: "ana@example.com" });
    expect(deps.linkDelivery.deliveries[0]?.locale).toBe("es");
  });

  it("defaults passengerScope to an empty array (\"all passengers\") when not provided", async () => {
    const deps = buildDeps();

    const result = await issueAccessLink(
      { reservationRef: "RES-1001", contact: { kind: "email", address: "ana@example.com" }, locale: "es" },
      deps,
    );

    const [delivery] = deps.linkDelivery.deliveries;
    const token = delivery!.linkUrl.split("#")[1]!;
    const record = await resolveAccessLinkByToken(token, deps.store);
    expect(record?.passengerScope).toEqual([]);
    expect(record?.id).toBe(result.accessLinkId);
  });

  it("binds an explicit passengerScope so the issued link resolves only to the bound passengers", async () => {
    const deps = buildDeps();

    await issueAccessLink(
      {
        reservationRef: "RES-1001",
        passengerScope: ["P1"],
        contact: { kind: "email", address: "ana@example.com" },
        locale: "es",
      },
      deps,
    );

    const [delivery] = deps.linkDelivery.deliveries;
    const token = delivery!.linkUrl.split("#")[1]!;
    const record = await resolveAccessLinkByToken(token, deps.store);
    expect(record?.passengerScope).toEqual(["P1"]);
  });

  it("resolves only to its own bound reservation, never to a second reservation issued afterward (no cross-resolution)", async () => {
    const deps = buildDeps();
    const booking = createSirBookingStub();

    await issueAccessLink(
      { reservationRef: "RES-1001", contact: { kind: "email", address: "ana@example.com" }, locale: "es" },
      deps,
    );
    await issueAccessLink(
      { reservationRef: "RES-2002", contact: { kind: "whatsapp", address: "+51999888777" }, locale: "es" },
      deps,
    );

    const [firstDelivery, secondDelivery] = deps.linkDelivery.deliveries;
    const firstToken = firstDelivery!.linkUrl.split("#")[1]!;
    const secondToken = secondDelivery!.linkUrl.split("#")[1]!;

    const firstRecord = await resolveAccessLinkByToken(firstToken, deps.store);
    const secondRecord = await resolveAccessLinkByToken(secondToken, deps.store);

    expect(firstRecord?.reservationRef).toBe("RES-1001");
    expect(secondRecord?.reservationRef).toBe("RES-2002");

    // The defining acceptance test: resolving through each issued token and
    // fetching that reservation's booking data never crosses over — each
    // token's resolved reservationRef fetches only its own passengers.
    const firstBooking = await booking.getReservation({ reservationRef: firstRecord!.reservationRef });
    const secondBooking = await booking.getReservation({ reservationRef: secondRecord!.reservationRef });
    expect(firstBooking.passengers).not.toEqual(secondBooking.passengers);
    expect(firstToken).not.toBe(secondToken);
  });

  it("sets expiresAt to now + the configured link expiry", async () => {
    const deps = buildDeps();
    const fixedNow = new Date("2026-10-01T00:00:00.000Z");

    const result = await issueAccessLink(
      { reservationRef: "RES-1001", contact: { kind: "email", address: "ana@example.com" }, locale: "es" },
      { ...deps, now: () => fixedNow },
    );

    expect(result.expiresAt).toBe(new Date(fixedNow.getTime() + deps.linkExpiryMs).toISOString());
  });
});
