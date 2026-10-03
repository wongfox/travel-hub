import { describe, expect, it } from "vitest";
import { createInMemoryPiiAccessAudit } from "./pii-access-audit.js";

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

  it("appends every recorded entry in call order, never overwriting an earlier one", async () => {
    const audit = createInMemoryPiiAccessAudit();

    await audit.record({ actor: "a", action: "unwrap", subjectType: "precheckin_submission", subjectId: "sub-1" });
    await audit.record({ actor: "a", action: "handoff", subjectType: "precheckin_submission", subjectId: "sub-1" });
    await audit.record({ actor: "b", action: "purge", subjectType: "precheckin_submission", subjectId: "sub-2" });

    expect(audit.entries.map((entry) => entry.action)).toEqual(["unwrap", "handoff", "purge"]);
  });
});
