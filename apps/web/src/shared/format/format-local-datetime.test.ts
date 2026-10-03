import { describe, expect, it } from "vitest";
import { formatLocalDateTime } from "./format-local-datetime.js";

describe("formatLocalDateTime", () => {
  it("formats a naive local wall-clock string without shifting for the viewer's own timezone", () => {
    const formatted = formatLocalDateTime("2026-11-10T14:30:00", "en-US");

    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/2:30\s*PM/);
  });

  it("formats the same wall-clock value the same way whether or not the string carries a trailing Z", () => {
    const withoutZ = formatLocalDateTime("2026-11-10T14:30:00", "en-US");
    const withZ = formatLocalDateTime("2026-11-10T14:30:00Z", "en-US");

    expect(withoutZ).toBe(withZ);
  });

  it("respects the requested locale", () => {
    const formatted = formatLocalDateTime("2026-11-10T08:00:00", "es-PE");

    expect(formatted).toContain("2026");
  });
});
