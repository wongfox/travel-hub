import type { TicketDTO } from "contracts";
import type { SirLeg, SirTicket } from "../booking/ports.js";

/**
 * `travel-documents`' ticket listing (task 6.4): one derived `TRAIN` ticket
 * per leg (the train segment's own boarding-pass data is its ticket's source
 * of truth — see `SirLeg`'s comment in `modules/booking/ports.ts`), plus
 * every purchased ancillary ticket (`SirTicket`) recorded on the
 * reservation, each associated with its owning itinerary milestone (spec
 * "Ticket-to-milestone association").
 */
export function buildDocuments(legs: SirLeg[], tickets: SirTicket[]): TicketDTO[] {
  const trainTickets: TicketDTO[] = legs.map((leg) => ({
    id: `ticket:train:${leg.legRef}`,
    kind: "TRAIN",
    title: `Train ${leg.origin} → ${leg.destination}`,
    milestoneId: leg.legRef,
    barcodePayload: leg.barcodePayload,
  }));

  const ancillaryTickets: TicketDTO[] = tickets.map((ticket) => ({
    id: ticket.ticketRef,
    kind: ticket.kind,
    title: ticket.title,
    milestoneId: ticket.milestoneLegRef,
    ...(ticket.barcodePayload !== undefined ? { barcodePayload: ticket.barcodePayload } : {}),
    ...(ticket.fileId !== undefined ? { fileId: ticket.fileId } : {}),
  }));

  return [...trainTickets, ...ancillaryTickets];
}
