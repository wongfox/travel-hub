import type { AccessLinkRecord } from "../trip-access/access-link-store.js";
import { getTripOverview, type GetTripOverviewDeps } from "./get-trip-overview.js";
import { DocumentNotFoundError, type TicketDocumentPort } from "./ports.js";

export interface GetDocumentFileDeps extends GetTripOverviewDeps {
  ticketDocument: TicketDocumentPort;
}

export interface DocumentFile {
  contentType: string;
  body: NodeJS.ReadableStream;
}

/**
 * `GET /api/documents/:id` (`travel-documents`, task 6.4): fetches a ticket's
 * binary file only when `fileId` is present among the *same access link's*
 * scoped trip documents — reusing `getTripOverview`'s existing
 * passenger-scope filtering enforces the link/session scope for this route
 * too (`personal-data-protection` "Link scope enforced in every use case"),
 * and rejects an unrelated document id before ever calling the port.
 */
export async function getDocumentFile(
  accessLink: AccessLinkRecord,
  fileId: string,
  deps: GetDocumentFileDeps,
): Promise<DocumentFile> {
  const trip = await getTripOverview(accessLink, deps);
  const owned = trip.documents.some((document) => document.fileId === fileId);
  if (!owned) {
    throw new DocumentNotFoundError(fileId);
  }
  return deps.ticketDocument.fetch(fileId);
}
