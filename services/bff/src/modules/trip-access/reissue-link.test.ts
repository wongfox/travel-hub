import { describe, expect, it } from "vitest";
import { createInMemoryAccessLinkStore } from "./access-link-store.js";
import { createLinkDeliveryStub } from "../../adapters/link-delivery/stub.js";
import { issueAccessLink } from "./issue-link.js";
import { reissueAccessLink } from "./reissue-link.js";
import type { ContactChannel } from "./ports.js";
import type { SirBookingPort } from "../booking/ports.js";

const CONTACT: ContactChannel = { kind: "email", address: "ana@example.com" };

function buildSirBookingStub(matches: boolean): Pick<SirBookingPort, "getContactForLinkDelivery"> {
  return {
    async getContactForLinkDelivery(): Promise<ContactChannel | null> {
      return matches ? CONTACT : null;
    },
  };
}

const DEFAULT_LINK_EXPIRY_MS = 72 * 60 * 60 * 1000;

function buildDeps(sirBooking: Pick<SirBookingPort, "getContactForLinkDelivery">) {
  const store = createInMemoryAccessLinkStore();
  const linkDelivery = createLinkDeliveryStub();
  return {
    store,
    linkDelivery,
    sirBooking,
    linkExpiryMs: DEFAULT_LINK_EXPIRY_MS,
    buildLinkUrl: (token: string) => `https://app.travel-hub.local/t#${token}`,
  };
}

describe("reissueAccessLink", () => {
  it("issues and delivers a new link when the verifier matches", async () => {
    const deps = buildDeps(buildSirBookingStub(true));

    await reissueAccessLink({ reservationRef: "RES-1001", surname: "gomez", locale: "es" }, deps);

    expect(deps.linkDelivery.deliveries).toHaveLength(1);
    expect(deps.linkDelivery.deliveries[0]?.to).toEqual(CONTACT);
  });

  it("does nothing observable when the verifier does not match (no enumeration signal)", async () => {
    const deps = buildDeps(buildSirBookingStub(false));

    await expect(
      reissueAccessLink({ reservationRef: "RES-1001", surname: "wrong-surname", locale: "es" }, deps),
    ).resolves.toBeUndefined();
    expect(deps.linkDelivery.deliveries).toHaveLength(0);
  });

  it("invalidates every previously active link for the same reservation", async () => {
    const deps = buildDeps(buildSirBookingStub(true));
    const previous = await issueAccessLink(
      { reservationRef: "RES-1001", contact: CONTACT, locale: "es" },
      deps,
    );

    await reissueAccessLink({ reservationRef: "RES-1001", surname: "gomez", locale: "es" }, deps);

    const stillActive = await deps.store.findActiveByReservation("RES-1001");
    // Only the brand-new link from reissue should remain active; the
    // pre-existing one must now be revoked (superseded_by the new one).
    expect(stillActive).toHaveLength(1);
    expect(stillActive[0]?.id).not.toBe(previous.accessLinkId);
  });

  it("leaves other reservations' active links untouched", async () => {
    const deps = buildDeps(buildSirBookingStub(true));
    await issueAccessLink({ reservationRef: "RES-2002", contact: CONTACT, locale: "es" }, deps);

    await reissueAccessLink({ reservationRef: "RES-1001", surname: "gomez", locale: "es" }, deps);

    const otherReservationActive = await deps.store.findActiveByReservation("RES-2002");
    expect(otherReservationActive).toHaveLength(1);
  });

  it("does not revoke anything when the verifier does not match", async () => {
    const deps = buildDeps(buildSirBookingStub(true));
    await issueAccessLink({ reservationRef: "RES-1001", contact: CONTACT, locale: "es" }, deps);
    const noMatchDeps = { ...deps, sirBooking: buildSirBookingStub(false) };

    await reissueAccessLink({ reservationRef: "RES-1001", surname: "wrong", locale: "es" }, noMatchDeps);

    expect(await deps.store.findActiveByReservation("RES-1001")).toHaveLength(1);
  });
});
