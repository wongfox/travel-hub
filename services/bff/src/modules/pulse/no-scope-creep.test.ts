import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * D4a "No scope creep beyond the single trigger" (spec `experience-pulse`):
 * no other passenger action (FAQ visit, WhatsApp click, help-center use,
 * menu view, etc.) may ever produce a staff alert. This is a structural
 * proof, not a pulse-specific unit test: it scans the entire BFF source tree
 * and asserts that `StaffAlertPort` is referenced ONLY by the pulse module
 * itself, its adapters, and the composition root's wiring — never by any
 * other capability module.
 */

const SRC_ROOT = join(import.meta.dirname, "..", "..");

const ALLOWED_FILE_SUBSTRINGS = [
  "modules/pulse/",
  "adapters/staff-alert/",
  "composition-root.ts",
  "config/go-live-guards.ts",
  "config/go-live-guards.test.ts",
  // Doc comments only (naming the port the adapter-selection env var configures).
  "config/env.ts",
];

function isAllowed(relativePath: string): boolean {
  return ALLOWED_FILE_SUBSTRINGS.some((substring) => relativePath.includes(substring));
}

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("StaffAlertPort scope (D4a no-scope-creep structural proof)", () => {
  it("is referenced only by the pulse module, its adapters, and composition-root/go-live-guards wiring", () => {
    const files = collectSourceFiles(SRC_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const relativePath = relative(SRC_ROOT, file).replace(/\\/g, "/");
      if (isAllowed(relativePath)) continue;

      const content = readFileSync(file, "utf-8");
      if (content.includes("StaffAlertPort")) {
        offenders.push(relativePath);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("sanity check: at least one allowed file DOES reference StaffAlertPort, proving the scan itself works", () => {
    const files = collectSourceFiles(SRC_ROOT);
    const referencingFiles = files
      .map((file) => relative(SRC_ROOT, file).replace(/\\/g, "/"))
      .filter((relativePath) => isAllowed(relativePath))
      .filter((relativePath) => readFileSync(join(SRC_ROOT, relativePath), "utf-8").includes("StaffAlertPort"));

    expect(referencingFiles.length).toBeGreaterThan(0);
  });
});
