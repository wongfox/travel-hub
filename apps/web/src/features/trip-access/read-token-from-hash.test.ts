import { describe, expect, it } from "vitest";
import { readTokenFromHash } from "./read-token-from-hash.js";

describe("readTokenFromHash", () => {
  it("returns the token when the hash starts with '#'", () => {
    expect(readTokenFromHash("#abc123")).toBe("abc123");
  });

  it("returns the token unchanged when the hash has no leading '#'", () => {
    expect(readTokenFromHash("abc123")).toBe("abc123");
  });

  it("returns null for an empty hash", () => {
    expect(readTokenFromHash("")).toBeNull();
  });

  it("returns null for a hash that is only the '#' character", () => {
    expect(readTokenFromHash("#")).toBeNull();
  });
});
