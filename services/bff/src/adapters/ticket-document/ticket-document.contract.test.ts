import { describe, expect, it } from "vitest";
import { runConformanceSuite } from "../_conformance-harness/conformance-harness.js";
import { createTicketDocumentStub } from "./stub.js";
import { ticketDocumentContract } from "./ticket-document.contract.js";
import type { TicketDocumentPort } from "../../modules/trip/ports.js";

describe("TicketDocumentPort conformance", () => {
  it("passes the full conformance suite against the stub adapter", async () => {
    await expect(runConformanceSuite(createTicketDocumentStub, ticketDocumentContract)).resolves.toBeUndefined();
  });

  it("fails the conformance suite against an adapter that deviates from the documented contract", async () => {
    function createBrokenAdapter(): TicketDocumentPort {
      return {
        async fetch(docId: string) {
          // Broken: returns a non-empty body for every id, never throwing
          // DocumentNotFoundError even for an id no real adapter would have.
          return {
            contentType: "application/pdf",
            body: (async function* () {
              yield Buffer.from(`fake:${docId}`);
            })(),
          };
        },
      };
    }

    await expect(runConformanceSuite(createBrokenAdapter, ticketDocumentContract)).rejects.toThrow(
      /DocumentNotFoundError/,
    );
  });
});
