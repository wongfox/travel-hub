import { describe, expect, it } from "vitest";
import { describePiiAccessAuditContract } from "./pii-access-audit.conformance.js";
import { createInMemoryPiiAccessAudit } from "./pii-access-audit.js";

describePiiAccessAuditContract("in-memory", {
  async make(now) {
    const audit = createInMemoryPiiAccessAudit(now);
    return { audit, readAll: async () => [...audit.entries] };
  },
});

describe("createInMemoryPiiAccessAudit", () => {
  it("records an entry with a generated id and timestamp", async () => {
    const audit = createInMemoryPiiAccessAudit();

    const recorded = await audit.record({
      actor: "worker:precheckin-handoff-job",
      action: "unwrap",
      subjectType: "precheckin_submission",
      subjectId: "sub-1",
    });

    expect(recorded.id).toEqual(expect.any(String));
    expect(recorded.at).toEqual(expect.any(String));
    expect(audit.entries).toEqual([recorded]);
  });
});
