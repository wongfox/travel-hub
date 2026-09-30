import { describe, expect, it } from "vitest";
import { buildDocuments } from "./build-documents.js";
import type { SirLeg, SirTicket } from "../booking/ports.js";

function leg(overrides: Partial<SirLeg> = {}): SirLeg {
  return {
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
    ...overrides,
  };
}

function ticket(overrides: Partial<SirTicket> = {}): SirTicket {
  return {
    ticketRef: "TCK-1",
    kind: "CONSETTUR",
    title: "Consettur bus",
    milestoneLegRef: "L1",
    ...overrides,
  };
}

describe("buildDocuments", () => {
  it("includes one TRAIN ticket per leg, associated with that leg as its milestone", () => {
    const documents = buildDocuments([leg()], []);

    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({ kind: "TRAIN", milestoneId: "L1", barcodePayload: "BP-L1" });
  });

  it("includes every purchased ancillary ticket alongside the derived train ticket, associated with its milestone", () => {
    const tickets = [
      ticket({ ticketRef: "TCK-CONSETTUR", kind: "CONSETTUR", title: "Consettur bus", fileId: "DOC-1" }),
      ticket({ ticketRef: "TCK-INC", kind: "INC_ENTRY", title: "INC entry", barcodePayload: "INC-1" }),
      ticket({ ticketRef: "TCK-MEAL", kind: "MEAL_TEATIME", title: "Tea time" }),
    ];

    const documents = buildDocuments([leg()], tickets);

    expect(documents).toHaveLength(4); // 1 derived train ticket + 3 ancillary tickets
    const kinds = documents.map((doc) => doc.kind).sort();
    expect(kinds).toEqual(["CONSETTUR", "INC_ENTRY", "MEAL_TEATIME", "TRAIN"]);
  });

  it("carries a ticket's fileId through for a binary document, when present", () => {
    const documents = buildDocuments([], [ticket({ fileId: "DOC-1" })]);

    expect(documents[0]).toMatchObject({ fileId: "DOC-1" });
    expect("barcodePayload" in documents[0]!).toBe(false);
  });

  it("carries a ticket's barcodePayload through, when present, without a fileId", () => {
    const documents = buildDocuments([], [ticket({ barcodePayload: "INC-1" })]);

    expect(documents[0]).toMatchObject({ barcodePayload: "INC-1" });
    expect("fileId" in documents[0]!).toBe(false);
  });

  it("preserves a null milestoneLegRef as a null milestoneId, for a ticket with no itinerary association", () => {
    const documents = buildDocuments([], [ticket({ milestoneLegRef: null })]);

    expect(documents[0]?.milestoneId).toBeNull();
  });

  it("returns only derived train tickets when the reservation has no ancillary tickets", () => {
    expect(buildDocuments([], [])).toEqual([]);
  });
});
