import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../../shared/api/client.js";
import { submitPrecheckin } from "./submit-precheckin.js";

describe("submitPrecheckin (task 8.3 client)", () => {
  it("POSTs multipart photo, id_front, docType and consentRecordId to the passenger's ordinal", async () => {
    const post = vi.fn().mockResolvedValue({ passengerOrdinal: 2, status: "received" });
    const apiClient = { get: vi.fn(), post, delete: vi.fn() } as ApiClient;
    const photo = new Blob(["p"], { type: "image/jpeg" });
    const idFront = new Blob(["i"], { type: "image/jpeg" });

    const result = await submitPrecheckin(apiClient, {
      passengerOrdinal: 2,
      docType: "PASSPORT",
      consentRecordId: "consent-1",
      photo,
      idFront,
    });

    expect(result).toEqual({ passengerOrdinal: 2, status: "received" });
    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0]!;
    expect(path).toBe("/api/precheckin/2");
    expect(body).toBeInstanceOf(FormData);
    const form = body as FormData;
    expect(form.get("docType")).toBe("PASSPORT");
    expect(form.get("consentRecordId")).toBe("consent-1");
    expect((form.get("photo") as File).size).toBe(1);
    expect((form.get("id_front") as File).size).toBe(1);
    expect(form.has("id_back")).toBe(false);
  });
});
