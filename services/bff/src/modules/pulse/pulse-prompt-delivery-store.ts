import { DuplicatePulsePromptDeliveryError, type PulsePromptDeliveryStore } from "./ports.js";

/**
 * Deterministic, in-memory `PulsePromptDeliveryStore` (task 11.6): keyed by
 * `reservationRef:legRef`, so a repeated client call to `POST
 * /api/pulse/prompt` for the same trigger moment never re-sends push. Kept
 * deliberately separate from `NotificationStore` — pulse prompts are their
 * own, independent delivery path (task 11.6 acceptance), never routed
 * through `dispatchJourneyEvents`'s `AlertSourcePolicy`/`dedupe_key`
 * mechanism.
 */
export function createInMemoryPulsePromptDeliveryStore(): PulsePromptDeliveryStore {
  const delivered = new Set<string>();

  return {
    async create(reservationRef: string, legRef: string): Promise<void> {
      const key = `${reservationRef}:${legRef}`;
      if (delivered.has(key)) {
        throw new DuplicatePulsePromptDeliveryError(reservationRef, legRef);
      }
      delivered.add(key);
    },
  };
}
