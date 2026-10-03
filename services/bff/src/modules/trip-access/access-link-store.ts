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
  };
}
