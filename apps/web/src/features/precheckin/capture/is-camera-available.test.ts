import { describe, expect, it } from "vitest";
import { isCameraAvailable } from "./is-camera-available.js";

describe("isCameraAvailable", () => {
  it("returns false when no mediaDevices object exists (e.g. an in-app webview that strips it)", () => {
    expect(isCameraAvailable(undefined)).toBe(false);
    expect(isCameraAvailable(null)).toBe(false);
  });

  it("returns false when mediaDevices exists but getUserMedia is not a function", () => {
    expect(isCameraAvailable({})).toBe(false);
  });

  it("returns true when getUserMedia is a function", () => {
    expect(isCameraAvailable({ getUserMedia: async () => ({}) as MediaStream })).toBe(true);
  });
});
