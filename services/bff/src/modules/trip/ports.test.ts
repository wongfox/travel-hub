import { describe, expect, it } from "vitest";
import { DocumentNotFoundError } from "./ports.js";

describe("DocumentNotFoundError", () => {
  it("names the missing document id in its message and sets a recognizable name", () => {
    const error = new DocumentNotFoundError("DOC-9999");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("DocumentNotFoundError");
    expect(error.message).toContain("DOC-9999");
  });
});
