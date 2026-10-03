import { describe, expect, it } from "vitest";
import { computeImageQuality, type QualityCheckImage } from "./compute-image-quality.js";

/** Builds a `width` x `height` RGBA buffer, filled via `pixel(x, y)`. */
function buildImage(width: number, height: number, pixel: (x: number, y: number) => number): QualityCheckImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = pixel(x, y);
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("computeImageQuality", () => {
  it("accepts a large, high-contrast (sharp), well-exposed checkerboard image", () => {
    const image = buildImage(512, 512, (x, y) => ((x + y) % 2 === 0 ? 40 : 210));

    const result = computeImageQuality(image);

    expect(result).toEqual({ ok: true, reasons: [] });
  });

  it("rejects an image smaller than the minimum resolution", () => {
    const image = buildImage(32, 32, (x, y) => ((x + y) % 2 === 0 ? 40 : 210));

    const result = computeImageQuality(image);

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("low_resolution");
  });

  it("rejects a perfectly flat (blurred/out-of-focus) image via the Laplacian-variance check", () => {
    const image = buildImage(512, 512, () => 128);

    const result = computeImageQuality(image);

    expect(result).toEqual({ ok: false, reasons: ["blurry"] });
  });

  it("rejects an under-exposed (too dark) image", () => {
    const image = buildImage(512, 512, (x, y) => ((x + y) % 2 === 0 ? 0 : 6));

    const result = computeImageQuality(image);

    expect(result).toEqual({ ok: false, reasons: ["poor_exposure"] });
  });

  it("rejects an over-exposed (too bright/glare) image", () => {
    const image = buildImage(512, 512, (x, y) => ((x + y) % 2 === 0 ? 249 : 255));

    const result = computeImageQuality(image);

    expect(result).toEqual({ ok: false, reasons: ["poor_exposure"] });
  });

  it("can report multiple simultaneous reasons (small AND flat AND dark)", () => {
    const image = buildImage(16, 16, () => 5);

    const result = computeImageQuality(image);

    expect(result.ok).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining(["low_resolution", "blurry", "poor_exposure"]),
    );
  });
});
