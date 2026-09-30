import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../api/client.js";
import type { TripDTO } from "contracts";
import { getTrip } from "./get-trip.js";

function buildFakeApiClient(get: ApiClient["get"]): ApiClient {
  return { get, post: vi.fn(), delete: vi.fn() };
}

describe("getTrip", () => {
  it("fetches the trip overview from GET /api/trip", async () => {
    const trip = { linkId: "link-1" } as TripDTO;
    const get = vi.fn().mockResolvedValue(trip);
    const apiClient = buildFakeApiClient(get);

    const result = await getTrip(apiClient);

    expect(get).toHaveBeenCalledWith("/api/trip");
    expect(result).toBe(trip);
  });
});
