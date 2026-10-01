import type { AccessLinkStore } from "../../modules/trip-access/access-link-store.js";
import type { SirBookingPort } from "../../modules/booking/ports.js";
import type { JourneyEvent, JourneyEventSourcePort } from "../../modules/notifications/ports.js";

export interface SirPollingJourneyEventDeps {
  accessLinkStore: Pick<AccessLinkStore, "listActive">;
  sirBooking: Pick<SirBookingPort, "getReservation" | "getRelocations">;
}

/**
 * `JourneyEventSourcePort`'s default polling adapter (task 11.2, design
 * Decision 11: "default polling adapter (worker polls SIR for trips
 * departing in the next N hours)"). Deliberately reuses the existing
 * `SirBookingPort`/`AccessLinkStore` — no parallel booking stub — scanning
 * only reservations that still have a live access link (no point polling a
 * reservation nobody can see alerts for), and only relocation events
 * (`SirBookingPort.getRelocations`) on legs departing within the window,
 * since relocation is the only journey-event data the SIR booking port
 * currently exposes (delay/incident feeds are a future adapter concern).
 * `sourceEventId` is `${legRef}:${recordedAt}`, stable across repeated
 * polls of the same underlying relocation, so `dispatchJourneyEvents`'s
 * dedupe key stays stable too.
 */
export function createSirPollingJourneyEventAdapter(deps: SirPollingJourneyEventDeps): JourneyEventSourcePort {
  return {
    async pollActive(window: { from: Date; to: Date }): Promise<JourneyEvent[]> {
      const activeLinks = await deps.accessLinkStore.listActive();
      const reservationRefs = [...new Set(activeLinks.map((link) => link.reservationRef))];

      const events: JourneyEvent[] = [];
      for (const reservationRef of reservationRefs) {
        const [reservation, relocations] = await Promise.all([
          deps.sirBooking.getReservation({ reservationRef }),
          deps.sirBooking.getRelocations({ reservationRef }),
        ]);

        for (const relocation of relocations) {
          const leg = reservation.legs.find((candidate) => candidate.legRef === relocation.legRef);
          if (!leg) continue;

          const departureMs = new Date(leg.departureLocal).getTime();
          if (departureMs < window.from.getTime() || departureMs > window.to.getTime()) continue;

          events.push({
            reservationRef,
            legRef: relocation.legRef,
            type: "RELOCATION",
            sourceEventId: `${relocation.legRef}:${relocation.recordedAt}`,
            occurredAt: relocation.recordedAt,
          });
        }
      }

      return events;
    },
  };
}
