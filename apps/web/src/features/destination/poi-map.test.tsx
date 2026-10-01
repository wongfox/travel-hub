import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PoiMap } from "./poi-map.js";

describe("PoiMap", () => {
  it("renders a single static image element pointing at the content media proxy", () => {
    render(<PoiMap mediaId="MEDIA-POI-MAP" title="Points of interest map" />);

    const img = screen.getByRole("img", { name: "Points of interest map" });
    expect(img).toHaveAttribute("src", "/api/content/media/MEDIA-POI-MAP");
  });

  it("acceptance: renders no live/real-time position data — only a static <img>, no canvas/iframe/script", () => {
    const { container } = render(<PoiMap mediaId="MEDIA-POI-MAP" title="Points of interest map" />);

    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelectorAll("iframe")).toHaveLength(0);
    expect(container.querySelectorAll("canvas")).toHaveLength(0);
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });
});
