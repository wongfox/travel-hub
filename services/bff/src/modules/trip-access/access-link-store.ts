import { randomUUID } from "node:crypto";

/**
 * Persisted shape of one `access_link` row (design's Data Model /
 * `services/bff/src/infra/db/schema.ts`, task 3.3). Modeled as a small port
 * so issuance/resolution logic can be unit tested deterministically
 * (`createInMemoryAccessLinkStore`) without a live Postgres instance — same
 * convention established by `infra/queue/queue-client.ts` (task 3.4). A
 * Drizzle-backed adapter over the existing `accessLink` table lands once a
 * consumer needs it against a live database (session exchange, WU8).
 */
export interface AccessLinkRecord {
  id: string;
  tokenHash: string;
  reservationRef: string;
  /** Empty array means "all passengers on the reservation" per the design. */
  passengerScope: string[];
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  supersededBy: string | null;
  issueChannel: string;
}

export interface CreateAccessLinkInput {
  tokenHash: string;
  reservationRef: string;
  passengerScope: string[];
  expiresAt: string;
  issueChannel: string;
}

export interface AccessLinkStore {
  create(input: CreateAccessLinkInput): Promise<AccessLinkRecord>;
  findByTokenHash(tokenHash: string): Promise<AccessLinkRecord | null>;
  /**
   * Looks up a link by its own id rather than its token hash. Needed by
   * capability modules (e.g. `trip`, task 6.2) that only know a session's
   * `linkId` (design's `session.link_id` foreign key) and must resolve it
   * back to the link's `reservationRef`/`passengerScope` without ever
   * touching the raw token.
   */
  findById(id: string): Promise<AccessLinkRecord | null>;
  /**
   * Every not-yet-revoked link currently issued for a reservation. Used by
   * the reissue use case (task 5.4) to find which previous links must be
   * superseded when a new one is issued.
   */
  findActiveByReservation(reservationRef: string): Promise<AccessLinkRecord[]>;
  /** Marks a link revoked, recording which link superseded it (design Decision 4: "Re-issued link invalidates the previous one"). */
  revoke(id: string, supersededBy: string): Promise<void>;
  /**
   * Every not-yet-revoked link across all reservations (task 11.2's journey
   * polling adapter: the worker only needs to check reservations that still
   * have a live access link, not every reservation SIR has ever seen).
   * Expiry is deliberately not filtered here — the same convention as
   * `findActiveByReservation`, which only checks `revokedAt` — so a caller
   * that cares about expiry filters it itself from `expiresAt`.
   */
  listActive(): Promise<AccessLinkRecord[]>;
  /**
   * Reissue invalidation (design Decision 4: "Re-issued link invalidates the
   * previous one"). Keeps only the NEWEST (by insertion order) not-yet-revoked
   * link of the reservation and revokes every other active one with
   * `supersededBy` = that newest link, atomically; returns the links THIS call
   * revoked (each link is revoked by exactly one caller, so the caller can
   * delete its push subscriptions once). Idempotent. Two reissues racing each
   * other converge to exactly one active link, whatever the interleaving.
   */
  supersedeOlderActive(reservationRef: string): Promise<AccessLinkRecord[]>;
}

export function createInMemoryAccessLinkStore(now: () => Date = () => new Date()): AccessLinkStore {
  /** Insertion order is the "newest wins" order (mirrors `access_link.seq`). */
  const links: AccessLinkRecord[] = [];

  const copy = (record: AccessLinkRecord): AccessLinkRecord => ({
    ...record,
    passengerScope: [...record.passengerScope],
  });
  const isActive = (record: AccessLinkRecord): boolean => record.revokedAt === null;

  return {
    async create(input: CreateAccessLinkInput): Promise<AccessLinkRecord> {
      if (links.some((link) => link.tokenHash === input.tokenHash)) {
        throw new Error("access link token hash already exists");
      }
      const record: AccessLinkRecord = {
        id: randomUUID(),
        tokenHash: input.tokenHash,
        reservationRef: input.reservationRef,
        passengerScope: [...input.passengerScope],
        issuedAt: now().toISOString(),
        expiresAt: input.expiresAt,
        revokedAt: null,
        supersededBy: null,
        issueChannel: input.issueChannel,
      };
      links.push(record);
      return copy(record);
    },

    async findByTokenHash(tokenHash: string): Promise<AccessLinkRecord | null> {
      const record = links.find((link) => link.tokenHash === tokenHash);
      return record ? copy(record) : null;
    },

    async findById(id: string): Promise<AccessLinkRecord | null> {
      const record = links.find((link) => link.id === id);
      return record ? copy(record) : null;
    },

    async findActiveByReservation(reservationRef: string): Promise<AccessLinkRecord[]> {
      return links.filter((link) => link.reservationRef === reservationRef && isActive(link)).map(copy);
    },

    async revoke(id: string, supersededBy: string): Promise<void> {
      const record = links.find((link) => link.id === id);
      if (record && isActive(record)) {
        record.revokedAt = now().toISOString();
        record.supersededBy = supersededBy;
      }
    },

    async listActive(): Promise<AccessLinkRecord[]> {
      return links.filter(isActive).map(copy);
    },

    async supersedeOlderActive(reservationRef: string): Promise<AccessLinkRecord[]> {
      const active = links.filter((link) => link.reservationRef === reservationRef && isActive(link));
      const newest = active[active.length - 1];
      if (!newest) return [];
      const revoked: AccessLinkRecord[] = [];
      for (const record of active) {
        if (record === newest) continue;
        record.revokedAt = now().toISOString();
        record.supersededBy = newest.id;
        revoked.push(copy(record));
      }
      return revoked;
    },
  };
}
