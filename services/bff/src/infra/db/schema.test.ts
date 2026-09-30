import { getTableColumns, getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accessLink,
  consentRecord,
  featureFlag,
  piiAccessAudit,
  session,
} from "./schema.js";

describe("access_link table", () => {
  it("is named access_link with the exact column set from the design's data model", () => {
    expect(getTableName(accessLink)).toBe("access_link");
    expect(Object.keys(getTableColumns(accessLink)).sort()).toEqual(
      [
        "id",
        "tokenHash",
        "reservationRef",
        "passengerScope",
        "localeHint",
        "issuedAt",
        "expiresAt",
        "revokedAt",
        "supersededBy",
        "issueChannel",
      ].sort(),
    );
  });

  it("declares id as the primary key and tokenHash as unique and not-null, matching the design", () => {
    const columns = getTableColumns(accessLink);
    expect(columns.id.primary).toBe(true);
    expect(columns.tokenHash.isUnique).toBe(true);
    expect(columns.tokenHash.notNull).toBe(true);
    expect(columns.reservationRef.notNull).toBe(true);
    expect(columns.revokedAt.notNull).toBe(false);
  });
});

describe("session table", () => {
  it("is named session with idHash as primary key and the exact column set", () => {
    expect(getTableName(session)).toBe("session");
    const columns = getTableColumns(session);
    expect(Object.keys(columns).sort()).toEqual(
      ["idHash", "linkId", "createdAt", "lastSeenAt", "expiresAt", "locale", "userAgentClass"].sort(),
    );
    expect(columns.idHash.primary).toBe(true);
    expect(columns.linkId.notNull).toBe(true);
  });
});

describe("consent_record table", () => {
  it("is named consent_record with a purpose enum column and the exact column set", () => {
    expect(getTableName(consentRecord)).toBe("consent_record");
    const columns = getTableColumns(consentRecord);
    expect(Object.keys(columns).sort()).toEqual(
      [
        "id",
        "linkId",
        "reservationRef",
        "passengerRef",
        "purpose",
        "textVersion",
        "granted",
        "recordedAt",
      ].sort(),
    );
    expect(columns.passengerRef.notNull).toBe(false);
    expect(columns.granted.notNull).toBe(true);
  });

  it("restricts purpose to exactly the four consent purposes from the design", () => {
    const columns = getTableColumns(consentRecord);
    const enumValues = columns.purpose.enumValues;
    expect(enumValues).toEqual(["analytics", "push", "pulse", "precheckin_biometric"]);
  });
});

describe("feature_flag table", () => {
  it("is named feature_flag with key as the primary key", () => {
    expect(getTableName(featureFlag)).toBe("feature_flag");
    const columns = getTableColumns(featureFlag);
    expect(Object.keys(columns).sort()).toEqual(
      ["key", "value", "updatedBy", "updatedAt"].sort(),
    );
    expect(columns.key.primary).toBe(true);
    expect(columns.value.notNull).toBe(true);
  });
});

describe("pii_access_audit table", () => {
  it("is named pii_access_audit with the exact append-only audit column set", () => {
    expect(getTableName(piiAccessAudit)).toBe("pii_access_audit");
    const columns = getTableColumns(piiAccessAudit);
    expect(Object.keys(columns).sort()).toEqual(
      ["id", "actor", "action", "subjectType", "subjectId", "at"].sort(),
    );
    expect(columns.actor.notNull).toBe(true);
    expect(columns.action.notNull).toBe(true);
  });
});
