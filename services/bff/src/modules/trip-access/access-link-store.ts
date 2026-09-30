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
}

export function createInMemoryAccessLinkStore(): AccessLinkStore {
  const byTokenHash = new Map<string, AccessLinkRecord>();

  return {
    async create(input: CreateAccessLinkInput): Promise<AccessLinkRecord> {
      const record: AccessLinkRecord = {
        id: randomUUID(),
        tokenHash: input.tokenHash,
        reservationRef: input.reservationRef,
        passengerScope: input.passengerScope,
        issuedAt: new Date().toISOString(),
        expiresAt: input.expiresAt,
        revokedAt: null,
        supersededBy: null,
        issueChannel: input.issueChannel,
      };
      byTokenHash.set(record.tokenHash, record);
      return record;
    },

    async findByTokenHash(tokenHash: string): Promise<AccessLinkRecord | null> {
      return byTokenHash.get(tokenHash) ?? null;
    },

    async findById(id: string): Promise<AccessLinkRecord | null> {
      for (const record of byTokenHash.values()) {
        if (record.id === id) {
          return record;
        }
      }
      return null;
    },

    async findActiveByReservation(reservationRef: string): Promise<AccessLinkRecord[]> {
      return [...byTokenHash.values()].filter(
        (record) => record.reservationRef === reservationRef && record.revokedAt === null,
      );
    },

    async revoke(id: string, supersededBy: string): Promise<void> {
      for (const record of byTokenHash.values()) {
        if (record.id === id) {
          record.revokedAt = new Date().toISOString();
          record.supersededBy = supersededBy;
          return;
        }
      }
    },
  };
}
