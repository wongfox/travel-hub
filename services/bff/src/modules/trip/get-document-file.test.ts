import { describe, expect, it } from "vitest";
import { Readable } from "node:stream";
import { getDocumentFile } from "./get-document-file.js";
import { DocumentNotFoundError, type TicketDocumentPort } from "./ports.js";
import type { AccessLinkRecord } from "../trip-access/access-link-store.js";
import type { SirBookingPort, SirReservation } from "../booking/ports.js";

function accessLink(overrides: Partial<AccessLinkRecord> = {}): AccessLinkRecord {
  return {
    id: "link-1",
    tokenHash: "hash",
    reservationRef: "RES-1001",
    passengerScope: [],
    issuedAt: "2026-10-01T00:00:00.000Z",
    expiresAt: "2027-01-01T00:00:00.000Z",
    revokedAt: null,
    supersededBy: null,
    issueChannel: "email",
    ...overrides,
  };
}

const reservation: SirReservation = {
  reservationRef: "RES-1001",
  contact: { kind: "email", address: "ana@example.com" },
  passengers: [{ passengerRef: "P1", ordinal: 1, displayName: "Ana Torres" }],
  legs: [
    {
      legRef: "L1",
      origin: "Ollantaytambo",
      destination: "Machu Picchu Pueblo",
      departureLocal: "2026-11-02T08:10:00-05:00",
      arrivalLocal: "2026-11-02T09:40:00-05:00",
      tier: "PRIME",
      status: "SCHEDULED",
      seat: "5A",
      coach: "3",
      barcodeFormat: "CODE128",
      barcodePayload: "BP-L1",
    },
  ],
  tickets: [
    { ticketRef: "TCK-CONSETTUR", kind: "CONSETTUR", title: "Consettur bus", milestoneLegRef: "L1", fileId: "DOC-1" },
  ],
};

function fakeSirBooking(): Pick<SirBookingPort, "getReservation" | "getRelocations"> {
  return {
    async getReservation() {
      return reservation;
    },
    async getRelocations() {
      return [];
    },
  };
}

function fakeTicketDocument(): TicketDocumentPort {
  return {
    async fetch(docId: string) {
      return { contentType: "application/pdf", body: Readable.from(Buffer.from(`content:${docId}`)) };
    },
  };
}

describe("getDocumentFile", () => {
  it("fetches the file for a fileId present among the passenger's own trip documents", async () => {
    const result = await getDocumentFile(accessLink(), "DOC-1", {
      sirBooking: fakeSirBooking(),
      ticketDocument: fakeTicketDocument(),
    });

    expect(result.contentType).toBe("application/pdf");
  });

  it("throws DocumentNotFoundError for a fileId that does not belong to this trip's documents, without calling the port", async () => {
    let called = false;
    const ticketDocument: TicketDocumentPort = {
      async fetch(docId: string) {
        called = true;
        return { contentType: "application/pdf", body: Readable.from(Buffer.from(docId)) };
      },
    };

    await expect(
      getDocumentFile(accessLink(), "DOC-BELONGS-TO-ANOTHER-TRIP", {
        sirBooking: fakeSirBooking(),
        ticketDocument,
      }),
    ).rejects.toBeInstanceOf(DocumentNotFoundError);
    expect(called).toBe(false);
  });
});
