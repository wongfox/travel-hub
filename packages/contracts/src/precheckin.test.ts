import { describe, expect, it } from "vitest";
import {
  DocumentTypeSchema,
  PrecheckinStatusSchema,
  PrecheckinStatusResponseSchema,
  PrecheckinSubmissionMetadataSchema,
} from "./precheckin.js";

describe("PrecheckinStatusSchema", () => {
  it("accepts the three completion states surfaced on TripDTO.passengers", () => {
    for (const status of ["none", "received", "unavailable"] as const) {
      expect(PrecheckinStatusSchema.parse(status)).toBe(status);
    }
  });

  it("rejects a status that would leak submission detail beyond completion state", () => {
    expect(() => PrecheckinStatusSchema.parse("photo_pending_review")).toThrow();
  });
});

describe("PrecheckinStatusResponseSchema", () => {
  it("round-trips a per-passenger status list without ever carrying image data", () => {
    const response = [
      { passengerOrdinal: 1, status: "received" },
      { passengerOrdinal: 2, status: "none" },
    ];

    expect(PrecheckinStatusResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects an entry that tries to smuggle image bytes into the status response", () => {
    expect(() =>
      PrecheckinStatusResponseSchema.parse([
        { passengerOrdinal: 1, status: "received", photoBase64: "..." },
      ]),
    ).toThrow();
  });
});

describe("PrecheckinSubmissionMetadataSchema", () => {
  it("accepts the non-file metadata fields sent alongside a multipart submission", () => {
    const metadata = { docType: "DNI", consentRecordId: "consent_01" };
    expect(PrecheckinSubmissionMetadataSchema.parse(metadata)).toEqual(metadata);
  });

  it("rejects a submission missing its consent record reference", () => {
    expect(() =>
      PrecheckinSubmissionMetadataSchema.parse({ docType: "PASSPORT" }),
    ).toThrow();
  });
});

describe("DocumentTypeSchema", () => {
  it("accepts DNI, PASSPORT and OTHER as the currently supported document types", () => {
    for (const docType of ["DNI", "PASSPORT", "OTHER"] as const) {
      expect(DocumentTypeSchema.parse(docType)).toBe(docType);
    }
  });
});
