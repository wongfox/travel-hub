import { Readable } from "node:stream";
import { DocumentNotFoundError, type TicketDocumentPort } from "../../modules/trip/ports.js";

export interface TicketDocumentStub extends TicketDocumentPort {
  /** Test/dev-only: makes the next `fetch` call reject once, then succeed normally. */
  simulateFailureOnce(): void;
}

/**
 * Deterministic content for the document ids recorded on the seed fixtures
 * (`services/bff/seed/sir/reservations.json`'s `tickets[].fileId`), keyed by
 * that same id. A real adapter would fetch this from wherever third-party
 * ticket files actually live (design's Open Questions: source undocumented).
 */
const SEEDED_DOCUMENT_CONTENT: Record<string, { contentType: string; text: string }> = {
  "DOC-1001-CONSETTUR": { contentType: "application/pdf", text: "stub-ticket-document:DOC-1001-CONSETTUR" },
  "DOC-2002-MEAL": { contentType: "application/pdf", text: "stub-ticket-document:DOC-2002-MEAL" },
};

/**
 * Deterministic, in-memory `TicketDocumentPort` stub (design Decision 6):
 * every external dependency gets a stub adapter first. Backed by a small
 * fixed set of known document ids rather than a real file store — an
 * unrecognized id throws `DocumentNotFoundError` exactly as a real adapter
 * would for a document it cannot find.
 */
export function createTicketDocumentStub(): TicketDocumentStub {
  let failNext = false;

  return {
    simulateFailureOnce() {
      failNext = true;
    },

    async fetch(docId: string) {
      if (failNext) {
        failNext = false;
        throw new Error("simulated TicketDocumentPort fetch failure");
      }
      const entry = SEEDED_DOCUMENT_CONTENT[docId];
      if (!entry) {
        throw new DocumentNotFoundError(docId);
      }
      return { contentType: entry.contentType, body: Readable.from(Buffer.from(entry.text)) };
    },
  };
}
