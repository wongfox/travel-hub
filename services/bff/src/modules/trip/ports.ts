/**
 * `TicketDocumentPort` per `sdd/travel-hub-mvp/design-interfaces`
 * (`services/bff/src/modules/trip/ports.ts`): fetches a third-party ticket's
 * binary file (Consettur, INC entry, meal/tea-time) for `GET
 * /api/documents/:id` (`travel-documents`, task 6.4), when the ticket is not
 * self-contained as a client-rendered barcode. Train tickets never go
 * through this port — their barcode is already carried in the `TripDTO`
 * itself (see `build-documents.ts`). Modeled as a Node.js readable stream
 * (`NodeJS.ReadableStream`) rather than the web `ReadableStream` type, since
 * this port is only ever consumed by the Fastify/Node BFF (`reply.send`
 * accepts a Node stream directly).
 */
export interface TicketDocumentPort {
  fetch(docId: string): Promise<{ contentType: string; body: NodeJS.ReadableStream }>;
}

/** Thrown by `TicketDocumentPort.fetch` and surfaced as `GET /api/documents/:id`'s 404. */
export class DocumentNotFoundError extends Error {
  constructor(docId: string) {
    super(`No document found for id "${docId}"`);
    this.name = "DocumentNotFoundError";
  }
}
