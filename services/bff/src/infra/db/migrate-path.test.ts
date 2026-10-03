import { describe, expect, it } from "vitest";
import { resolveMigrationsFolder } from "./migrate.js";

describe("resolveMigrationsFolder", () => {
  it("resolves next to the module when running from src", () => {
    expect(resolveMigrationsFolder("/app/src/infra/db")).toBe("/app/src/infra/db/migrations");
  });

  it("resolves back to src/ when running from the compiled dist", () => {
    expect(resolveMigrationsFolder("/app/dist/infra/db")).toBe("/app/src/infra/db/migrations");
  });
});
